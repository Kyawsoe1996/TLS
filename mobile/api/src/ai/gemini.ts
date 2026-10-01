import type { z } from "zod";
import type { Bindings } from "../env";
import { aiFailed, serverError } from "../errors";
import { AI_ENGINE_PROMPT } from "./prompt";

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
const TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 2; // one retry

/** The part of Gemini's grounding metadata we read (Google Maps sources). */
export interface GroundingMetadata {
  groundingChunks?: Array<{
    maps?: { uri?: string; title?: string; text?: string; placeId?: string };
  }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
    groundingMetadata?: GroundingMetadata;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

export interface GeminiRequest {
  /** System instruction; left out when not given. */
  system?: string;
  user: string;
  /** Force a JSON reply. Don't combine with `tools`: this model doesn't support both together. */
  json?: boolean;
  tools?: Array<Record<string, unknown>>;
  temperature: number;
}

export interface GeminiReply {
  text: string;
  grounding: GroundingMetadata | undefined;
}

/**
 * Run one of the four JSON pipelines: send `payload` (must include ACTION) to Gemini,
 * parse the JSON reply and validate it with `schema`. Retries once on any failure
 * (bad JSON, schema mismatch, HTTP error). Throws 502 ai_failed if both attempts fail.
 */
export async function runPipeline<S extends z.ZodType>(
  env: Bindings,
  payload: Record<string, unknown>,
  schema: S,
): Promise<z.infer<S>> {
  if (!env.GEMINI_API_KEY) {
    console.error("[gemini] GEMINI_API_KEY is not set");
    throw serverError("AI is not configured on the server.");
  }

  const action = String(payload["ACTION"] ?? "unknown");
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { text } = await callGemini(env, {
        system: AI_ENGINE_PROMPT,
        user: JSON.stringify(payload),
        json: true,
        temperature: 0.7,
      });
      const json = parseJsonLoose(text);
      const result = schema.safeParse(json);
      if (result.success) return result.data as z.infer<S>;
      lastError = new Error(
        `schema validation failed: ${result.error.issues.map((i) => `${i.path.map(String).join(".")} ${i.message}`).join("; ")}`,
      );
    } catch (err) {
      lastError = err;
      if (err instanceof Error && err.name === "AbortError") {
        // Timed out - don't spend another 25s.
        break;
      }
    }
    console.warn(`[gemini] ${action} attempt ${attempt}/${MAX_ATTEMPTS} failed:`, describe(lastError));
  }

  console.error(`[gemini] ${action} failed after ${MAX_ATTEMPTS} attempts:`, describe(lastError));
  throw aiFailed();
}

/** One generateContent call. Throws on HTTP errors, blocked prompts, empty replies and timeouts. */
export async function callGemini(env: Bindings, req: GeminiRequest): Promise<GeminiReply> {
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` +
    `?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  const body = {
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    contents: [{ role: "user", parts: [{ text: req.user }] }],
    ...(req.tools ? { tools: req.tools } : {}),
    generationConfig: {
      ...(req.json ? { responseMimeType: "application/json" } : {}),
      temperature: req.temperature,
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) {
      throw new Error(`Gemini HTTP ${res.status}: ${data.error?.message ?? "unknown error"}`);
    }
    if (data.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked the prompt: ${data.promptFeedback.blockReason}`);
    }

    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    if (!text.trim()) {
      throw new Error(`Gemini returned no text (finishReason=${candidate?.finishReason ?? "none"})`);
    }
    return { text, grounding: candidate?.groundingMetadata };
  } finally {
    clearTimeout(timer);
  }
}

/** Parse model output as JSON, tolerating ```json fences and stray prose around the object. */
export function parseJsonLoose(text: string): unknown {
  let s = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s);
  if (fenced?.[1] !== undefined) s = fenced[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1));
    throw new Error("response was not valid JSON");
  }
}

export function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
