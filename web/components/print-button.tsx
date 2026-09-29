"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg border border-white/15 px-3 py-2 text-sm font-medium hover:bg-white/5"
    >
      Print / Save as PDF
    </button>
  );
}
