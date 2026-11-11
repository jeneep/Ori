"use server";

import { revalidatePath } from "next/cache";
import { normalizePersonaSettings } from "@/lib/reasoning/persona";
import { createClient } from "@/lib/supabase/server";
import type { PersonaTone, ProactivityFrequency } from "@/types/database";

export type SettingsState = {
  error: string | null;
  success: string | null;
};

const PROACTIVITY_OPTIONS: ProactivityFrequency[] = ["off", "daily", "weekly"];
const PERSONA_TONE_OPTIONS: PersonaTone[] = [
  "calm_guide",
  "direct_coach",
  "wise_friend",
  "custom",
];

function parseGoals(formData: FormData): string[] {
  return ["goal1", "goal2", "goal3"]
    .map((key) => String(formData.get(key) ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

export async function updateSettings(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in.", success: null };
  }

  const goals = parseGoals(formData);
  const constraints = String(formData.get("constraints") ?? "").trim();
  const proactivity = String(
    formData.get("proactivity_frequency") ?? "off"
  ) as ProactivityFrequency;
  const personaTone = String(
    formData.get("persona_tone") ?? "calm_guide"
  ) as PersonaTone;

  if (goals.length < 1) {
    return { error: "Keep at least one goal.", success: null };
  }

  if (!PROACTIVITY_OPTIONS.includes(proactivity)) {
    return { error: "Choose a valid proactivity frequency.", success: null };
  }

  if (!PERSONA_TONE_OPTIONS.includes(personaTone)) {
    return { error: "Choose a valid persona tone.", success: null };
  }

  const persona = normalizePersonaSettings({
    ori_name: String(formData.get("ori_name") ?? "Ori"),
    persona_tone: personaTone,
    persona_custom_tone: String(formData.get("persona_custom_tone") ?? ""),
    persona_guide_note: String(formData.get("persona_guide_note") ?? ""),
  });

  if (persona.persona_tone === "custom" && !persona.persona_custom_tone) {
    return {
      error: "Add a short custom tone description, or pick another tone.",
      success: null,
    };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      goals,
      constraints,
      proactivity_frequency: proactivity,
      ori_name: persona.ori_name,
      persona_tone: persona.persona_tone,
      persona_custom_tone: persona.persona_custom_tone,
      persona_guide_note: persona.persona_guide_note,
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message, success: null };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/topics", "layout");
  return { error: null, success: "Settings saved." };
}
