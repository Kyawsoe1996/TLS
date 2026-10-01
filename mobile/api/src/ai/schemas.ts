import { z } from "zod";
import type { AiPostResponse, AiSeoResponse, AiWinbackResponse, FitAnalysis } from "../../../shared/types";

// Output schemas for the four Gemini pipelines. z.object() strips unknown keys,
// so the prompt's `status` / `data_type` fields are dropped automatically.

const nonEmpty = z.string().trim().min(1);

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

/** Pipeline 3 - GENERATE_DASHBOARD_POST */
export const postSchema = z.object({
  blog_title: nonEmpty,
  blog_body: nonEmpty,
  social_caption: nonEmpty,
  call_to_action: nonEmpty,
}) satisfies z.ZodType<AiPostResponse, unknown>;

/** Pipeline 4 - TRIGGER_RETENTION_CAMPAIGN */
export const winbackSchema = z.object({
  email_subject: nonEmpty,
  email_body: nonEmpty,
}) satisfies z.ZodType<AiWinbackResponse, unknown>;
