// Data hooks, cache helpers and typed hrefs for the free shop website (Settings → Your free website, the enquiries).
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Href } from "expo-router";
import type {
  ListWebsiteEnquiriesResponse,
  UpdateWebsiteRequest,
  WebsiteEnquiry,
  WebsitePortfolioResponse,
  WebsiteResponse,
} from "@shared/types";

import { isApiClientError, useApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { showError } from "@/lib/toast";

/** Typed hrefs for the website screens (root stack, registered in app/_layout.tsx). */
export const websiteRoutes = {
  settings: "/website" as const satisfies Href,
  enquiries: "/website/enquiries" as const satisfies Href,
  enquiry: (enquiryId: string): Href => ({ pathname: "/website/enquiries/[enquiryId]", params: { enquiryId } }),
  portfolio: "/website/portfolio" as const satisfies Href,
  services: "/website/services" as const satisfies Href,
  reviews: "/website/reviews" as const satisfies Href,
  cover: "/website/cover" as const satisfies Href,
  about: "/website/about" as const satisfies Href,
};

/** GET /website — the switch, the link, the page's own fields and the enquiry counts (makes the slug on first call). */
export function useWebsite(options: { enabled?: boolean } = {}) {
  const api = useApi();
  return useQuery<WebsiteResponse>({
    queryKey: queryKeys.website,
    queryFn: () => api.getWebsite(),
    enabled: options.enabled ?? true,
    retry: 1,
  });
}

/** GET /website/enquiries — new first, newest first. */
export function useWebsiteEnquiries() {
  const api = useApi();
  return useQuery<ListWebsiteEnquiriesResponse>({
    queryKey: queryKeys.websiteEnquiries,
    queryFn: () => api.listWebsiteEnquiries(),
    retry: 1,
  });
}

/** The enquiry the user tapped, if the cached list still holds it, so the detail screen opens without a spinner. */
function findCachedEnquiry(qc: QueryClient, id: string): { enquiry: WebsiteEnquiry; updatedAt: number } | undefined {
  const enquiry = qc.getQueryData<ListWebsiteEnquiriesResponse>(queryKeys.websiteEnquiries)?.enquiries.find((e) => e.id === id);
  if (!enquiry) return undefined;
  return { enquiry, updatedAt: qc.getQueryState(queryKeys.websiteEnquiries)?.dataUpdatedAt ?? 0 };
}

/** GET /website/enquiries/:id. Seeds from the cached list row, then refreshes. A 404 is not retried. */
export function useWebsiteEnquiry(enquiryId: string | undefined) {
  const api = useApi();
  const qc = useQueryClient();
  const enabled = !!enquiryId;
  return useQuery<WebsiteEnquiry>({
    queryKey: queryKeys.websiteEnquiry(enquiryId ?? ""),
    queryFn: async () => (await api.getWebsiteEnquiry(enquiryId as string)).enquiry,
    enabled,
    initialData: () => (enabled ? findCachedEnquiry(qc, enquiryId)?.enquiry : undefined),
    initialDataUpdatedAt: () => (enabled ? findCachedEnquiry(qc, enquiryId)?.updatedAt : undefined),
    retry: (count, err) => !(isApiClientError(err) && err.isNotFound) && count < 1,
  });
}

/** After an enquiry write: cache it and patch its row in the cached list. */
export function cacheWebsiteEnquiry(qc: QueryClient, enquiry: WebsiteEnquiry): void {
  qc.setQueryData<WebsiteEnquiry>(queryKeys.websiteEnquiry(enquiry.id), enquiry);
  qc.setQueryData<ListWebsiteEnquiriesResponse>(queryKeys.websiteEnquiries, (old) =>
    old ? { enquiries: old.enquiries.map((e) => (e.id === enquiry.id ? enquiry : e)) } : old,
  );
}

/** After any website write: the settings + enquiries (one key prefix), Home's count and the shop (it carries the website fields). */
export function afterWebsiteChanged(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: queryKeys.website });
  void qc.invalidateQueries({ queryKey: queryKeys.home });
  void qc.invalidateQueries({ queryKey: queryKeys.shop });
}

/** PUT /website as a mutation; the response replaces the cached settings. Errors are left to the caller (a 400 belongs under a field). */
export function useUpdateWebsite() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateWebsiteRequest) => api.updateWebsite(body),
    onSuccess: (data) => {
      qc.setQueryData<WebsiteResponse>(queryKeys.website, data);
      void qc.invalidateQueries({ queryKey: queryKeys.home });
      void qc.invalidateQueries({ queryKey: queryKeys.shop });
    },
  });
}

/** POST /website/enquiries/:id/status as a mutation. */
export function useSetEnquiryStatus(enquiryId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: "contacted" | "dismissed" | "new") => api.setWebsiteEnquiryStatus(enquiryId, status),
    onSuccess: ({ enquiry }) => {
      cacheWebsiteEnquiry(qc, enquiry);
      afterWebsiteChanged(qc);
    },
    onError: (err) => showError(err, "Couldn't update the enquiry"),
  });
}

/** GET /website/portfolio — the pieces, the cover and the order / post photos that can be added. */
export function useWebsitePortfolio() {
  const api = useApi();
  return useQuery<WebsitePortfolioResponse>({
    queryKey: queryKeys.websitePortfolio,
    queryFn: () => api.getWebsitePortfolio(),
    retry: 1,
  });
}

/**
 * A website content write (pieces, services, reviews, photos) as a mutation: on success the whole website cache is
 * refreshed (settings, portfolio, counts). Errors show a toast with `errorTitle` unless the caller handles them.
 */
export function useWebsiteAction<TVars, TResult>(fn: (api: ReturnType<typeof useApi>, vars: TVars) => Promise<TResult>, errorTitle: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => fn(api, vars),
    onSuccess: (result) => {
      // A WebsiteResponse (tailor photo) can go straight into the settings cache.
      if (result && typeof result === "object" && "slug" in result && "theme" in result) {
        qc.setQueryData<WebsiteResponse>(queryKeys.website, result as unknown as WebsiteResponse);
      }
      void qc.invalidateQueries({ queryKey: queryKeys.website });
    },
    onError: (err) => showError(err, errorTitle),
  });
}
