import { NextResponse } from "next/server";
import { generate, type AiKind } from "@/lib/ai/gemini";

// The @google/genai SDK needs the Node runtime (not the Edge runtime).
export const runtime = "nodejs";

// POST /api/ai  body: { kind: "marketing" | "seo" | "insights", fields: {...} }
// Returns: { text } on success, { error } with a 500 on failure.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const kind = (body.kind as AiKind) ?? "raw";
    const fields = (body.fields as Record<string, unknown>) ?? {};
    const text = await generate(kind, fields);
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
