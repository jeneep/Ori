import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-col items-center gap-8">
      <div className="text-center">
        <p className="font-[family-name:var(--font-geist-sans)] text-2xl font-semibold tracking-tight text-zinc-900">
          Ori
        </p>
        <h1 className="mt-2 text-lg font-medium text-zinc-800">Sign in</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Welcome back. Enter your credentials to continue.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
