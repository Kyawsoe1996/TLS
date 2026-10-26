// Data hooks, cache helpers and typed hrefs for the Fabric stock screens.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Href } from "expo-router";
import type { Fabric, FabricDetailResponse } from "@shared/types";

import { SHOP_ORDERS_KEY, afterOrderChanged } from "@/components/clients/queries";
import { isApiClientError, useApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

/** Typed hrefs for the fabric screens (they live in the clients stack), so screens never hand-write pathnames. */
export const fabricRoutes = {
  list: "/(tabs)/clients/fabrics" as const satisfies Href,
  /** The list with the "Low" filter on (Home's "Fabrics running low"). */
  low: { pathname: "/(tabs)/clients/fabrics", params: { low: "1" } } as const satisfies Href,
  newFabric: "/(tabs)/clients/fabrics/new" as const satisfies Href,
  detail: (fabricId: string): Href => ({ pathname: "/(tabs)/clients/fabrics/[fabricId]", params: { fabricId } }),
  /** The New fabric screen in edit mode. */
  edit: (fabricId: string): Href => ({ pathname: "/(tabs)/clients/fabrics/new", params: { fabricId } }),
};

/** GET /fabrics — every bolt, low ones first then by name; `low: true` asks the API for the low ones only. */
export function useFabrics(params?: { low?: boolean }) {
  const api = useApi();
  const low = !!params?.low;
  return useQuery<Fabric[]>({
    queryKey: low ? [...queryKeys.fabrics, "low"] : queryKeys.fabrics,
    queryFn: async () => (await api.listFabrics(low ? { low } : undefined)).fabrics,
    retry: 1,
  });
}

/** The row the user tapped, if the cached list still holds it, so the detail can show the fabric before its history loads. */
function findCachedFabric(qc: QueryClient, fabricId: string): Fabric | undefined {
  return qc.getQueryData<Fabric[]>(queryKeys.fabrics)?.find((f) => f.id === fabricId);
}

/** GET /fabrics/:id — the fabric with its movements and the orders cut from it. A 404 is not retried. */
export function useFabric(fabricId: string | undefined) {
  const api = useApi();
  const enabled = !!fabricId;
  return useQuery<FabricDetailResponse>({
    queryKey: queryKeys.fabric(fabricId ?? ""),
    queryFn: () => api.getFabric(fabricId as string),
    enabled,
    retry: (count, err) => !(isApiClientError(err) && err.isNotFound) && count < 1,
  });
}

/** A fabric from the cached list while its detail is loading (the list screen was almost always open just before). */
export function useCachedFabric(fabricId: string | undefined): Fabric | undefined {
  const qc = useQueryClient();
  return fabricId ? findCachedFabric(qc, fabricId) : undefined;
}

/** After POST/PATCH a fabric or a movement: patch the cached list row and the detail's `fabric`. */
export function cacheFabric(qc: QueryClient, fabric: Fabric): void {
  qc.setQueryData<Fabric[]>(queryKeys.fabrics, (old) => {
    if (!old) return old;
    const found = old.some((f) => f.id === fabric.id);
    const next = found ? old.map((f) => (f.id === fabric.id ? fabric : f)) : [...old, fabric];
    // Same order as the API: low ones first, then by name.
    return next.sort((a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  });
  qc.setQueryData<FabricDetailResponse>(queryKeys.fabric(fabric.id), (old) => (old ? { ...old, fabric } : old));
}

/** After any fabric write: the list, every detail (same prefix) and Home's "running low" count may have changed. */
export function afterFabricChanged(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: queryKeys.fabrics });
  void qc.invalidateQueries({ queryKey: queryKeys.home });
}

/**
 * After a fabric is renamed or removed: the orders cut from it show its name (and lose their link on delete), so
 * refresh those clients' orders and the shop-wide lists too.
 */
export function afterFabricOrdersChanged(qc: QueryClient, clientIds: Iterable<string>): void {
  for (const clientId of new Set(clientIds)) afterOrderChanged(qc, clientId);
  void qc.invalidateQueries({ queryKey: SHOP_ORDERS_KEY });
}

/** After DELETE /fabrics/:id: drop the detail, pull it from the cached list, refresh the rest. */
export function forgetFabric(qc: QueryClient, fabricId: string): void {
  qc.removeQueries({ queryKey: queryKeys.fabric(fabricId), exact: true });
  qc.setQueryData<Fabric[]>(queryKeys.fabrics, (old) => old?.filter((f) => f.id !== fabricId));
  afterFabricChanged(qc);
}
