/**
 * supabase-js appends `/auth/v1`, `/rest/v1`, etc. itself.
 * If NEXT_PUBLIC_SUPABASE_URL includes those suffixes (common copy/paste from
 * the API docs), auth calls become …/rest/v1/auth/v1/… and Supabase returns
 * "Invalid path specified in request URL".
 */
export function normalizeSupabaseUrl(raw: string): string {
  let url = raw.trim();

  // Drop trailing slash, then any known service path suffix (repeat for safety).
  for (let i = 0; i < 3; i++) {
    url = url.replace(/\/+$/, "");
    const stripped = url.replace(/\/(rest|auth|storage|realtime)\/v1$/i, "");
    if (stripped === url) break;
    url = stripped;
  }

  return url;
}

export function getSupabaseEnv() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!rawUrl || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.local.example to .env.local and add your Supabase project values."
    );
  }

  return { url: normalizeSupabaseUrl(rawUrl), anonKey };
}

/** Absolute URL for email confirmation / OAuth return (must be allowlisted in Supabase). */
export function getAuthCallbackUrl(origin: string): string {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    origin.replace(/\/+$/, "");
  return `${site}/auth/callback`;
}
