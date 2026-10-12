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
  CreatePostRequest,
  FittingResponse,
  AiConsentResponse,
  GetShopResponse,
  HomeResponse,
  ListClientsResponse,
  ListFittingsResponse,
  ListMessagesResponse,
  ListOrdersResponse,
  ListPostsResponse,
  MessageResponse,
  OrderResponse,
  PostResponse,
  PostStatus,
  SendMessageRequest,
  UpdateClientRequest,
  UpdateOrderRequest,
  UpdatePostRequest,
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
  /** /ai/* refused because the owner hasn't agreed to the AI data sharing yet (see useAiConsent). */
  get isConsentRequired() {
    return this.status === 403 || this.code === "consent_required";
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

/** A photo or video picked on the device, ready for PUT /posts/:id/media. */
export interface MediaFile {
  /** Local file URI from the picker. */
  uri: string;
  /** One of MEDIA_LIMITS.imageTypes / videoTypes. */
  mimeType: string;
  width?: number | null;
  height?: number | null;
  /** Seconds (videos only). */
  duration?: number | null;
  /** Bytes, when the picker reports it. */
  size?: number | null;
}

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
  const clientPath = (id: string) => `/clients/${encodeURIComponent(id)}`;
  const orderPath = (clientId: string, orderId: string) => `${clientPath(clientId)}/orders/${encodeURIComponent(orderId)}`;
  const postPath = (id: string) => `/posts/${encodeURIComponent(id)}`;

  /** Sends a prepared fetch and turns the response into `T` or an ApiClientError. */
  async function send<T>(url: string, init: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, init);
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

  async function authHeaders(): Promise<Record<string, string>> {
    const token = await getToken();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, query, signal } = options;
    const headers = await authHeaders();
    if (body !== undefined) headers["Content-Type"] = "application/json";
    return send<T>(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  }

  /**
   * PUT /posts/:id/media — the file goes up as the raw request body (no multipart), with its type in Content-Type
   * and the optional dimensions / duration in X-Media-* headers. Reads the local file through fetch() first.
   */
  async function uploadPostMedia(postId: string, file: MediaFile): Promise<PostResponse> {
    let blob: Blob;
    try {
      blob = await (await fetch(file.uri)).blob();
    } catch {
      throw new ApiClientError(0, "network", "Couldn't read the file from your phone. Try picking it again.");
    }
    const headers = await authHeaders();
    headers["Content-Type"] = file.mimeType;
    if (file.width) headers["X-Media-Width"] = String(Math.round(file.width));
    if (file.height) headers["X-Media-Height"] = String(Math.round(file.height));
    if (file.duration) headers["X-Media-Duration"] = String(Math.round(file.duration * 10) / 10);
    return send<PostResponse>(buildUrl(`${postPath(postId)}/media`), { method: "PUT", headers, body: blob });
  }

  return {
    /** Raw typed request — for routes not covered by the helpers below. */
    request,

    // ---- Shop ----
    getShop: () => request<GetShopResponse>("/shop"),
    upsertShop: (body: UpsertShopRequest) => request<UpsertShopResponse>("/shop", { method: "PUT", body }),
    /** Records the owner's agreement to send client details to Google Gemini; required before any ai* call. */
    recordAiConsent: () => request<AiConsentResponse>("/shop/ai-consent", { method: "POST" }),

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

    // ---- Posts (content library) ----
    /** Newest first; `status` narrows to drafts / shared, `q` searches title and topic. */
    listPosts: (params?: { status?: PostStatus; q?: string }) =>
      request<ListPostsResponse>("/posts", { query: { status: params?.status, q: params?.q } }),
    createPost: (body: CreatePostRequest) => request<PostResponse>("/posts", { method: "POST", body }),
    getPost: (id: string) => request<PostResponse>(postPath(id)),
    updatePost: (id: string, body: UpdatePostRequest) => request<PostResponse>(postPath(id), { method: "PATCH", body }),
    deletePost: (id: string) => request<void>(postPath(id), { method: "DELETE" }),
    /** → 201 with the copy (a new draft, media included). */
    duplicatePost: (id: string) => request<PostResponse>(`${postPath(id)}/duplicate`, { method: "POST" }),
    /** Marks the post shared (status "shared", sharedAt now). */
    markPostShared: (id: string) => request<PostResponse>(`${postPath(id)}/shared`, { method: "POST" }),
    uploadPostMedia,
    deletePostMedia: (id: string) => request<PostResponse>(`${postPath(id)}/media`, { method: "DELETE" }),

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
