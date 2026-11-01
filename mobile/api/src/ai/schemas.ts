import { z } from "zod";
import type {
  AiParseMeasurementsResponse,
  AiPostResponse,
  AiSeoResponse,
  AiWinbackResponse,
  FitAnalysis,
} from "../../../shared/types";

// Output schemas for the four Gemini pipelines (+ the measurement parser). z.object() strips unknown keys,
// so the prompt's `status` / `data_type` fields are dropped automatically.

const nonEmpty = z.string().trim().min(1);

/** Most `unrecognised` phrases kept from the measurement parser, and the longest each may be. */
const MAX_UNRECOGNISED = 20;
const MAX_PHRASE_CHARS = 200;

/** Pipeline 1 - PROCESS_IOT_MEASUREMENTS */
export const fitAnalysisSchema = z.object({
  pattern_adjustments: nonEmpty,
  fit_profile: nonEmpty,
  automated_marketing_hook: nonEmpty,
}) satisfies z.ZodType<FitAnalysis, unknown>;

/** Pipeline 2 - GENERATE_LOCAL_SEO_MAP (the model's part; `places` comes from the Maps lookup) */
export const seoSchema = z.object({
  target_market: nonEmpty,
  keywords: z
    .array(
      z.object({
        keyword: nonEmpty,
        search_intent: nonEmpty,
        content_angle: nonEmpty,
      }),
    )
    .min(1),
}) satisfies z.ZodType<Pick<AiSeoResponse, "target_market" | "keywords">, unknown>;

/** Pipeline 3 - GENERATE_DASHBOARD_POST (the model's part; `post` is the row routes/ai.ts saves from it) */
export const postSchema = z.object({
  blog_title: nonEmpty,
  blog_body: nonEmpty,
  social_caption: nonEmpty,
  call_to_action: nonEmpty,
}) satisfies z.ZodType<Omit<AiPostResponse, "post">, unknown>;

/** Pipeline 4 - TRIGGER_RETENTION_CAMPAIGN */
export const winbackSchema = z.object({
  email_subject: nonEmpty,
  email_body: nonEmpty,
}) satisfies z.ZodType<AiWinbackResponse, unknown>;

/**
 * PARSE_DICTATED_MEASUREMENTS (ai/measurements.ts, POST /ai/parse-measurements). Lenient where the model
 * tends to slip - a non-numeric value, a missing list or a null note is dropped rather than retried. The
 * keys are whatever the model returned; ai/measurements.ts keeps only the garment's keys and plausible values.
 */
export const parsedMeasurementsSchema = z.object({
  measurements: z.record(z.string(), z.number().nullable().catch(null)).catch({}),
  postureNote: z
    .string()
    .nullable()
    .catch(null)
    .transform((v) => (v?.trim() ? v.trim() : null)),
  unrecognised: z
    .array(z.string().catch(""))
    .catch([])
    .transform((list) =>
      list
        .map((s) => s.trim().slice(0, MAX_PHRASE_CHARS))
        .filter(Boolean)
        .slice(0, MAX_UNRECOGNISED),
    ),
}) satisfies z.ZodType<AiParseMeasurementsResponse, unknown>;

/** WRITE_WEBSITE_PIECE_LINE: one or two sentences, trimmed and capped at the piece line limit. */
export const pieceLineSchema = z.object({
  line: z
    .string()
    .trim()
    .min(1)
    .transform((v) => v.replace(/^["'“”]+|["'“”]+$/g, "").slice(0, 300)),
});
