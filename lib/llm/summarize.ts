const MAX_INPUT_CHARS = 12_000;

export async function generateShortSummary(input: {
  title: string;
  rawText: string;
  sourceUrl?: string | null;
}): Promise<string> {
  const excerpt = input.rawText.slice(0, MAX_INPUT_CHARS).trim();
  const fallback = buildFallbackSummary(input.title, excerpt, input.sourceUrl);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallback;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 180,
        messages: [
          {
            role: "system",
            content:
              "You write concise 2-3 sentence summaries for captured research content. No preamble, no markdown.",
          },
          {
            role: "user",
            content: [
              `Title: ${input.title}`,
              input.sourceUrl ? `Source URL: ${input.sourceUrl}` : null,
              "Content:",
              excerpt || "(empty)",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      }),
    });

    if (!response.ok) {
      return fallback;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const summary = data.choices?.[0]?.message?.content?.trim();
    return summary || fallback;
  } catch {
    return fallback;
  }
}

function buildFallbackSummary(
  title: string,
  rawText: string,
  sourceUrl?: string | null
): string {
  const snippet = rawText.replace(/\s+/g, " ").trim().slice(0, 220);
  if (snippet) {
    return `${snippet}${snippet.length >= 220 ? "…" : ""}`;
  }
  if (sourceUrl) {
    return `Captured link for “${title}” from ${sourceUrl}.`;
  }
  return `Captured content: ${title}.`;
}
