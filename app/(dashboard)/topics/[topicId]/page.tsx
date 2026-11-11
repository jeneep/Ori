import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CaptureForm } from "@/components/capture/capture-form";
import { ExperimentCards } from "@/components/topics/experiment-cards";
import { TopicChat } from "@/components/topics/topic-chat";
import { createClient } from "@/lib/supabase/server";

type TopicPageProps = {
  params: { topicId: string };
};

export default async function TopicPage({ params }: TopicPageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { data: topic },
    { data: topics },
    { data: contentItems },
    { data: messages },
    { data: experiments },
  ] = await Promise.all([
    supabase
      .from("topics")
      .select("id, title, description, status, current_view, created_at")
      .eq("id", params.topicId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("topics")
      .select("id, title")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("content")
      .select(
        "id, title, body, source_url, summary, content_type, created_at"
      )
      .eq("topic_id", params.topicId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("messages")
      .select("id, role, content, created_at, metadata")
      .eq("topic_id", params.topicId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(40),
    supabase
      .from("experiments")
      .select("id, name, hypothesis, status, created_at")
      .eq("topic_id", params.topicId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (!topic) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-800 hover:underline"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">
          {topic.title}
        </h1>
        {topic.description ? (
          <p className="mt-1 text-sm text-zinc-500">{topic.description}</p>
        ) : (
          <p className="mt-1 text-sm text-zinc-500">
            Capture context, refine the current view, and run small experiments.
          </p>
        )}
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-medium text-zinc-500">Coach chat</h2>
        <div className="mt-4">
          <TopicChat
            topicId={topic.id}
            initialCurrentView={topic.current_view}
            initialMessages={messages ?? []}
          />
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-medium text-zinc-500">Experiments</h2>
        <div className="mt-4">
          <ExperimentCards experiments={experiments ?? []} />
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-medium text-zinc-500">Capture</h2>
        <div className="mt-4">
          <CaptureForm topics={topics ?? []} defaultTopicId={topic.id} />
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-medium text-zinc-500">Content</h2>
        {contentItems?.length ? (
          <ul className="mt-4 divide-y divide-zinc-100">
            {contentItems.map((item) => (
              <li key={item.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-zinc-900">
                      {item.title || "Untitled"}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                      {item.content_type}
                      {item.source_url ? " · link" : ""}
                    </p>
                  </div>
                  <time
                    className="text-xs text-zinc-400"
                    dateTime={item.created_at}
                  >
                    {new Date(item.created_at).toLocaleString()}
                  </time>
                </div>

                {item.summary ? (
                  <p className="mt-3 text-sm text-zinc-700">{item.summary}</p>
                ) : null}

                {item.source_url ? (
                  <a
                    href={item.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm text-zinc-600 underline-offset-4 hover:underline"
                  >
                    {item.source_url}
                  </a>
                ) : null}

                {!item.summary && item.body ? (
                  <p className="mt-3 line-clamp-3 text-sm text-zinc-600">
                    {item.body}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">
            No content yet. Capture a link or file above.
          </p>
        )}
      </section>
    </div>
  );
}
