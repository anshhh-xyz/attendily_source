const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildPrompt(groupPreference?: string): string {
  let groupInstruction = "";
  if (groupPreference && groupPreference !== "all") {
    if (groupPreference === "group_1") {
      groupInstruction = "\n- LAB GROUP / BATCH FILTER: If a time slot cell is split into multiple parallel groups/sub-batches (e.g. Group 1, Group 2, Group 3 or multiple stacked lines/teachers), parse ONLY the 1st / top listed group (Group 1 / Batch A) and skip other parallel groups for that slot. However, for any regular lecture or single-batch class that is NOT split, ALWAYS parse it normally.";
    } else if (groupPreference === "group_2") {
      groupInstruction = "\n- LAB GROUP / BATCH FILTER: If a time slot cell is split into multiple parallel groups/sub-batches (e.g. Group 1, Group 2, Group 3 or multiple stacked lines/teachers), parse ONLY the 2nd / middle listed group (Group 2 / Batch B) and skip other parallel groups for that slot. However, for any regular lecture or single-batch class that is NOT split, ALWAYS parse it normally.";
    } else if (groupPreference === "group_3") {
      groupInstruction = "\n- LAB GROUP / BATCH FILTER: If a time slot cell is split into multiple parallel groups/sub-batches (e.g. Group 1, Group 2, Group 3 or multiple stacked lines/teachers), parse ONLY the 3rd listed group (Group 3 / Batch C) and skip other parallel groups for that slot. However, for any regular lecture or single-batch class that is NOT split, ALWAYS parse it normally.";
    } else if (groupPreference === "group_4") {
      groupInstruction = "\n- LAB GROUP / BATCH FILTER: If a time slot cell is split into multiple parallel groups/sub-batches, parse ONLY the 4th listed group (Group 4 / Batch D) and skip other parallel groups for that slot. However, for any regular lecture or single-batch class that is NOT split, ALWAYS parse it normally.";
    } else {
      groupInstruction = `\n- LAB GROUP / BATCH FILTER: The student is in: "${groupPreference}". If a cell is split across multiple parallel batches/teachers/groups, parse ONLY the class matching "${groupPreference}". However, for any regular lecture or single-batch class that is NOT split, ALWAYS parse it normally.`;
    }
  }

  return `You are reading a college timetable image. Read and parse every class slot for the student.
Return ONLY a valid JSON array, no prose, no markdown fences. Each item must look like:
{"subject_name": "string", "type": "theory" or "lab", "day_of_week": 1-6 (1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday), "start_time": "HH:MM" in 24hr, "end_time": "HH:MM" in 24hr}
If a cell spans a lab block, mark type as "lab". If you cannot read a cell confidently, skip it rather than guessing.
CRITICAL UNIVERSAL RULE: Never drop regular full-class lectures or single-batch classes. If a cell or the entire timetable is for a single batch with no internal splits, ALWAYS parse all classes normally without dropping anything.${groupInstruction}`;
}

async function callGemini(apiKey: string, model: string, mimeType: string, base64Data: string, promptText: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: promptText },
          { inline_data: { mime_type: mimeType, data: base64Data } }
        ]
      }]
    })
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY is missing in Supabase Edge Function secrets." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { image_base64, mime_type, group_preference } = await req.json();
    if (!image_base64 || !mime_type) {
      return new Response(
        JSON.stringify({ error: "image_base64 and mime_type are required." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const promptText = buildPrompt(group_preference);
    let geminiRes = await callGemini(geminiKey, "gemini-3.5-flash-lite", mime_type, image_base64, promptText);

    if (!geminiRes.ok) {
      geminiRes = await callGemini(geminiKey, "gemini-2.5-flash", mime_type, image_base64, promptText);
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

    const data = await geminiRes.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
    const cleaned = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return new Response(
      JSON.stringify({ classes: parsed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message ?? "Internal server error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
