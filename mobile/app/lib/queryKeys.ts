// Central react-query keys so screens invalidate the same caches.
const ordersKey = (clientId: string) => ["clients", "detail", clientId, "orders"] as const;

export const queryKeys = {
  shop: ["shop"] as const,
  home: ["home"] as const,
  clients: (params?: { search?: string; inactive?: boolean }) =>
    ["clients", "list", params ?? {}] as const,
  client: (id: string) => ["clients", "detail", id] as const,
  fittings: (clientId: string) => ["clients", "detail", clientId, "fittings"] as const,
  orders: ordersKey,
  order: (clientId: string, orderId: string) => [...ordersKey(clientId), orderId] as const,
  /** Shop-wide lists (GET /orders): open orders by default, or the delivered ones. */
  openOrders: (status?: "open" | "delivered") => ["orders", status ?? "open"] as const,
};
