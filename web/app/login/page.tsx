import { login, signup } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">TLS</h1>
          <p className="text-sm text-white/60">The AI dashboard for tailor shops</p>
        </div>

        <form className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-white/70">Email</span>
            <input
              name="email"
              type="email"
              required
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
              placeholder="you@example.com"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-white/70">Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={6}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
              placeholder="••••••••"
            />
          </label>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              formAction={login}
              className="flex-1 rounded-lg bg-amber-400 px-4 py-2 font-medium text-slate-900"
            >
              Sign in
            </button>
            <button
              formAction={signup}
              className="flex-1 rounded-lg border border-white/15 px-4 py-2 font-medium"
            >
              Sign up
            </button>
          </div>
        </form>

        <p className="text-center text-xs text-white/40">
          New here? Click <strong>Sign up</strong> — a demo shop is created for you automatically.
        </p>
      </div>
    </main>
  );
}
