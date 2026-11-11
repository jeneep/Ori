import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="font-[family-name:var(--font-geist-sans)] text-lg font-semibold tracking-tight text-zinc-900"
            >
              Ori
            </Link>
            <nav className="flex items-center gap-4 text-sm text-zinc-600">
              <Link href="/dashboard" className="hover:text-zinc-900">
                Dashboard
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-zinc-500 sm:inline">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
