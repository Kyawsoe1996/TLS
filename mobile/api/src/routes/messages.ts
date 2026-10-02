import { Hono } from "hono";
import { z } from "zod";
import type {
  ListMessagesResponse,
  MessageChannel,
  MessageKind,
  MessageResponse,
  MessageStatus,
  SendMessageRequest,
} from "../../../shared/types";
import { type Db, getClientRow, getMessageRow, getOrderRow, newId, nowIso, rowToClient, rowToMessage } from "../db";
import { buildEmailFooter, emailFrom, sendEmail } from "../email";
import type { AppEnv } from "../env";
import { badRequest, notFound } from "../errors";
import { enforceEmailRateLimit } from "../ratelimit";
import { type AssertAccepts, optionalText, parseBody, requiredText } from "../validate";

export const MESSAGE_KINDS = ["winback", "order_ready", "followup"] as const satisfies readonly MessageKind[];
const CHANNEL: MessageChannel = "email";
/** Longest provider error we keep on the row (Resend's text is already capped at 200 chars in email.ts). */
const MAX_STORED_ERROR = 500;

const sendMessageSchema = z.object({
  kind: z.enum(MESSAGE_KINDS, { error: `must be one of: ${MESSAGE_KINDS.join(", ")}` }),
  subject: requiredText(200),
  body: requiredText(5000),
  orderId: optionalText(64), // uuid
});
type _SendAccepted = AssertAccepts<typeof sendMessageSchema, SendMessageRequest>;

/** 404 if the order isn't in this shop; 400 if it belongs to another client (same rules as orders.ts). */
async function assertOrderBelongsToClient(db: Db, shopId: string, clientId: string, orderId: string): Promise<void> {
  const order = await getOrderRow(db, shopId, orderId);
  if (!order) throw notFound("Order not found.");
  if (order["client_id"] !== clientId) throw badRequest("That order belongs to a different client.");
}

// ---------- Mounted at /clients, so paths are /clients/:clientId/messages ----------

const messageRoutes = new Hono<AppEnv>();

/** GET /clients/:clientId/messages -> { messages } newest first */
messageRoutes.get("/:clientId/messages", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const clientId = c.req.param("clientId");

  const client = await getClientRow(db, shop.id, clientId);
  if (!client) throw notFound("Client not found.");

  const rs = await db.execute({
    sql: "SELECT * FROM messages WHERE client_id = ? AND shop_id = ? ORDER BY created_at DESC",
    args: [clientId, shop.id],
  });
  const body: ListMessagesResponse = { messages: rs.rows.map(rowToMessage) };
  return c.json(body);
});

/**
 * POST /clients/:clientId/messages -> 201 { message }
 * Sends to the client's email right away and logs the outcome. With RESEND_API_KEY the row is "sent"
 * or, if Resend rejects it, "failed" with `error` (still 201 so the app can show it). Without a key the
 * row is "simulated". Does not touch the client's lastOrderAt.
 * The email goes out with the shop-details footer and the shop's Reply-To; the stored `body` is the text
 * as written (no footer) since the footer is presentation.
 */
messageRoutes.post("/:clientId/messages", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const clientId = c.req.param("clientId");
  const input = await parseBody(c, sendMessageSchema);

  const clientRow = await getClientRow(db, shop.id, clientId);
  if (!clientRow) throw notFound("Client not found.");
  const client = rowToClient(clientRow);
  if (!client.email) throw badRequest("Add an email address to this client's file first.");
  if (input.orderId) await assertOrderBelongsToClient(db, shop.id, clientId, input.orderId);

  // Checked after validation so 400/404s don't consume the user's daily allowance.
  await enforceEmailRateLimit(c);

  const id = newId();
  let status: MessageStatus;
  let error: string | null = null;
  let providerId: string | null = null;
  if (c.env.RESEND_API_KEY) {
    try {
      const sent = await sendEmail(c.env, {
        from: emailFrom(c.env, shop.name),
        to: client.email,
        subject: input.subject,
        text: input.body,
        footer: buildEmailFooter(shop),
        replyTo: shop.replyToEmail,
      });
      status = "sent";
      providerId = sent.id || null;
    } catch (err) {
      status = "failed";
      error = (err instanceof Error && err.message ? err.message : "Email could not be sent.").slice(0, MAX_STORED_ERROR);
      console.warn(`[messages] send failed (message ${id}, shop ${shop.id}): ${error}`);
    }
  } else {
    status = "simulated";
  }

  await db.execute({
    sql: `INSERT INTO messages
            (id, shop_id, client_id, order_id, kind, channel, to_address, subject, body, status, error, provider_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      shop.id,
      clientId,
      input.orderId ?? null,
      input.kind,
      CHANNEL,
      client.email,
      input.subject,
      input.body,
      status,
      error,
      providerId,
      nowIso(),
    ],
  });

  const row = await getMessageRow(db, shop.id, id);
  if (!row) throw notFound("Message not found.");
  const body: MessageResponse = { message: rowToMessage(row) };
  return c.json(body, 201);
});

export default messageRoutes;
