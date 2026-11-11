const XAI_CHAT_COMPLETIONS_URL = "https://api.x.ai/v1/chat/completions";

/** Prefer GROK_API_KEY, then XAI_API_KEY (xAI's documented env name). */
export function getGrokApiKey(): string | null {
  const key =
    process.env.GROK_API_KEY?.trim() || process.env.XAI_API_KEY?.trim() || "";
  return key || null;
}

export function getGrokModel(): string {
  return (
    process.env.GROK_MODEL?.trim() ||
    process.env.XAI_MODEL?.trim() ||
    // Current Grok chat model; override with GROK_MODEL / XAI_MODEL if needed.
    "grok-4"
  );
}

export function formatGrokProviderError(detail: string): string {
  const lower = detail.toLowerCase();
  if (
    lower.includes("incorrect api key") ||
    lower.includes("invalid_api_key") ||
    lower.includes("invalid api key") ||
    lower.includes("unauthorized")
  ) {
    return "GROK_API_KEY / XAI_API_KEY is invalid. Update the secret and retry.";
  }
  if (
    lower.includes("credit") ||
    lower.includes("quota") ||
    lower.includes("billing") ||
    lower.includes("insufficient")
  ) {
    return "Grok/xAI billing or quota blocked this request. Check console.x.ai billing, then retry.";
  }
  return detail;
}

export async function callGrokChatCompletions(body: Record<string, unknown>): Promise<{
  ok: boolean;
  status: number;
  data: unknown;
  errorDetail: string | null;
}> {
  const apiKey = getGrokApiKey();
  if (!apiKey) {
    return {
      ok: false,
      status: 0,
      data: null,
      errorDetail: "GROK_API_KEY or XAI_API_KEY is not set in this runtime.",
    };
  }

  try {
    const response = await fetch(XAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const rawText = await response.text().catch(() => "");
    let data: unknown = null;
    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = rawText;
      }
    }

    if (!response.ok) {
      let detail = `Grok/xAI HTTP ${response.status}`;
      if (data && typeof data === "object") {
        const err = (data as { error?: { message?: string; code?: string } })
          .error;
        if (err?.message) {
          detail = err.message;
          if (err.code) detail += ` (${err.code})`;
        }
      } else if (typeof data === "string" && data) {
        detail = data.slice(0, 300);
      }
      return {
        ok: false,
        status: response.status,
        data,
        errorDetail: formatGrokProviderError(detail),
      };
    }

    return {
      ok: true,
      status: response.status,
      data,
      errorDetail: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      errorDetail: formatGrokProviderError(
        error instanceof Error ? error.message : "Grok/xAI request failed."
      ),
    };
  }
}

export function readChatCompletionContent(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const choices = (data as { choices?: Array<{ message?: { content?: string } }> })
    .choices;
  const content = choices?.[0]?.message?.content?.trim();
  return content || null;
}
