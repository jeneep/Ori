import { redirect } from "next/navigation";
import { DataControls } from "@/components/settings/data-controls";
import { SettingsForm } from "@/components/settings/settings-form";
import { getCurrentProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!profile.onboarding_completed) {
    redirect("/onboarding");
  }

  const supabase = createClient();
  const { data: topics } = await supabase
    .from("topics")
    .select("id, title, status, muted")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Settings
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Tune Ori’s voice, your goals, digest cadence, and muted topics.
        </p>
      </div>

      <SettingsForm profile={profile} topics={topics ?? []} />
      <DataControls accountEmail={profile.email} />
    </div>
  );
}
