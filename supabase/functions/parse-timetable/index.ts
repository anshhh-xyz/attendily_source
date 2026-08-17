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
- TARGET STUDENT: ${groupName}

CRITICAL LAB ROTATION & DEDUPLICATION ALGORITHM:
1. STRICT ONCE-PER-WEEK RULE: A student attends each lab subject (e.g. "Data Structures Lab", "Computational Methods Lab", "OOP Lab", "Digital Logic Lab") EXACTLY ONCE per week. NEVER output the same lab subject on two different days.
2. ROTATION MAPPING:
   - If Group 1 has "Computational Methods Lab" on Monday (1:40-3:20), and "Data Structures Lab" on Tuesday (11:30-1:10), then on Friday (9:50-11:30) the cell contains Group 2 and Group 3's labs. Group 1 has NO lab on Friday! LEAVE FRIDAY 9:50-11:30 EMPTY for Group 1.
   - If a cell contains labs for other groups (e.g. Group 2 or Group 3), and the target student has already taken or will take that lab on another day, DO NOT output any lab for that cell.
3. OUTPUT ONLY 1 INSTANCE PER LAB COURSE: The final JSON must have at most ONE entry for each unique lab course in the entire week.`;
  }

  return `You are an expert college timetable analyzer. Parse all classes for the target student.
Return ONLY a valid JSON array, no markdown fences, no explanatory text. Each item must look like:
{"subject_name": "string", "type": "theory" or "lab", "day_of_week": 1-6 (1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday), "start_time": "HH:MM" in 24hr, "end_time": "HH:MM" in 24hr}

CRITICAL RULES:
1. THEORY LECTURES: Regular full-class theory lectures must be parsed on all days they appear.
2. LAB CONSTRAINTS:${groupInstruction}`;
}

function deduplicateLabsForGroup(classes: any[]): any[] {
  if (!Array.isArray(classes)) return [];
  const seenLabs = new Set<string>();
  const filtered: any[] = [];

  for (const item of classes) {
    if (!item || !item.subject_name) continue;
    const isLab = (item.type || '').toLowerCase() === 'lab' || item.subject_name.toLowerCase().includes('lab');
    
    if (isLab) {
      // Normalize lab name (e.g. "data structures lab", "computational methods lab")
      const normName = item.subject_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seenLabs.has(normName)) {
        // Skip duplicate lab occurring on another day in the same week
        console.log(`Skipping duplicate lab in week: ${item.subject_name} on day ${item.day_of_week}`);
        continue;
      }
      seenLabs.add(normName);
    }
    filtered.push(item);
  }
  return filtered;
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
    let parsed = JSON.parse(cleaned);

    // Apply strict deduplication if group preference is selected
    if (group_preference && group_preference !== "all") {
      parsed = deduplicateLabsForGroup(parsed);
    }

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
