const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildPrompt(groupPreference?: string): string {
  let groupInstruction = "";
  if (groupPreference && groupPreference !== "all") {
    const groupName = groupPreference === "group_1" ? "Group 1 / Batch A (1st Group)" :
                      groupPreference === "group_2" ? "Group 2 / Batch B (2nd Group)" :
                      groupPreference === "group_3" ? "Group 3 / Batch C (3rd Group)" :
                      groupPreference === "group_4" ? "Group 4 / Batch D (4th Group)" :
                      `"${groupPreference}"`;

    groupInstruction = `
- TARGET STUDENT GROUP: ${groupName}

- WEEKLY LAB ROTATION & GROUP MAPPING RULES:
  1. EACH LAB SUBJECT OCCURS ONLY ONCE PER WEEK: In college timetables, each practical lab course (e.g. "Computational Methods Lab", "Data Structures Lab", "OOP Lab", "Digital Logic Lab") is attended by a student group EXACTLY ONCE per week.
  2. ROTATION ACROSS DAYS: Different groups take the same lab on different days of the week.
     - Example: If "Computational Methods Lab" appears on Monday (for Group 1), on Thursday (for Group 3), and on Friday (for Group 2):
       * For Group 1: Parse it ONLY on Monday. Do NOT parse it on Thursday or Friday (Friday is a free period / off for Group 1).
       * For Group 2: Parse it ONLY on Friday. Do NOT parse it on Monday or Thursday.
       * For Group 3: Parse it ONLY on Thursday. Do NOT parse it on Monday or Friday.
  3. PARTIALLY FILLED CELLS: If a cell only lists 2 groups (e.g. Group 2 and Group 3), and the student is in Group 1, Group 1 has NO class during that slot — do NOT pick either row for Group 1.
  4. NO DUPLICATE LABS IN A WEEK: Never output the same lab subject on multiple days for the same student group.`;
  }

  return `You are an expert college timetable analyzer reading a schedule image. Parse every class slot for the target student.
Return ONLY a valid JSON array, no prose, no markdown fences. Each item must look like:
{"subject_name": "string", "type": "theory" or "lab", "day_of_week": 1-6 (1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday), "start_time": "HH:MM" in 24hr, "end_time": "HH:MM" in 24hr}
If a cell spans a lab block (usually 2 or 3 hours/periods), mark type as "lab". If you cannot read a cell confidently, skip it rather than guessing.

CRITICAL RULES:
1. FULL-CLASS COMMON LECTURES: Regular theory lectures (e.g. Discrete Mathematics, Digital Logic theory) where the entire section attends together MUST be parsed on all days they appear.
2. FREE PERIODS & EMPTY SLOTS: When a student's group has no lab on a given day/slot, leave that slot completely empty. Never assign another group's lab to this student.${groupInstruction}`;
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
