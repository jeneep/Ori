import Link from "next/link";
import { CaptureForm } from "@/components/capture/capture-form";
import { CheckInCard } from "@/components/dashboard/check-in-card";
import { buildCheckInCardModel } from "@/lib/proactive/digest";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: profile },
    { data: topics },
    { data: experiments },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle(),
    supabase
      .from("topics")
      .select("id, title, status, current_view, updated_at, muted, created_at")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("experiments")
      .select("id, topic_id, name, hypothesis, status, updated_at")
      .eq("user_id", user!.id)
      .order("updated_at", { ascending: false })
      .limit(40),
  ]);

  const checkIn = profile
    ? buildCheckInCardModel({
        profile,
        topics: topics ?? [],
        experiments: experiments ?? [],
      })
    : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Your goals, constraints, and topics in one place.
        </p>
      </div>

      {checkIn ? <CheckInCard model={checkIn} /> : null}

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-zinc-500">Goals</h2>
            <Link
              href="/settings"
              className="text-xs font-medium text-zinc-700 underline-offset-4 hover:underline"
            >
              Edit
            </Link>
          </div>
          {profile?.goals?.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-900">
              {profile.goals.map((goal) => (
                <li key={goal}>{goal}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">No goals yet.</p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-zinc-500">Constraints</h2>
            <Link
              href="/settings"
              className="text-xs font-medium text-zinc-700 underline-offset-4 hover:underline"
            >
              Edit
            </Link>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-900">
            {profile?.constraints?.trim() || "None set."}
          </p>
          <p className="mt-4 text-xs text-zinc-500">
            Digest: {profile?.proactivity_frequency ?? "off"}
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-medium text-zinc-500">Topics</h2>
        {topics?.length ? (
          <ul className="mt-3 divide-y divide-zinc-100">
            {topics.map((topic) => (
              <li
                key={topic.id}
                className="flex items-center justify-between gap-3 py-3 text-sm"
              >
                <Link
                  href={`/topics/${topic.id}`}
                  className="font-medium text-zinc-900 underline-offset-4 hover:underline"
                >
                  {topic.title}
                </Link>
                <span className="text-xs uppercase tracking-wide text-zinc-500">
                  {topic.muted ? "muted" : topic.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No topics yet.</p>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-medium text-zinc-500">Quick capture</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Paste a link or upload a file into an existing topic.
        </p>
        <div className="mt-4">
          <CaptureForm topics={topics ?? []} />
        </div>
      </section>
    </div>
  );
}
