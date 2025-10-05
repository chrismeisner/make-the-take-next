import { getToken } from "next-auth/jwt";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const { raw, model: requestModel, context = "", includeSummary = false } = req.body || {};
    if (!raw || typeof raw !== "string") {
      return res.status(400).json({ success: false, error: "Missing raw" });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ success: false, error: "OPENAI_API_KEY not configured" });
    }

    const model = (typeof requestModel === "string" && requestModel.trim()) || (process.env.OPENAI_DEFAULT_MODEL || "gpt-5-mini");

    const system = [
      "You are an assistant that converts free-form sports betting proposition ideas into a strict JSON schema used by our app.",
      "Only return JSON. No explanations.",
      "Return EXACTLY these keys (no extras):",
      '{"propShort":"","propSummary":"","PropSideAShort":"","PropSideBShort":"","PropSideATake":"","PropSideBTake":"","PropSideAMoneyline":null,"PropSideBMoneyline":null,"propStatus":"open","eventId":null,"packId":null}',
      "Rules:",
      "- Strings must be strings. Moneylines must be integers or null.",
      "- Use American moneyline integers if provided (e.g., -130, 115).",
      "- Infer concise side labels (e.g., 'Over'/'Under' or team/player).",
      "- 'propShort' must be a concise, natural-language question (not a fragment), under 80 chars.",
      "- Examples of propShort: 'Will A.J. Brown record over 64.5 receiving yards in the game?', 'How many strikeouts does Cristopher Sanchez record?', 'Does Kyle Schwarber hit a Home Run?'.",
      "- 'propSummary' should be 1–2 sentences if requested by includeSummary; otherwise return an empty string.",
      "- 'propSummary' style examples: 'Rodgers (447 yds, 5 TD) leads favored Steelers vs. Maye’s surging Patriots, who miss CB Gonzalez but boast offensive momentum.'",
      "  'Strider (6–13, 4.64 ERA) faces Mize (14–5, 3.88) as surging Braves seek eighth straight vs. slumping, desperate Tigers.'",
      "  'Webb (3.21 ERA, 181 K) faces Miller (3.88 ERA, 152 K) as Giants (78–70) chase a Wild Card spot against division-leading Dodgers (92–56) in a crucial NL West clash.'",
      "- 'PropSideATake' and 'PropSideBTake' must be short imperative statements (e.g., 'Cristopher Sanchez throws 7+ strikeouts', 'Jose Ramirez hits a home run', 'Cleveland Guardians beat the Detroit Tigers', 'Kyle Schwarber hits a HR').",
    ].join("\n");

    const userContent = [
      "RAW PROPOSITION INPUT:",
      raw,
      context ? `\nADDITIONAL CONTEXT:\n${context}` : "",
      includeSummary ? "\nWrite a propSummary in the style of the provided examples." : "\nReturn an empty string for propSummary.",
      "\nReturn a single JSON object conforming to the schema.",
    ].join("\n");

    const payload = {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      n: 1,
    };
    if (model.startsWith("gpt-5")) {
      payload.max_completion_tokens = 300;
    } else {
      payload.max_tokens = 300;
      payload.temperature = 0.2;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ success: false, error: `OpenAI API error: ${err}` });
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || "";
    let parsed;
    try {
      // Trim fence/backticks if present and parse JSON
      const trimmed = text.trim().replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
      parsed = JSON.parse(trimmed);
    } catch (e) {
      // Non-JSON: return fixed schema with blanks so UI fields exist
      const formatted = {
        propShort: "",
        propSummary: "",
        PropSideAShort: "",
        PropSideBShort: "",
        PropSideAMoneyline: null,
        PropSideBMoneyline: null,
        propStatus: "open",
        eventId: null,
        packId: null,
      };
      return res.status(200).json({ success: true, model, formatted, rawText: text, warning: "Non-JSON response" });
    }

    // Basic normalization and ensure all keys are present
    // Normalize propShort server-side to ensure natural-language question
    const toQuestion = (val) => {
      try {
        const s = String(val || '').trim();
        if (!s) return '';
        if (/\?$/.test(s)) return s;
        if (/^(how|what|who|which|will|does|do|is|are|can|should|could|would|did|has|have|had)\b/i.test(s)) {
          return `${s}?`;
        }
        const withoutWill = s.replace(/^\s*will\s+/i, '');
        return `Will ${withoutWill}?`;
      } catch { return String(val || ''); }
    };

    const formatted = {
      propShort: toQuestion(String(parsed?.propShort ?? "")).slice(0, 120),
      propSummary: includeSummary ? String(parsed?.propSummary ?? "").slice(0, 500) : "",
      PropSideAShort: String(parsed?.PropSideAShort ?? parsed?.sideA ?? "").slice(0, 120),
      PropSideBShort: String(parsed?.PropSideBShort ?? parsed?.sideB ?? "").slice(0, 120),
      PropSideATake: String(parsed?.PropSideATake ?? "").slice(0, 180),
      PropSideBTake: String(parsed?.PropSideBTake ?? "").slice(0, 180),
      PropSideAMoneyline: Number.isFinite(parseInt(parsed?.PropSideAMoneyline, 10)) ? parseInt(parsed.PropSideAMoneyline, 10) : null,
      PropSideBMoneyline: Number.isFinite(parseInt(parsed?.PropSideBMoneyline, 10)) ? parseInt(parsed.PropSideBMoneyline, 10) : null,
      propStatus: (parsed?.propStatus && typeof parsed.propStatus === "string") ? parsed.propStatus : "open",
      eventId: parsed?.eventId ? String(parsed.eventId) : null,
      packId: parsed?.packId ? String(parsed.packId) : null,
    };

    return res.status(200).json({ success: true, model, formatted, rawText: text });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || "Server error" });
  }
}


