const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\.0\.0\.0$/,
  /^\[::1\]$/,
  /^::1$/,
];

export function isSafeHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  return !PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(parsed.hostname));
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTitleFromHtml(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) {
    return fallback;
  }
  return htmlToText(match[1]).slice(0, 200) || fallback;
}

export async function fetchLinkContent(url: string): Promise<{
  title: string;
  rawText: string;
}> {
  const fallbackTitle = new URL(url).hostname;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "OriContentIngest/1.0",
        Accept: "text/html,text/plain;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return {
        title: fallbackTitle,
        rawText: `Unable to fetch content (HTTP ${response.status}). Stored link only.`,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();

    if (contentType.includes("text/html") || text.includes("<html")) {
      return {
        title: extractTitleFromHtml(text, fallbackTitle),
        rawText: htmlToText(text).slice(0, 50_000),
      };
    }

    return {
      title: fallbackTitle,
      rawText: text.slice(0, 50_000),
    };
  } catch {
    return {
      title: fallbackTitle,
      rawText: "Unable to fetch content from this URL. Stored link only.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function titleFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || filename;
}
