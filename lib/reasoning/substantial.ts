/**
 * Heuristic for whether a coach message warrants deeper synthetic reasoning.
 * Safe for client + server (no Node-only APIs).
 */
const TRIVIAL_PATTERNS =
  /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|got it|cool|k)\b[.!?]*$/i;

const SUBSTANTIVE_PATTERNS =
  /\b(decide|decision|conflict|afraid|stuck|should i|unsure|uncertain|update|tension|trade[- ]?off|priorit|worried|confused|what if|how (do|should|can) i|why (am|do|is)|help me (think|figure|understand))\b/i;

export function isSubstantialCoachQuestion(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (TRIVIAL_PATTERNS.test(text)) return false;

  if (text.length >= 120) return true;
  if (SUBSTANTIVE_PATTERNS.test(text)) return true;
  if (text.includes("?") && text.length >= 40) return true;

  return false;
}
