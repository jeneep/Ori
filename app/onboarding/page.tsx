import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8">
          <p className="text-2xl font-semibold tracking-tight text-zinc-900">Ori</p>
          <h1 className="mt-2 text-xl font-medium text-zinc-800">
            Set up your space
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Tell Ori what matters, what limits to respect, and where to start.
          </p>
        </div>
        <OnboardingForm />
      </div>
    </div>
  );
}
