import type { PersonaTone, ProactivityFrequency } from "@/types/database";

export type PersonaSettings = {
  ori_name: string;
  persona_tone: PersonaTone;
  persona_custom_tone: string;
  persona_guide_note: string;
};

export type UserModelForPersona = PersonaSettings & {
  goals: string[];
  constraints: string;
  proactivity_frequency: ProactivityFrequency;
  full_name: string | null;
};

/**
 * Coaching persona: chosen Ori voice + durable user model context.
 */
export type OriPersona = {
  coachName: string;
  tone: PersonaTone;
  toneLabel: string;
  toneDescription: string;
  guideNote: string;
  userName: string;
  priorities: string[];
  boundaries: string;
  cadence: string;
  stance: string;
};

export const PERSONA_TONE_OPTIONS: {
  value: PersonaTone;
  label: string;
  description: string;
}[] = [
  {
    value: "calm_guide",
    label: "Calm guide",
    description: "Steady, spacious, and gently clarifying.",
  },
  {
    value: "direct_coach",
    label: "Direct coach",
    description: "Clear, candid, and focused on the next move.",
  },
  {
    value: "wise_friend",
    label: "Wise friend",
    description: "Warm, grounded, and quietly insightful.",
  },
  {
    value: "custom",
    label: "Custom",
    description: "Describe the voice you want in a short phrase.",
  },
];

export const DEFAULT_PERSONA_SETTINGS: PersonaSettings = {
  ori_name: "Ori",
  persona_tone: "calm_guide",
  persona_custom_tone: "",
  persona_guide_note: "",
};

export function normalizePersonaSettings(
  input?: Partial<PersonaSettings> | null
): PersonaSettings {
  const tone = input?.persona_tone;
  const validTone =
    tone === "calm_guide" ||
    tone === "direct_coach" ||
    tone === "wise_friend" ||
    tone === "custom"
      ? tone
      : DEFAULT_PERSONA_SETTINGS.persona_tone;

  const oriName = input?.ori_name?.trim() || DEFAULT_PERSONA_SETTINGS.ori_name;

  return {
    ori_name: oriName.slice(0, 40),
    persona_tone: validTone,
    persona_custom_tone: (input?.persona_custom_tone ?? "").trim().slice(0, 200),
    persona_guide_note: (input?.persona_guide_note ?? "").trim().slice(0, 500),
  };
}

export function resolveToneDescription(settings: PersonaSettings): string {
  if (settings.persona_tone === "custom") {
    return (
      settings.persona_custom_tone.trim() ||
      "A thoughtful coaching presence shaped by the user’s note."
    );
  }
  return (
    PERSONA_TONE_OPTIONS.find((option) => option.value === settings.persona_tone)
      ?.description ?? PERSONA_TONE_OPTIONS[0].description
  );
}

export function resolveToneLabel(settings: PersonaSettings): string {
  if (settings.persona_tone === "custom") {
    return settings.persona_custom_tone.trim() || "Custom";
  }
  return (
    PERSONA_TONE_OPTIONS.find((option) => option.value === settings.persona_tone)
      ?.label ?? "Calm guide"
  );
}

export function buildPersonaFromUserModel(
  model: UserModelForPersona
): OriPersona {
  const settings = normalizePersonaSettings(model);
  const userName = model.full_name?.trim() || "the user";
  const priorities =
    model.goals.length > 0
      ? model.goals.map((goal) => goal.trim()).filter(Boolean)
      : ["Clarify what matters and take the next useful step"];

  const boundaries =
    model.constraints.trim() ||
    "Stay practical, kind, and non-prescriptive unless asked.";

  const cadence =
    model.proactivity_frequency === "daily"
      ? "Check in lightly when new signals appear."
      : model.proactivity_frequency === "weekly"
        ? "Prefer measured, weekly-paced reflection over urgency."
        : "Stay responsive without pushing unsolicited follow-ups.";

  const toneDescription = resolveToneDescription(settings);
  const guideNote =
    settings.persona_guide_note.trim() ||
    "Help them see clearly and take the next useful step.";

  const stance = [
    `You are ${settings.ori_name}, speaking as a ${resolveToneLabel(settings).toLowerCase()}.`,
    `Voice: ${toneDescription}`,
    `Guide toward: ${guideNote}`,
    `Coach ${userName} with their goals first: ${priorities.slice(0, 3).join("; ")}.`,
    `Honor constraints: ${boundaries}`,
    cadence,
  ].join(" ");

  return {
    coachName: settings.ori_name,
    tone: settings.persona_tone,
    toneLabel: resolveToneLabel(settings),
    toneDescription,
    guideNote,
    userName,
    priorities,
    boundaries,
    cadence,
    stance,
  };
}

export function formatPersonaForPrompt(persona: OriPersona): string {
  return [
    `Coach name: ${persona.coachName}`,
    `Tone: ${persona.toneLabel} — ${persona.toneDescription}`,
    `Guide note / aspiration: ${persona.guideNote}`,
    `Coaching for: ${persona.userName}`,
    `Stance: ${persona.stance}`,
    `Priorities:\n${persona.priorities.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
    `Boundaries: ${persona.boundaries}`,
    `Cadence: ${persona.cadence}`,
  ].join("\n");
}

export function buildCoachSystemPrompt(persona: OriPersona): string {
  return [
    `You are ${persona.coachName}, a thoughtful coaching partner.`,
    `Speak in this voice: ${persona.toneLabel} — ${persona.toneDescription}`,
    `Orient toward what they want from a guide: ${persona.guideNote}`,
    "Stay consistent with the user's synthesized model (goals/constraints) and the topic's current_view.",
    "When synthetic reasoning context is provided, use it: note reinforcements, conflicts, and gaps without being alarmist.",
    "Do not invent facts that contradict the current_view; if new info conflicts, note the tension and propose an updated current_view.",
    "Keep replies concise (2-5 short paragraphs max).",
    "Return JSON only with keys:",
    "reply (string), important (boolean), proposed_current_view (string|null), experiment ({name, hypothesis}|null).",
    "Set important=true when the exchange clarified stakes, decisions, conflicts, or new durable understanding.",
    "When important=true, proposed_current_view should be an updated 2-5 sentence synthesis of the topic.",
    "Include experiment when a concrete small test would help; otherwise null.",
    "Write proposed_current_view in the same calm register as the chosen persona voice.",
  ].join(" ");
}

/** Deterministic preview snippet for settings UI (no LLM call). */
export function buildPersonaPreview(settings: PersonaSettings): string {
  const normalized = normalizePersonaSettings(settings);
  const name = normalized.ori_name;
  const hasNote = Boolean(normalized.persona_guide_note.trim());
  const note = normalized.persona_guide_note.trim();

  switch (normalized.persona_tone) {
    case "direct_coach":
      return hasNote
        ? `${name}: “Here’s the tension I see, and one clear move for this week — keeping your aim on ${note}.”`
        : `${name}: “Here’s the tension I see, and one clear move worth trying this week.”`;
    case "wise_friend":
      return hasNote
        ? `${name}: “You don’t have to rush this. Let’s sit with what’s true, then choose a small step that serves ${note}.”`
        : `${name}: “You don’t have to rush this. Let’s sit with what’s true, then choose one small step.”`;
    case "custom":
      return hasNote
        ? `${name}: “In the voice of ${resolveToneDescription(normalized)}, I’ll help you move toward ${note}.”`
        : `${name}: “In the voice of ${resolveToneDescription(normalized)}, I’ll reflect with you on what matters next.”`;
    case "calm_guide":
    default:
      return hasNote
        ? `${name}: “Let’s slow this down just enough to notice what matters, then take one gentle step toward ${note}.”`
        : `${name}: “Let’s slow this down just enough to notice what matters, then take one gentle next step.”`;
  }
}
