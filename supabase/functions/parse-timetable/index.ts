const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROMPT = `You are reading a college timetable image. Extract every class slot you can see.
Return ONLY a JSON array, no prose, no markdown fences. Each item must look like:
{"subject_name": "string", "type": "theory" or "lab", "day_of_week": 1-6 (1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday), "start_time": "HH:MM" in 24hr, "end_time": "HH:MM" in 24hr}
If a cell spans a lab block, mark type as "lab". If you cannot read a cell confidently, skip it rather than guessing.`;

async function callGemini(apiKey: string, model: string, mimeType: string, base64Data: string) {
  console.log(`calling model: ${model}`);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }],
        generationConfig: { temperature: 0.1 }
      })
    }
  );
  console.log(`model ${model} responded with status ${res.status}`);
  return res;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY is missing in Supabase Edge Function secrets." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { image_base64, mime_type } = await req.json();
    if (!image_base64 || !mime_type) {
      return new Response(
        JSON.stringify({ error: "image_base64 and mime_type are required." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let geminiRes = await callGemini(geminiKey, "gemini-3.5-flash-lite", mime_type, image_base64);

    if (!geminiRes.ok) {
      geminiRes = await callGemini(geminiKey, "gemini-2.5-flash", mime_type, image_base64);
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.log(`final error body: ${errText}`);
      let msg = "Gemini API request failed.";
      try {
        const parsedErr = JSON.parse(errText);
        if (parsedErr.error && parsedErr.error.message) {
          msg = parsedErr.error.message;
        }
      } catch (_) { }

      if (geminiRes.status === 429) {
        msg = "Gemini API Quota Exceeded (HTTP 429): Google free-tier rate limit reached. Please wait ~40 seconds before retrying.";
      }

      return new Response(
        JSON.stringify({ error: msg }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
    const cleaned = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: "Could not parse Gemini output into timetable JSON.", raw: rawText }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ classes: parsed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message || "Failed to process request" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});