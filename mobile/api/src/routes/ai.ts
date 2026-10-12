import { Hono } from "hono";
import { z } from "zod";
import type {
  AiFitRequest,
  AiFitResponse,
  AiPostRequest,
  AiPostResponse,
  AiSeoRequest,
  AiSeoResponse,
  AiWinbackRequest,
  AiWinbackResponse,
  CompetitorTier,
  GarmentType,
  Incentive,
  Measurements,
  SearchConsoleStatus,
} from "../../../shared/types";
import { runPipeline } from "../ai/gemini";
import { findNearbyTailors } from "../ai/maps";
import { fitAnalysisSchema, postSchema, seoSchema, winbackSchema } from "../ai/schemas";
import {
  type Db,
  getClientRow,
  getPostRow,
  MEASUREMENT_COLUMNS,
  MEASUREMENT_KEYS,
  newId,
  nowIso,
  rowToClient,
  rowToFitting,
  rowToPost,
} from "../db";
import type { AppEnv } from "../env";
import { badRequest, notFound } from "../errors";
import { publicOrigin } from "../media";
import { enforceAiRateLimit } from "../ratelimit";
import { oneOf, parseBody, requiredText } from "../validate";
import { AUDIENCES, insertPost } from "./posts";
import { BRAND_TONES } from "./shop";

// ---------- Request schemas (enums mirror shared/types.ts) ----------

const COMPETITOR_TIERS = [
  "Hotel-arcade chains",
  "Big tailoring brands",
  "Other local tailors",
] as const satisfies readonly CompetitorTier[];

const SEARCH_CONSOLE_STATUSES = [
  "Not on Google yet",
  "Page 3 or lower",
  "Page 2",
  "Page 1",
  "Not sure",
] as const satisfies readonly SearchConsoleStatus[];

const INCENTIVES = [
  "Complimentary shirt with a suit",
  "10% off",
  "Free alteration",
] as const satisfies readonly Incentive[];

const aiFitSchema = z.object({ fittingId: requiredText(64) }) satisfies z.ZodType<AiFitRequest, unknown>;

const aiSeoSchema = z.object({
  district: requiredText(160),
  competitorTier: oneOf(COMPETITOR_TIERS),
  searchConsoleStatus: oneOf(SEARCH_CONSOLE_STATUSES),
}) satisfies z.ZodType<AiSeoRequest, unknown>;

const aiPostSchema = z.object({
  brandTone: oneOf(BRAND_TONES),
  topic: requiredText(300),
  audience: oneOf(AUDIENCES),
}) satisfies z.ZodType<AiPostRequest, unknown>;

const aiWinbackSchema = z.object({
  clientId: requiredText(64),
  incentive: oneOf(INCENTIVES),
}) satisfies z.ZodType<AiWinbackRequest, unknown>;

// ---------- Helpers ----------

async function saveGeneration(db: Db, shopId: string, kind: "seo" | "post" | "winback", input: unknown, output: unknown) {
  await db.execute({
    sql: "INSERT INTO generations (id, shop_id, kind, input_json, output_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [newId(), shopId, kind, JSON.stringify(input), JSON.stringify(output), nowIso()],
  });
}

/** Measurements pipeline 1 cannot work without, per garment type; POST /ai/fit is a 400 when any is missing. */
const REQUIRED_MEASUREMENTS: Record<GarmentType, (keyof Measurements)[]> = {
  jacket: ["chest", "waist"],
  suit: ["chest", "waist"],
  shirt: ["chest", "waist"],
  trousers: ["waist", "hip"],
};

/** Whole calendar months between two instants (UTC), never less than 1. */
export function inactiveMonths(since: Date, now: Date = new Date()): number {
  let months = (now.getUTCFullYear() - since.getUTCFullYear()) * 12 + (now.getUTCMonth() - since.getUTCMonth());
  if (now.getUTCDate() < since.getUTCDate()) months -= 1;
  return Math.max(1, months);
}

// ---------- Routes (mounted at /ai) ----------

const aiRoutes = new Hono<AppEnv>();

/** POST /ai/fit { fittingId } -> pipeline 1, stored on the fitting -> { fitting } */
aiRoutes.post("/fit", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const { fittingId } = await parseBody(c, aiFitSchema);

  const rs = await db.execute({
    sql: `SELECT f.*, c.name AS client_name
          FROM fittings f JOIN clients c ON c.id = f.client_id
          WHERE f.id = ? AND f.shop_id = ?`,
    args: [fittingId, shop.id],
  });
  const row = rs.rows[0];
  if (!row) throw notFound("Fitting not found.");
  const fitting = rowToFitting(row);
  const m = fitting.measurements;

  // Checked before the rate limit so an incomplete fitting doesn't consume the user's daily AI quota.
  const missing = REQUIRED_MEASUREMENTS[fitting.garmentType].filter((key) => m[key] == null);
  if (missing.length > 0) {
    throw badRequest(
      `Add the ${missing.join(" and ")} measurement${missing.length > 1 ? "s" : ""} to this ${fitting.garmentType} fitting before running the AI analysis.`,
    );
  }

  await enforceAiRateLimit(c);

  // The prompt documents chest / waist / over_arm / posture_radar; every other measurement that was taken
  // goes along under its snake_case name, plus garment_type, so the cutter notes fit the garment.
  const iotData: Record<string, string | number | null> = {
    garment_type: fitting.garmentType,
    chest: m.chest,
    waist: m.waist,
    over_arm: m.overArm,
  };
  for (const key of MEASUREMENT_KEYS) {
    const name = MEASUREMENT_COLUMNS[key];
    if (!(name in iotData) && m[key] != null) iotData[name] = m[key];
  }
  iotData["posture_radar"] = fitting.postureNote || "No posture anomalies noted";

  const payload = {
    ACTION: "PROCESS_IOT_MEASUREMENTS",
    client_name: String(row["client_name"] ?? ""),
    target_style: fitting.style,
    selected_fabric: fitting.fabric,
    iot_data: iotData,
  };
  const analysis = await runPipeline(c.env, payload, fitAnalysisSchema);

  await db.execute({
    sql: "UPDATE fittings SET ai_json = ? WHERE id = ? AND shop_id = ?",
    args: [JSON.stringify(analysis), fittingId, shop.id],
  });

  const body: AiFitResponse = { fitting: { ...fitting, analysis } };
  return c.json(body);
});

/** POST /ai/seo -> Google Maps lookup, then pipeline 2 -> { target_market, keywords, places } */
aiRoutes.post("/seo", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const input = await parseBody(c, aiSeoSchema);

  await enforceAiRateLimit(c);

  const nearby = await findNearbyTailors(c.env, input.district);
  const payload = {
    ACTION: "GENERATE_LOCAL_SEO_MAP",
    target_district: input.district,
    competitor_tier: input.competitorTier,
    search_console_status: input.searchConsoleStatus,
  };
  const result = await runPipeline(
    c.env,
    nearby ? { ...payload, nearby_competitors: nearby.findings } : payload,
    seoSchema,
  );
  // The Maps findings and places are not stored (Google's terms limit keeping Maps content), only whether they were used.
  await saveGeneration(db, shop.id, "seo", { ...payload, maps_grounded: nearby !== null }, result);

  const body: AiSeoResponse = {
    target_market: result.target_market,
    keywords: result.keywords,
    places: nearby?.places ?? null,
  };
  return c.json(body);
});

/**
 * POST /ai/post -> pipeline 3 -> { blog_title, blog_body, social_caption, call_to_action, post }.
 * The result is saved as a draft post right away (and logged in generations), so nothing generated is lost.
 */
aiRoutes.post("/post", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const input = await parseBody(c, aiPostSchema);

  await enforceAiRateLimit(c);

  const payload = {
    ACTION: "GENERATE_DASHBOARD_POST",
    brand_tone: input.brandTone,
    chosen_topic: input.topic,
    target_demographic: input.audience,
  };
  const result = await runPipeline(c.env, payload, postSchema);
  await saveGeneration(db, shop.id, "post", payload, result);
  const postId = await insertPost(db, shop.id, {
    title: result.blog_title,
    body: result.blog_body,
    caption: result.social_caption,
    callToAction: result.call_to_action,
    topic: input.topic,
    tone: input.brandTone,
    audience: input.audience,
  });

  const row = await getPostRow(db, shop.id, postId);
  if (!row) throw notFound("Post not found.");
  const body: AiPostResponse = {
    blog_title: result.blog_title,
    blog_body: result.blog_body,
    social_caption: result.social_caption,
    call_to_action: result.call_to_action,
    post: rowToPost(row, publicOrigin(c)),
  };
  return c.json(body);
});

/** POST /ai/winback { clientId, incentive } -> pipeline 4 -> { email_subject, email_body } */
aiRoutes.post("/winback", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const input = await parseBody(c, aiWinbackSchema);

  const clientRow = await getClientRow(db, shop.id, input.clientId);
  if (!clientRow) throw notFound("Client not found.");
  const client = rowToClient(clientRow);

  const latest = await db.execute({
    sql: "SELECT style, fabric FROM fittings WHERE client_id = ? AND shop_id = ? ORDER BY created_at DESC LIMIT 1",
    args: [client.id, shop.id],
  });
  const lastFitting = latest.rows[0];
  const previousPurchase = lastFitting
    ? `${String(lastFitting["style"] ?? "")} in ${String(lastFitting["fabric"] ?? "")}`
    : "a bespoke garment";

  await enforceAiRateLimit(c);

  const payload = {
    ACTION: "TRIGGER_RETENTION_CAMPAIGN",
    inactive_months: inactiveMonths(new Date(client.lastOrderAt ?? client.createdAt)),
    previous_purchase: previousPurchase,
    incentive_offered: input.incentive,
    client_name: client.name,
    shop_name: shop.name,
  };
  const result = await runPipeline(c.env, payload, winbackSchema);
  await saveGeneration(db, shop.id, "winback", payload, result);

  const body: AiWinbackResponse = { email_subject: result.email_subject, email_body: result.email_body };
  return c.json(body);
});

export default aiRoutes;
