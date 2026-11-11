import Link from "next/link";
import type { buildCheckInCardModel } from "@/lib/proactive/digest";

type CheckInModel = ReturnType<typeof buildCheckInCardModel>;

export function CheckInCard({ model }: { model: CheckInModel }) {
  const hasSignals =
    model.openExperiments.length > 0 || model.recentViewUpdates.length > 0;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
            {model.label}
          </p>
          <h2 className="mt-2 text-lg font-medium tracking-tight text-zinc-50">
            {model.statusLine}
          </h2>
        </div>
        <Link
          href="/settings"
          className="mt-2 text-xs font-medium text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline sm:mt-0"
        >
          Digest settings
        </Link>
      </div>

      {model.frequency === "off" && !hasSignals ? (
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          Turn on daily or weekly digests when you want a quiet summary of open
          experiments and recent current-view shifts.
        </p>
      ) : null}

      {hasSignals ? (
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
              Open experiments
            </h3>
            {model.openExperiments.length ? (
              <ul className="mt-2 space-y-2">
                {model.openExperiments.map((exp) => (
                  <li key={exp.id} className="text-sm text-zinc-300">
                    <Link
                      href={`/topics/${exp.topicId}`}
                      className="font-medium text-zinc-100 underline-offset-4 hover:underline"
                    >
                      {exp.name}
                    </Link>
                    <span className="text-zinc-500"> · {exp.topicTitle}</span>
                    {exp.hypothesis ? (
                      <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                        {exp.hypothesis}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">None right now.</p>
            )}
          </div>

          <div>
            <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
              Recent current views
            </h3>
            {model.recentViewUpdates.length ? (
              <ul className="mt-2 space-y-2">
                {model.recentViewUpdates.map((update) => (
                  <li key={update.topicId} className="text-sm text-zinc-300">
                    <Link
                      href={`/topics/${update.topicId}`}
                      className="font-medium text-zinc-100 underline-offset-4 hover:underline"
                    >
                      {update.topicTitle}
                    </Link>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                      {update.excerpt}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">No recent shifts.</p>
            )}
          </div>
        </div>
      ) : model.frequency !== "off" ? (
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          Nothing open on unmuted topics. {model.coachName} will stay out of the
          way until something moves.
        </p>
      ) : null}

      {model.mutedTopicCount > 0 ? (
        <p className="mt-5 text-xs text-zinc-600">
          {model.mutedTopicCount} muted topic
          {model.mutedTopicCount === 1 ? "" : "s"} excluded.
        </p>
      ) : null}
    </section>
  );
}
