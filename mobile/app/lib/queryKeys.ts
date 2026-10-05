// Central react-query keys so screens invalidate the same caches.
import type { PostStatus } from "@shared/types";

const ordersKey = (clientId: string) => ["clients", "detail", clientId, "orders"] as const;
const messagesKey = (clientId: string) => ["clients", "detail", clientId, "messages"] as const;

export const queryKeys = {
  shop: ["shop"] as const,
  home: ["home"] as const,
  clients: (params?: { search?: string; inactive?: boolean }) =>
    ["clients", "list", params ?? {}] as const,
  client: (id: string) => ["clients", "detail", id] as const,
  fittings: (clientId: string) => ["clients", "detail", clientId, "fittings"] as const,
  orders: ordersKey,
  order: (clientId: string, orderId: string) => [...ordersKey(clientId), orderId] as const,
  /** Emails sent to a client (newest first); under the client-detail prefix so forgetClient drops them too. */
  messages: messagesKey,
  message: (clientId: string, messageId: string) => [...messagesKey(clientId), messageId] as const,
  /** Shop-wide lists (GET /orders): open orders by default, or the delivered ones. */
  openOrders: (status?: "open" | "delivered") => ["orders", status ?? "open"] as const,
  /** Content library (GET /posts) — one entry per status / search combination. */
  posts: (params?: { status?: PostStatus; q?: string }) => ["posts", "list", params ?? {}] as const,
  post: (id: string) => ["posts", "detail", id] as const,
};
