import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", user.id)
      .maybeSingle();

    redirect(profile?.onboarding_completed ? "/dashboard" : "/onboarding");
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-50">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(82,82,91,0.35),_transparent_55%),linear-gradient(to_bottom,_#09090b,_#18181b)]"
      />
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <p className="text-xl font-semibold tracking-tight">Ori</p>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/login" className="text-zinc-300 transition hover:text-white">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-white px-3 py-1.5 font-medium text-zinc-900 transition hover:bg-zinc-200"
          >
            Sign up
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 pb-24 pt-10">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Build faster with Next.js and Supabase.
        </h1>
        <p className="mt-4 max-w-xl text-base text-zinc-400 sm:text-lg">
          Auth, a protected dashboard, and a ready App Router foundation for Ori.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900"
          >
            Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
