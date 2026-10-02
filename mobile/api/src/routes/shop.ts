import { Hono } from "hono";
import { z } from "zod";
import type { BrandTone, GetShopResponse, UpsertShopRequest, UpsertShopResponse } from "../../../shared/types";
import { getShopByOwner, newId, nowIso } from "../db";
import { emailStatus } from "../email";
import type { AppEnv } from "../env";
import { notFound, serverError } from "../errors";
import { type AssertAccepts, optionalEmail, optionalText, parseBody, requiredText } from "../validate";

export const BRAND_TONES = ["Sophisticated", "Welcoming", "Premium"] as const satisfies readonly BrandTone[];

const upsertShopSchema = z.object({
  name: requiredText(120),
  district: requiredText(120),
  city: requiredText(120),
  tone: z.enum(BRAND_TONES, { error: `must be one of: ${BRAND_TONES.join(", ")}` }).optional(),
  // Shop details for the email footer / Reply-To: omit to leave unchanged, "" (or null) to clear.
  address: optionalText(300),
  phone: optionalText(40),
  openingHours: optionalText(200),
  replyToEmail: optionalEmail(200),
});
type _UpsertAccepted = AssertAccepts<typeof upsertShopSchema, UpsertShopRequest>;

const shopRoutes = new Hono<AppEnv>();

/** GET /shop -> { shop, email } | 404 not_found (not onboarded yet) */
shopRoutes.get("/", async (c) => {
  const shop = await getShopByOwner(c.get("db"), c.get("userId"));
  if (!shop) throw notFound("You haven't set up your shop yet.");
  const body: GetShopResponse = { shop, email: emailStatus(c.env, shop.name) };
  return c.json(body);
});

/** PUT /shop -> creates on first call, updates afterwards -> { shop, email } */
shopRoutes.put("/", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const input = await parseBody(c, upsertShopSchema);

  const existing = await getShopByOwner(db, userId);
  if (existing) {
    await db.execute({
      sql: `UPDATE shops
            SET name = ?, district = ?, city = ?, tone = ?, address = ?, phone = ?, opening_hours = ?, reply_to_email = ?
            WHERE id = ?`,
      args: [
        input.name,
        input.district,
        input.city,
        input.tone ?? existing.tone,
        input.address === undefined ? existing.address : input.address,
        input.phone === undefined ? existing.phone : input.phone,
        input.openingHours === undefined ? existing.openingHours : input.openingHours,
        input.replyToEmail === undefined ? existing.replyToEmail : input.replyToEmail,
        existing.id,
      ],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO shops
              (id, owner_user_id, name, district, city, tone, address, phone, opening_hours, reply_to_email, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        newId(),
        userId,
        input.name,
        input.district,
        input.city,
        input.tone ?? "Sophisticated",
        input.address ?? null,
        input.phone ?? null,
        input.openingHours ?? null,
        input.replyToEmail ?? null,
        nowIso(),
      ],
    });
  }

  const shop = await getShopByOwner(db, userId);
  if (!shop) throw serverError("Could not save your shop. Please try again.");
  const body: UpsertShopResponse = { shop, email: emailStatus(c.env, shop.name) };
  return c.json(body);
});

export default shopRoutes;
