// Data hooks, cache helpers and typed hrefs shared by the Clients / Fitting / Win-back screens.
import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { useEffect, useState } from "react";
import type { Client, Fitting } from "@shared/types";

import { isApiClientError, useApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { showError } from "@/lib/toast";

/** Prefix shared by every client-list query (any search / filter combination). */
export const CLIENT_LISTS_KEY = ["clients", "list"] as const;

/** Typed hrefs for the clients stack, so screens never hand-write pathnames. */
export const clientRoutes = {
  list: "/(tabs)/clients" as const satisfies Href,
  new: "/(tabs)/clients/new" as const satisfies Href,
  detail: (id: string): Href => ({ pathname: "/(tabs)/clients/[id]", params: { id } }),
  edit: (id: string): Href => ({ pathname: "/(tabs)/clients/[id]/edit", params: { id } }),
  winback: (id: string): Href => ({ pathname: "/(tabs)/clients/[id]/winback", params: { id } }),
  newFitting: (id: string): Href => ({ pathname: "/(tabs)/clients/[id]/fitting/new", params: { id } }),
  fitting: (id: string, fittingId: string): Href => ({
    pathname: "/(tabs)/clients/[id]/fitting/[fittingId]",
    params: { id, fittingId },
  }),
};

/** GET /clients/:id. A 404 is not retried (the client was deleted). */
export function useClient(id: string | undefined) {
  const api = useApi();
  return useQuery<Client>({
    queryKey: queryKeys.client(id ?? ""),
    queryFn: async () => (await api.getClient(id as string)).client,
    enabled: !!id,
    retry: (count, err) => !(isApiClientError(err) && err.isNotFound) && count < 1,
  });
}

/** GET /clients/:id/fittings (newest first). */
export function useFittings(clientId: string | undefined) {
  const api = useApi();
  return useQuery<Fitting[]>({
    queryKey: queryKeys.fittings(clientId ?? ""),
    queryFn: async () => (await api.listFittings(clientId as string)).fittings,
    enabled: !!clientId,
    retry: (count, err) => !(isApiClientError(err) && err.isNotFound) && count < 1,
  });
}

/** True when a query failed because the record no longer exists. */
export function isNotFoundError(err: unknown): boolean {
  return isApiClientError(err) && err.isNotFound;
}

/** After POST/PATCH /clients: cache the client and refresh every list + Home. */
export function cacheClient(qc: QueryClient, client: Client): void {
  qc.setQueryData<Client>(queryKeys.client(client.id), client);
  void qc.invalidateQueries({ queryKey: CLIENT_LISTS_KEY });
  void qc.invalidateQueries({ queryKey: queryKeys.home });
}

/** After DELETE /clients/:id: drop the detail + fittings caches (same key prefix), refresh lists + Home. */
export function forgetClient(qc: QueryClient, id: string): void {
  qc.removeQueries({ queryKey: queryKeys.client(id) });
  void qc.invalidateQueries({ queryKey: CLIENT_LISTS_KEY });
  void qc.invalidateQueries({ queryKey: queryKeys.home });
}

/** Upsert a fitting into its client's cached list (kept newest first). No-op when the list isn't cached yet. */
export function cacheFitting(qc: QueryClient, fitting: Fitting): void {
  qc.setQueryData<Fitting[]>(queryKeys.fittings(fitting.clientId), (old) => {
    if (!old) return old;
    const rest = old.filter((f) => f.id !== fitting.id);
    return [fitting, ...rest].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
}

/** After POST /clients/:id/fittings: the fitting also bumps the client's lastOrderAt, so refresh everything that shows it. */
export function afterFittingCreated(qc: QueryClient, fitting: Fitting): void {
  cacheFitting(qc, fitting);
  void qc.invalidateQueries({ queryKey: queryKeys.fittings(fitting.clientId) });
  void qc.invalidateQueries({ queryKey: queryKeys.client(fitting.clientId), exact: true });
  void qc.invalidateQueries({ queryKey: CLIENT_LISTS_KEY });
  void qc.invalidateQueries({ queryKey: queryKeys.home });
}

/** AI routes are rate limited: surface the server's own message with a calmer title. */
export function showAiError(err: unknown, title = "AI couldn't finish"): void {
  if (isApiClientError(err) && err.isRateLimited) {
    showError(err, "One moment");
    return;
  }
  showError(err, title);
}

/** Returns `value` after it has stopped changing for `delay` ms. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
