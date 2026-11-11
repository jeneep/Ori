import type { UserModel } from "@/lib/llm/coach";

/**
 * Coaching persona derived from the durable user model.
 * Not a separate DB field — a stance Ori uses while synthesizing.
 */
export type OriPersona = {
  name: string;
  stance: string;
  priorities: string[];
  boundaries: string;
  cadence: string;
};

export function buildPersonaFromUserModel(model: UserModel): OriPersona {
  const name = model.full_name?.trim() || "the user";
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

  const stance = [
    `Coach ${name} as a calm thinking partner.`,
    `Weight their goals first: ${priorities.slice(0, 3).join("; ")}.`,
    `Honor constraints: ${boundaries}`,
    cadence,
  ].join(" ");

  return {
    name,
    stance,
    priorities,
    boundaries,
    cadence,
  };
}

export function formatPersonaForPrompt(persona: OriPersona): string {
  return [
    `Coaching for: ${persona.name}`,
    `Stance: ${persona.stance}`,
    `Priorities:\n${persona.priorities.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
    `Boundaries: ${persona.boundaries}`,
    `Cadence: ${persona.cadence}`,
  ].join("\n");
}
