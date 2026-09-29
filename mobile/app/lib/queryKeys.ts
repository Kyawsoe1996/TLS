// Central react-query keys so screens invalidate the same caches.
export const queryKeys = {
  shop: ["shop"] as const,
  home: ["home"] as const,
  clients: (params?: { search?: string; inactive?: boolean }) =>
    ["clients", "list", params ?? {}] as const,
  client: (id: string) => ["clients", "detail", id] as const,
  fittings: (clientId: string) => ["clients", "detail", clientId, "fittings"] as const,
};
