const OPENAI_BASE = "https://api.openai.com/v1";

function getHeaders() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  };
}

export async function pingOpenAI() {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: getHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
        temperature: 0,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI ping failed: ${response.status}`);
    return { ok: true, model };
  } finally {
    clearTimeout(timer);
  }
}

export async function generateText(system: string, user: string) {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: getHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!response.ok) throw new Error(`OpenAI call failed: ${response.status}`);
    const json = (await response.json()) as any;
    return json.choices?.[0]?.message?.content?.trim() || "";
  } finally {
    clearTimeout(timer);
  }
}
