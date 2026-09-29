"use client";

import { useState } from "react";

export function ReengageForm({
  customer,
  shopName,
}: {
  customer: { id: string; name: string; email: string | null };
  shopName: string;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(`We miss you at ${shopName}`);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [status, setStatus] = useState("");

  async function draft() {
    setBusy("draft");
    setStatus("");
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "engagement",
          fields: { customerName: customer.name, shopName },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBody((data.text ?? "").trim());
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    setStatus("");
    try {
      const res = await fetch("/api/engagement/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customer.id, subject, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus(
        data.status === "sent"
          ? `Sent to ${customer.email}`
          : "Logged (email not configured — simulated)",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-white/15 px-2 py-1 text-xs hover:bg-white/5"
      >
        Re-engage
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-white/5 p-3 text-left">
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="Write a message or click 'Draft with AI'"
        className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={draft}
          disabled={busy !== null}
          className="rounded-md border border-white/15 px-2 py-1 text-xs disabled:opacity-50"
        >
          {busy === "draft" ? "Drafting…" : "Draft with AI"}
        </button>
        <button
          onClick={send}
          disabled={busy !== null || !body}
          className="rounded-md bg-amber-400 px-2 py-1 text-xs font-medium text-slate-900 disabled:opacity-50"
        >
          {busy === "send" ? "Sending…" : "Send email"}
        </button>
        {status && <span className="text-xs text-white/60">{status}</span>}
      </div>
    </div>
  );
}
