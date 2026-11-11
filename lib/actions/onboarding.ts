"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OnboardingState = {
  error: string | null;
};

function parseGoals(formData: FormData): string[] {
  const goals = ["goal1", "goal2", "goal3"]
    .map((key) => String(formData.get(key) ?? "").trim())
    .filter(Boolean);

  return goals.slice(0, 3);
}

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to continue." };
  }

  const goals = parseGoals(formData);
  const constraints = String(formData.get("constraints") ?? "").trim();
  const topicName = String(formData.get("topicName") ?? "").trim();

  if (goals.length < 1) {
    return { error: "Add at least one goal." };
  }

  if (goals.length > 3) {
    return { error: "You can add up to three goals." };
  }

  if (!topicName) {
    return { error: "Enter a name for your first topic." };
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: user.email,
      goals,
      constraints,
      onboarding_completed: true,
      proactivity_frequency: "off",
    },
    { onConflict: "id" }
  );

  if (profileError) {
    return { error: profileError.message };
  }

  const { error: topicError } = await supabase.from("topics").insert({
    user_id: user.id,
    title: topicName,
    status: "active",
  });

  if (topicError) {
    return { error: topicError.message };
  }

  redirect("/dashboard");
}
