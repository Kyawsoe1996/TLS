// Typed API client for the TLS backend. Shapes come from the shared contract (@shared/types).
import { useAuth } from "@clerk/clerk-expo";
import { useMemo } from "react";

import type {
  AiFitRequest,
  AiFitResponse,
  AiPostRequest,
  AiPostResponse,
  AiSeoRequest,
  AiSeoResponse,
  AiWinbackRequest,
  AiWinbackResponse,
  ApiError,
  ClientResponse,
  CreateClientRequest,
  CreateFittingRequest,
  CreateOrderRequest,
  FittingResponse,
  GetShopResponse,
  HomeResponse,
  ListClientsResponse,
  ListFittingsResponse,
  ListMessagesResponse,
  ListOrdersResponse,
  MessageResponse,
  OrderResponse,
  SendMessageRequest,
  UpdateClientRequest,
  UpdateOrderRequest,
  UpsertShopRequest,
  UpsertShopResponse,
} from "@shared/types";

/** Where `wrangler dev` listens; only used as a fallback in development builds. */
const DEV_API_URL = "http://localhost:8787";

/**
 * Base URL of the API (no trailing slash). Also used for /privacy and /support links.
 * Empty in a release build when EXPO_PUBLIC_API_URL is unset — the root layout then shows
 * the "Missing configuration" screen instead of silently calling localhost.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? DEV_API_URL : "")).replace(/\/+$/, "");

export type ApiErrorCode = ApiError["error"]["code"];

/** Thrown for any non-2xx response, or "network" when the request never reached the server. */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | "network";

  constructor(status: number, code: ApiErrorCode | "network", message: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }

  get isNotFound() {
    return this.status === 404 || this.code === "not_found";
  }
  get isUnauthorized() {
    return this.status === 401 || this.code === "unauthorized";
  }
  get isRateLimited() {
    return this.status === 429 || this.code === "rate_limited";
  }
}

export function isApiClientError(err: unknown): err is ApiClientError {
  return err instanceof ApiClientError;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: Method;
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
}

export type GetToken = () => Promise<string | null>;

function isApiError(value: unknown): value is ApiError {
  if (!value || typeof value !== "object") return false;
  const e = (value as { error?: unknown }).error;
  return !!e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string";
}

function fallbackCode(status: number): ApiErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 422) return "bad_request";
  if (status === 502) return "ai_failed";
  return "server_error";
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Builds the typed client. Prefer `useApi()` inside components; use this directly only when
 * you already have a `getToken` function (e.g. outside React).
 */
export function createApi(getToken: GetToken) {
  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, query, signal } = options;
    const token = await getToken();

    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(buildUrl(path, query), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      });
    } catch (err) {
      const message = err instanceof Error && err.name === "AbortError" ? "Request cancelled." : "Can't reach the server. Check your connection and try again.";
      throw new ApiClientError(0, "network", message);
    }

    if (res.status === 204) return undefined as T;

    const text = await res.text();
    let json: unknown;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }

    if (!res.ok) {
      const apiError = isApiError(json) ? json.error : undefined;
      throw new ApiClientError(
        res.status,
        apiError?.code ?? fallbackCode(res.status),
        apiError?.message ?? `Request failed (${res.status}).`,
      );
    }

    return json as T;
  }

  const clientPath = (id: string) => `/clients/${encodeURIComponent(id)}`;
  const orderPath = (clientId: string, orderId: string) => `${clientPath(clientId)}/orders/${encodeURIComponent(orderId)}`;

  return {
    /** Raw typed request — for routes not covered by the helpers below. */
    request,

    // ---- Shop ----
    getShop: () => request<GetShopResponse>("/shop"),
    upsertShop: (body: UpsertShopRequest) => request<UpsertShopResponse>("/shop", { method: "PUT", body }),

    // ---- Home ----
    getHome: () => request<HomeResponse>("/home"),

    // ---- Clients ----
    listClients: (params?: { search?: string; inactive?: boolean }) =>
      request<ListClientsResponse>("/clients", {
        query: { search: params?.search, inactive: params?.inactive ? "true" : undefined },
      }),
    createClient: (body: CreateClientRequest) => request<ClientResponse>("/clients", { method: "POST", body }),
    getClient: (id: string) => request<ClientResponse>(clientPath(id)),
    updateClient: (id: string, body: UpdateClientRequest) =>
      request<ClientResponse>(clientPath(id), { method: "PATCH", body }),
    deleteClient: (id: string) => request<void>(clientPath(id), { method: "DELETE" }),

    // ---- Fittings ----
    listFittings: (clientId: string) => request<ListFittingsResponse>(`${clientPath(clientId)}/fittings`),
    createFitting: (clientId: string, body: CreateFittingRequest) =>
      request<FittingResponse>(`${clientPath(clientId)}/fittings`, { method: "POST", body }),

    // ---- Orders ----
    listOrders: (clientId: string) => request<ListOrdersResponse>(`${clientPath(clientId)}/orders`),
    createOrder: (clientId: string, body: CreateOrderRequest) =>
      request<OrderResponse>(`${clientPath(clientId)}/orders`, { method: "POST", body }),
    getOrder: (clientId: string, orderId: string) => request<OrderResponse>(orderPath(clientId, orderId)),
    updateOrder: (clientId: string, orderId: string, body: UpdateOrderRequest) =>
      request<OrderResponse>(orderPath(clientId, orderId), { method: "PATCH", body }),
    deleteOrder: (clientId: string, orderId: string) => request<void>(orderPath(clientId, orderId), { method: "DELETE" }),
    /** Shop-wide: open orders (overdue first, then by due date, no date last) or, with `status: "delivered"`, the delivered ones. */
    listShopOrders: (params?: { status?: "delivered" }) =>
      request<ListOrdersResponse>("/orders", { query: { status: params?.status } }),

    // ---- Messages (emails sent to a client) ----
    listMessages: (clientId: string) => request<ListMessagesResponse>(`${clientPath(clientId)}/messages`),
    /** Sends right away to the client's email address (400 when they have none). Returns the saved message with its status. */
    sendMessage: (clientId: string, body: SendMessageRequest) =>
      request<MessageResponse>(`${clientPath(clientId)}/messages`, { method: "POST", body }),

    // ---- AI ----
    aiFit: (body: AiFitRequest) => request<AiFitResponse>("/ai/fit", { method: "POST", body }),
    aiSeo: (body: AiSeoRequest) => request<AiSeoResponse>("/ai/seo", { method: "POST", body }),
    aiPost: (body: AiPostRequest) => request<AiPostResponse>("/ai/post", { method: "POST", body }),
    aiWinback: (body: AiWinbackRequest) => request<AiWinbackResponse>("/ai/winback", { method: "POST", body }),

    // ---- Account ----
    deleteAccount: () => request<void>("/account", { method: "DELETE" }),
  };
}

export type Api = ReturnType<typeof createApi>;

/** Typed fetch wrapper bound to the current Clerk session. */
export function useApi(): Api {
  const { getToken } = useAuth();
  return useMemo(() => createApi(() => getToken()), [getToken]);
}
