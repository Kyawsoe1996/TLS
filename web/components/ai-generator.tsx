"use client";

import { useState } from "react";

export type GeneratorField = {
  name: string;
  label: string;
  type?: "text" | "select";
  options?: string[];
  placeholder?: string;
};

// Reusable client component: renders inputs, POSTs to /api/ai, shows the result.
// Used by the Marketing, SEO, and Insights pages — all backed by the same AI route.
export function AiGenerator({
  kind,
  buttonLabel = "Generate",
  fields = [],
  staticFields,
}: {
  kind: string;
  buttonLabel?: string;
  fields?: GeneratorField[];
  staticFields?: Record<string, unknown>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    setResult("");
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, fields: { ...staticFields, ...values } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setResult(data.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {fields.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <label key={f.name} className="flex flex-col gap-1 text-sm">
              <span className="text-white/70">{f.label}</span>
              {f.type === "select" ? (
                <select
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                >
                  <option value="">Select…</option>
                  {f.options?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                  placeholder={f.placeholder}
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              )}
            </label>
          ))}
        </div>
      )}

      <button
        onClick={run}
        disabled={loading}
        className="rounded-lg bg-amber-400 px-4 py-2 font-medium text-slate-900 disabled:opacity-50"
      >
        {loading ? "Generating…" : buttonLabel}
      </button>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {result && (
        <div className="whitespace-pre-wrap rounded-xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed">
          {result}
        </div>
      )}
    </div>
  );
}
