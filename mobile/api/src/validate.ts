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
