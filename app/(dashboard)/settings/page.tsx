import { redirect } from "next/navigation";
import { DataControls } from "@/components/settings/data-controls";
import { SettingsForm } from "@/components/settings/settings-form";
import { getCurrentProfile } from "@/lib/profile";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!profile.onboarding_completed) {
    redirect("/onboarding");
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Settings
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Tune Ori’s voice, your goals, and how often Ori reaches out.
        </p>
      </div>

      <SettingsForm profile={profile} />
      <DataControls accountEmail={profile.email} />
    </div>
  );
}
