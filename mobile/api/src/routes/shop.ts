import { Hono } from "hono";
import { z } from "zod";
import type { BrandTone, GetShopResponse, UpsertShopRequest, UpsertShopResponse } from "../../../shared/types";
import { getShopByOwner, newId, nowIso } from "../db";
import type { AppEnv } from "../env";
import { notFound, serverError } from "../errors";
import { parseBody, requiredText } from "../validate";

export const BRAND_TONES = ["Sophisticated", "Welcoming", "Premium"] as const satisfies readonly BrandTone[];

const upsertShopSchema = z.object({
  name: requiredText(120),
  district: requiredText(120),
  city: requiredText(120),
  tone: z.enum(BRAND_TONES, { error: `must be one of: ${BRAND_TONES.join(", ")}` }).optional(),
}) satisfies z.ZodType<UpsertShopRequest, unknown>;

const shopRoutes = new Hono<AppEnv>();

/** GET /shop -> { shop } | 404 not_found (not onboarded yet) */
shopRoutes.get("/", async (c) => {
  const shop = await getShopByOwner(c.get("db"), c.get("userId"));
  if (!shop) throw notFound("You haven't set up your shop yet.");
  const body: GetShopResponse = { shop };
  return c.json(body);
});

/** PUT /shop -> creates on first call, updates afterwards -> { shop } */
shopRoutes.put("/", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const input = await parseBody(c, upsertShopSchema);

  const existing = await getShopByOwner(db, userId);
  if (existing) {
    await db.execute({
      sql: "UPDATE shops SET name = ?, district = ?, city = ?, tone = ? WHERE id = ?",
      args: [input.name, input.district, input.city, input.tone ?? existing.tone, existing.id],
    });
  } else {
    await db.execute({
      sql: "INSERT INTO shops (id, owner_user_id, name, district, city, tone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [newId(), userId, input.name, input.district, input.city, input.tone ?? "Sophisticated", nowIso()],
    });
  }

  const shop = await getShopByOwner(db, userId);
  if (!shop) throw serverError("Could not save your shop. Please try again.");
  const body: UpsertShopResponse = { shop };
  return c.json(body);
});

export default shopRoutes;
