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
      useWebSearch = false,
      allowed_domains,
      user_location,
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

    // If web search is requested, use Responses API with web_search tool
    const response = await (async () => {
      if (useWebSearch) {
        // Enforce web-search-supported models only
        const allowed = new Set(['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini']);
        const chosenModel = allowed.has(String(model)) ? model : (process.env.OPENAI_DEFAULT_MODEL || 'gpt-4.1');
        const responsesPayload = {
          model: chosenModel,
          input: userContent,
          tools: [ { type: 'web_search' } ],
          include: ['web_search_call.action.sources']
        };
        // Responses API uses max_output_tokens; cap at 128000 and respect user input
        const requested = Number.isFinite(Number(max_tokens)) ? Number(max_tokens) : 150;
        responsesPayload.max_output_tokens = Math.max(1, Math.min(128000, requested));
        // Temperature is supported for responses API
        if (typeof temperature === 'number') responsesPayload.temperature = temperature;
        // Domain filtering (allow-list)
        if (Array.isArray(allowed_domains) && allowed_domains.length > 0) {
          responsesPayload.tools[0].filters = { allowed_domains: allowed_domains.slice(0, 20) };
        }
        // Optional approximate user location
        if (user_location && typeof user_location === 'object') {
          responsesPayload.tools[0].user_location = { type: 'approximate', ...user_location };
        }
        try {
          console.log('[testAI] Using Responses API with web_search');
        } catch {}
        return await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify(responsesPayload),
        });
      }
      // Fallback to Chat Completions when web search is not requested
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
      if (!isGpt5Family && typeof temperature === "number") payload.temperature = temperature;
      try {
        console.log("[testAI] Outgoing OpenAI payload", {
          model: payload.model,
          has_temperature: Object.prototype.hasOwnProperty.call(payload, "temperature"),
          token_param: isGpt5Family ? 'max_completion_tokens' : 'max_tokens',
          token_value: isGpt5Family ? payload.max_completion_tokens : payload.max_tokens,
        });
      } catch {}
      return await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
    })();

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

    function extractTextFromResponses(payload) {
      try {
        if (typeof payload?.output_text === 'string') {
          return payload.output_text.trim();
        }
        const output = payload?.output;
        if (Array.isArray(output)) {
          const parts = [];
          for (const item of output) {
            const content = item?.content;
            if (Array.isArray(content)) {
              for (const c of content) {
                if (typeof c?.text === 'string') parts.push(c.text);
                else if (typeof c?.value === 'string') parts.push(c.value);
              }
            }
          }
          const text = parts.join('').trim();
          if (text) return text;
        }
        // Some responses may include a messages-like structure
        const msgText = payload?.message?.content;
        if (typeof msgText === 'string') return msgText.trim();
        return '';
      } catch { return ''; }
    }

    function extractCitationsFromResponses(payload) {
      const citations = [];
      try {
        const output = payload?.output;
        if (!Array.isArray(output)) return citations;
        for (const item of output) {
          if (item?.type === 'message' && Array.isArray(item?.content)) {
            for (const c of item.content) {
              const annotations = c?.annotations;
              if (Array.isArray(annotations)) {
                for (const ann of annotations) {
                  if (ann?.type === 'url_citation' && ann?.url) {
                    citations.push({ url: ann.url, title: ann.title || ann.url });
                  }
                }
              }
            }
          }
        }
      } catch {}
      return citations;
    }

    function extractSourcesFromResponses(payload) {
      const sources = [];
      try {
        const output = payload?.output;
        if (!Array.isArray(output)) return sources;
        for (const item of output) {
          if (item?.type === 'web_search_call') {
            const action = item?.action;
            const srcs = action?.sources;
            if (Array.isArray(srcs)) {
              for (const s of srcs) {
                if (s?.url) sources.push({ url: s.url, title: s.title || s.url });
              }
            }
          }
        }
      } catch {}
      return sources;
    }

    let summary = useWebSearch ? extractTextFromResponses(data) : extractTextFromChatCompletion(data);
    const citations = useWebSearch ? extractCitationsFromResponses(data) : [];
    const sources = useWebSearch ? extractSourcesFromResponses(data) : [];
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

    return res.status(200).json({ success: true, summary, model, citations, sources, raw: data, ...usage });
  } catch (err) {
    console.error("/api/admin/testAI error", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}


