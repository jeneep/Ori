import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          You are signed in. This is a protected server-rendered page.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-medium text-zinc-500">Account</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="w-24 text-zinc-500">Email</dt>
            <dd className="font-medium text-zinc-900">{user?.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 text-zinc-500">User ID</dt>
            <dd className="font-mono text-xs text-zinc-700">{user?.id}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
