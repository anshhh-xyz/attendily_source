const geminiKey = Deno.env.get("GEMINI_API_KEY")!;

const PROMPT = `You are reading a college timetable image. Extract every class slot you can see.
Return ONLY a JSON array, no prose, no markdown fences. Each item must look like:
{"subject_name": "string", "type": "theory" or "lab", "day_of_week": 0-6 (0=Sunday), "start_time": "HH:MM" in 24hr, "end_time": "HH:MM" in 24hr}
If a cell spans a lab block, mark type as "lab". If you cannot read a cell confidently, skip it rather than guessing.`;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  const { image_base64, mime_type } = await req.json();
  if (!image_base64 || !mime_type) {
    return new Response(JSON.stringify({ error: "image_base64 and mime_type required" }), { status: 400 });
  }

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type, data: image_base64 } }
          ]
        }],
        generationConfig: { temperature: 0.1 }
      })
    }
  );

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    return new Response(JSON.stringify({ error: "Gemini request failed", detail: errText }), { status: 502 });
  }

  const geminiData = await geminiRes.json();
  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
  const cleaned = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return new Response(JSON.stringify({ error: "Could not parse model output", raw: rawText }), { status: 502 });
  }

  return new Response(JSON.stringify({ classes: parsed }), {
    headers: { "Content-Type": "application/json" }
  });
});
