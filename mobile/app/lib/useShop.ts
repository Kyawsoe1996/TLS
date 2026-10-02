// GET /shop as a react-query hook. `data === null` means the user hasn't onboarded yet (API 404).
// The cache holds the whole response ({ shop, email }); `useShop` and `useEmailStatus` each select their slice.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EmailStatus, GetShopResponse, Shop } from "@shared/types";

import { isApiClientError, useApi } from "./api";
import { queryKeys } from "./queryKeys";

type ShopCache = GetShopResponse | null;

function useShopQuery<T>(select: (res: ShopCache) => T, options: { enabled?: boolean } = {}) {
  const api = useApi();
  return useQuery<ShopCache, Error, T>({
    queryKey: queryKeys.shop,
    queryFn: async () => {
      try {
        return await api.getShop();
      } catch (err) {
        if (isApiClientError(err) && err.isNotFound) return null;
        throw err;
      }
    },
    select,
    enabled: options.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    retry: (count, err) => !(isApiClientError(err) && (err.isUnauthorized || err.isNotFound)) && count < 2,
  });
}

const selectShop = (res: ShopCache): Shop | null => res?.shop ?? null;
const selectEmail = (res: ShopCache): EmailStatus | null => res?.email ?? null;

/** The shop, or `null` before onboarding. */
export function useShop(options: { enabled?: boolean } = {}) {
  return useShopQuery(selectShop, options);
}

/** Whether the API can really send email and the sender it uses; `null` until /shop has loaded. */
export function useEmailStatus() {
  return useShopQuery(selectEmail);
}

/** Writes a freshly saved shop into the cache (after PUT /shop) and refreshes Home. */
export function useSetShop() {
  const queryClient = useQueryClient();
  return (res: GetShopResponse) => {
    queryClient.setQueryData<ShopCache>(queryKeys.shop, res);
    void queryClient.invalidateQueries({ queryKey: queryKeys.home });
  };
}
