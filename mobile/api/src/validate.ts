import type { Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "./env";
import { badRequest } from "./errors";

/** Parse + validate a JSON request body. Throws 400 bad_request with a readable message. */
export async function parseBody<S extends z.ZodType>(c: Context<AppEnv>, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw badRequest(formatIssues(result.error.issues));
  return result.data as z.infer<S>;
}

function formatIssues(issues: z.core.$ZodIssue[]): string {
  const parts = issues.slice(0, 3).map((issue) => {
    const path = issue.path.map(String).join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  const more = issues.length > 3 ? ` (+${issues.length - 3} more)` : "";
  return `Invalid request - ${parts.join("; ")}${more}`;
}

/**
 * Compile-time check that a schema accepts every request the shared contract allows
 * (the schema may accept a superset, e.g. `null` to clear a field). Usage:
 *   type _ok = AssertAccepts<typeof schema, CreateClientRequest>;
 */
export type AssertAccepts<S extends z.ZodType, Req> = [Req] extends [z.input<S>] ? true : never;

// ---------- Reusable field schemas ----------

/** One of a fixed list of strings (the shared/types.ts unions), with a readable 400 message. */
export const oneOf = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, { error: `must be one of: ${values.join(", ")}` });

/** Required, trimmed, non-empty string. */
export const requiredText = (max: number) =>
  z.string({ error: "must be text" }).trim().min(1, "is required").max(max, `must be at most ${max} characters`);

/**
 * Optional text: `undefined` stays undefined (field not sent), `null` or "" become null (clear it).
 * Lets one schema serve both create (coalesce with `?? null`) and PATCH (skip undefined).
 */
export const optionalText = (max: number) =>
  z
    .string({ error: "must be text" })
    .trim()
    .max(max, `must be at most ${max} characters`)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

/** Optional email address: same `undefined` / `null` / "" semantics as optionalText; validated when non-empty. */
export const optionalEmail = (max: number) =>
  optionalText(max).refine((v) => !v || z.email().safeParse(v).success, "must be a valid email address");

/** Any Date-parseable string, normalised to a UTC ISO 8601 string so DB comparisons stay lexicographic. */
export const isoDate = z
  .string({ error: "must be an ISO 8601 date string" })
  .refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO 8601 date string")
  .transform((s) => new Date(s).toISOString());

/** Measurement in cm; `undefined`/`null` both mean "not measured". */
export const centimetres = z
  .number({ error: "must be a number (cm)" })
  .nonnegative("must be 0 or more")
  .max(1000, "must be at most 1000 cm")
  .nullable()
  .optional()
  .transform((v) => v ?? null);

/** Amount in Thai baht. Like optionalText: `undefined` = not sent (leave unchanged on PATCH), `null` = clear. */
export const baht = z
  .number({ error: "must be a number (THB)" })
  .min(0, "must be 0 or more")
  .max(10_000_000, "must be at most 10,000,000")
  .nullable()
  .optional();
