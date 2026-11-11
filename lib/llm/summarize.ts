import {
  callGrokChatCompletions,
  getGrokApiKey,
  getGrokModel,
  readChatCompletionContent,
} from "@/lib/llm/xai";

const MAX_INPUT_CHARS = 12_000;

export async function generateShortSummary(input: {
  title: string;
  rawText: string;
  sourceUrl?: string | null;
}): Promise<string> {
  const excerpt = input.rawText.slice(0, MAX_INPUT_CHARS).trim();
  const fallback = buildFallbackSummary(input.title, excerpt, input.sourceUrl);

  // Previously used OPENAI_API_KEY + api.openai.com; switched to Grok/xAI.
  if (!getGrokApiKey()) {
    return fallback;
  }

  try {
    const result = await callGrokChatCompletions({
      model: getGrokModel(),
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
    });

    if (!result.ok) {
      return fallback;
    }

    return readChatCompletionContent(result.data) || fallback;
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
