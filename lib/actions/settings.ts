"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProactivityFrequency } from "@/types/database";

export type SettingsState = {
  error: string | null;
  success: string | null;
};

const PROACTIVITY_OPTIONS: ProactivityFrequency[] = ["off", "daily", "weekly"];

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

  if (goals.length < 1) {
    return { error: "Keep at least one goal.", success: null };
  }

  if (!PROACTIVITY_OPTIONS.includes(proactivity)) {
    return { error: "Choose a valid proactivity frequency.", success: null };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      goals,
      constraints,
      proactivity_frequency: proactivity,
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message, success: null };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { error: null, success: "Settings saved." };
}
