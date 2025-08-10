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
    const {
      prompt,
      context = "",
      model = "gpt-3.5-turbo",
      temperature = 0.7,
      max_tokens,
    } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ success: false, error: "Missing prompt" });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ success: false, error: "OPENAI_API_KEY not configured" });
    }

    const userContent = context
      ? `${prompt}\n\nAdditional context to use:\n${context}`
      : prompt;

    const messages = [
      { role: "system", content: "You are a sports expert who gives informative and accurate information about sporting events." },
      { role: "user", content: userContent },
    ];

    // Server logs: inputs (sanitized)
    try {
      console.log("[testAI] Incoming request", {
        model,
        temperature,
        max_completion_tokens,
        legacy_max_tokens: max_tokens,
        prompt_length: prompt?.length || 0,
        context_length: context?.length || 0,
      });
    } catch {}

    // Some GPT-5 variants only allow default temperature; omit it to avoid errors
    const isGpt5Family = typeof model === "string" && model.startsWith("gpt-5");
    // Known issue: some gpt-5-mini variants emit empty text with long prompts; reduce tokens and simplify
    const likelyMini = isGpt5Family && model.includes("mini");
    const effectiveMaxTokens = (typeof max_tokens === "number" ? max_tokens : 150);

    const payload = {
      model,
      messages: likelyMini ? [
        { role: "system", content: "Return a single concise English sentence." },
        { role: "user", content: context ? `${prompt}\n\nContext:\n${context}` : prompt },
      ] : messages,
      n: 1,
    };
    if (isGpt5Family) {
      payload.max_completion_tokens = likelyMini ? Math.min(80, effectiveMaxTokens || 80) : effectiveMaxTokens;
    } else {
      payload.max_tokens = likelyMini ? Math.min(80, effectiveMaxTokens || 80) : effectiveMaxTokens;
    }
    // Only include temperature for non-GPT-5 models
    if (!isGpt5Family && typeof temperature === "number") payload.temperature = temperature;

    try {
      console.log("[testAI] Outgoing OpenAI payload", {
        model: payload.model,
        has_temperature: Object.prototype.hasOwnProperty.call(payload, "temperature"),
        token_param: isGpt5Family ? 'max_completion_tokens' : 'max_tokens',
        token_value: isGpt5Family ? payload.max_completion_tokens : payload.max_tokens,
      });
    } catch {}

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      try {
        console.error("[testAI] OpenAI error", { status: response.status, body: errText });
      } catch {}
      return res
        .status(response.status)
        .json({ success: false, error: `OpenAI error: ${errText}` });
    }

    const data = await response.json();

    // Try to robustly extract assistant text across possible shapes
    function extractTextFromChatCompletion(payload) {
      try {
        const choice = payload?.choices?.[0];
        if (!choice) return "";
        // Standard chat.completions string content
        const content = choice?.message?.content;
        if (typeof content === "string") {
          return content.trim();
        }
        // Some models may return an array of content parts
        if (Array.isArray(content)) {
          const text = content
            .map((part) => {
              if (!part) return "";
              if (typeof part === "string") return part;
              if (typeof part?.text === "string") return part.text;
              if (part?.type === "text" && typeof part?.value === "string") return part.value;
              return "";
            })
            .join("");
          return text.trim();
        }
        // Rare alt: choice.text (legacy)
        if (typeof choice?.text === "string") {
          return choice.text.trim();
        }
        return "";
      } catch {
        return "";
      }
    }

    let summary = extractTextFromChatCompletion(data);
    const usage = data?.usage || {};
    try {
      console.log("[testAI] OpenAI success", {
        model,
        total_tokens: usage.total_tokens,
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        summary_preview: (summary || "").slice(0, 160),
        has_choices: Array.isArray(data?.choices),
        message_content_type: typeof data?.choices?.[0]?.message?.content,
      });
    } catch {}

    // Fallback: if empty completion, retry once with simplified prompt
    if (!summary || summary.length === 0) {
      const simpleMessages = [
        { role: "system", content: "Return a single concise English sentence." },
        { role: "user", content: context ? `${prompt}\n\nContext:\n${context}` : prompt },
      ];
      const retryPayload = {
        model,
        messages: simpleMessages,
        n: 1,
      };
      if (isGpt5Family) {
        retryPayload.max_completion_tokens = Math.min(60, effectiveMaxTokens || 60);
      } else {
        retryPayload.max_tokens = Math.min(60, effectiveMaxTokens || 60);
      }
      const retryResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify(retryPayload),
      });
      if (retryResp.ok) {
        const retryData = await retryResp.json();
        summary = extractTextFromChatCompletion(retryData);
        try { console.log("[testAI] Retry summary preview", (summary || "").slice(0, 160)); } catch {}
      } else {
        try { console.error("[testAI] Retry failed", await retryResp.text()); } catch {}
      }
    }

    return res.status(200).json({ success: true, summary, model, raw: data, ...usage });
  } catch (err) {
    console.error("/api/admin/testAI error", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}


