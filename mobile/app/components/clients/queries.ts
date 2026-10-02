// Data hooks, cache helpers and typed hrefs shared by the Clients / Fitting / Order / Win-back screens.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { useEffect, useState } from "react";
import type { Client, Fitting, Message, Order } from "@shared/types";

import { ApiClientError, isApiClientError, useApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { showError } from "@/lib/toast";

/** Prefix shared by every client-list query (any search / filter combination). */
export const CLIENT_LISTS_KEY = ["clients", "list"] as const;
/** Prefix shared by the shop-wide order lists (open and delivered). */
export const SHOP_ORDERS_KEY = ["orders"] as const;

export type ShopOrdersFilter = "open" | "delivered";

/** Typed hrefs for the clients stack, so screens never hand-write pathnames. */
export const clientRoutes = {
  list: "/(tabs)/clients" as const satisfies Href,
  new: "/(tabs)/clients/new" as const satisfies Href,
  /** Shop-wide orders (open / delivered). */
  orders: "/(tabs)/clients/orders" as const satisfies Href,
  detail: (id: string): Href => ({ pathname: "/(tabs)/clients/[id]", params: { id } }),
  edit: (id: string): Href => ({ pathname: "/(tabs)/clients/[id]/edit", params: { id } }),
  winback: (id: string): Href => ({ pathname: "/(tabs)/clients/[id]/winback", params: { id } }),
  newFitting: (id: string): Href => ({ pathname: "/(tabs)/clients/[id]/fitting/new", params: { id } }),
  fitting: (id: string, fittingId: string): Href => ({
    pathname: "/(tabs)/clients/[id]/fitting/[fittingId]",
    params: { id, fittingId },
  }),
  /** New order for a client; `fittingId` preselects the fitting it's cut from. */
  newOrder: (id: string, fittingId?: string): Href => ({
    pathname: "/(tabs)/clients/[id]/orders/new",
    params: { id, ...(fittingId ? { fittingId } : {}) },
  }),
  order: (id: string, orderId: string): Href => ({
    pathname: "/(tabs)/clients/[id]/orders/[orderId]",
    params: { id, orderId },
  }),
  /** One sent email on the client's file. */
  message: (id: string, messageId: string): Href => ({
    pathname: "/(tabs)/clients/[id]/messages/[messageId]",
    params: { id, messageId },
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

/** GET /clients/:id/orders (newest first). */
export function useOrders(clientId: string | undefined) {
  const api = useApi();
  return useQuery<Order[]>({
    queryKey: queryKeys.orders(clientId ?? ""),
    queryFn: async () => (await api.listOrders(clientId as string)).orders,
    enabled: !!clientId,
    retry: (count, err) => !(isApiClientError(err) && err.isNotFound) && count < 1,
  });
}

/** The row the user tapped, if any cached list still holds it, so the detail screen can open without a spinner. */
function findCachedOrder(qc: QueryClient, clientId: string, orderId: string): { order: Order; updatedAt: number } | undefined {
  const keys = [queryKeys.orders(clientId), queryKeys.openOrders("open"), queryKeys.openOrders("delivered")];
  for (const key of keys) {
    const order = qc.getQueryData<Order[]>(key)?.find((o) => o.id === orderId);
    if (order) return { order, updatedAt: qc.getQueryState(key)?.dataUpdatedAt ?? 0 };
  }
  return undefined;
}

/** GET /clients/:id/orders/:orderId. Seeds from a cached list row, then refreshes in the background. */
export function useOrder(clientId: string | undefined, orderId: string | undefined) {
  const api = useApi();
  const qc = useQueryClient();
  const enabled = !!clientId && !!orderId;
  return useQuery<Order>({
    queryKey: queryKeys.order(clientId ?? "", orderId ?? ""),
    queryFn: async () => (await api.getOrder(clientId as string, orderId as string)).order,
    enabled,
    initialData: () => (enabled ? findCachedOrder(qc, clientId, orderId)?.order : undefined),
    initialDataUpdatedAt: () => (enabled ? findCachedOrder(qc, clientId, orderId)?.updatedAt : undefined),
    retry: (count, err) => !(isApiClientError(err) && err.isNotFound) && count < 1,
  });
}

/** GET /orders — open orders shop-wide (overdue → due date → no date), or the delivered ones. Rows carry `clientName`. */
export function useShopOrders(status: ShopOrdersFilter = "open") {
  const api = useApi();
  return useQuery<Order[]>({
    queryKey: queryKeys.openOrders(status),
    queryFn: async () => (await api.listShopOrders(status === "delivered" ? { status } : undefined)).orders,
    retry: 1,
  });
}

/** GET /clients/:id/messages — emails sent to the client, newest first. */
export function useMessages(clientId: string | undefined) {
  const api = useApi();
  return useQuery<Message[]>({
    queryKey: queryKeys.messages(clientId ?? ""),
    queryFn: async () => (await api.listMessages(clientId as string)).messages,
    enabled: !!clientId,
    retry: (count, err) => !(isApiClientError(err) && err.isNotFound) && count < 1,
  });
}

/**
 * One sent message. There's no single-message route, so this seeds from the cached list and otherwise loads the
 * list and picks the message out (caching the list on the way). Messages never change once sent, so never stale.
 */
export function useMessage(clientId: string | undefined, messageId: string | undefined) {
  const api = useApi();
  const qc = useQueryClient();
  const enabled = !!clientId && !!messageId;
  return useQuery<Message>({
    queryKey: queryKeys.message(clientId ?? "", messageId ?? ""),
    queryFn: async () => {
      const messages = (await api.listMessages(clientId as string)).messages;
      qc.setQueryData<Message[]>(queryKeys.messages(clientId as string), messages);
      const found = messages.find((m) => m.id === messageId);
      if (!found) throw new ApiClientError(404, "not_found", "This message is no longer on file.");
      return found;
    },
    enabled,
    initialData: () => (enabled ? qc.getQueryData<Message[]>(queryKeys.messages(clientId))?.find((m) => m.id === messageId) : undefined),
    staleTime: Infinity,
    retry: (count, err) => !(isApiClientError(err) && err.isNotFound) && count < 1,
  });
}

/** After POST /clients/:id/messages: cache the message and put it at the top of the client's cached list. */
export function cacheMessage(qc: QueryClient, message: Message): void {
  qc.setQueryData<Message>(queryKeys.message(message.clientId, message.id), message);
  qc.setQueryData<Message[]>(queryKeys.messages(message.clientId), (old) => {
    if (!old) return old;
    const rest = old.filter((m) => m.id !== message.id);
    return [message, ...rest].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
}

/** After an email is sent: refresh the client's messages (the list only — sent messages don't change), the client file and Home. */
export function afterMessageSent(qc: QueryClient, clientId: string): void {
  void qc.invalidateQueries({ queryKey: queryKeys.messages(clientId), exact: true });
  void qc.invalidateQueries({ queryKey: queryKeys.client(clientId), exact: true });
  void qc.invalidateQueries({ queryKey: queryKeys.home });
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

/** After DELETE /clients/:id: drop the detail + fittings + orders caches (same key prefix), refresh lists, orders + Home. */
export function forgetClient(qc: QueryClient, id: string): void {
  qc.removeQueries({ queryKey: queryKeys.client(id) });
  void qc.invalidateQueries({ queryKey: CLIENT_LISTS_KEY });
  void qc.invalidateQueries({ queryKey: SHOP_ORDERS_KEY });
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

/** After POST/PATCH an order: cache the detail and upsert it into the client's list (kept newest first). */
export function cacheOrder(qc: QueryClient, order: Order): void {
  qc.setQueryData<Order>(queryKeys.order(order.clientId, order.id), order);
  qc.setQueryData<Order[]>(queryKeys.orders(order.clientId), (old) => {
    if (!old) return old;
    const rest = old.filter((o) => o.id !== order.id);
    return [order, ...rest].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
}

/**
 * After any order write: an order changes the client's lastOrderAt, the shop-wide lists and the Home counters,
 * so refresh everything that shows them (the client's orders — detail keys share the prefix — the client file, lists, Home).
 */
export function afterOrderChanged(qc: QueryClient, clientId: string): void {
  void qc.invalidateQueries({ queryKey: queryKeys.orders(clientId) });
  void qc.invalidateQueries({ queryKey: queryKeys.client(clientId), exact: true });
  void qc.invalidateQueries({ queryKey: CLIENT_LISTS_KEY });
  void qc.invalidateQueries({ queryKey: SHOP_ORDERS_KEY });
  void qc.invalidateQueries({ queryKey: queryKeys.home });
}

/** After DELETE /clients/:id/orders/:orderId: drop the detail, pull it from the cached list, refresh the rest. */
export function forgetOrder(qc: QueryClient, clientId: string, orderId: string): void {
  qc.removeQueries({ queryKey: queryKeys.order(clientId, orderId), exact: true });
  qc.setQueryData<Order[]>(queryKeys.orders(clientId), (old) => old?.filter((o) => o.id !== orderId));
  afterOrderChanged(qc, clientId);
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
