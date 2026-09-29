// GET /shop as a react-query hook. `data === null` means the user hasn't onboarded yet (API 404).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Shop } from "@shared/types";

import { isApiClientError, useApi } from "./api";
import { queryKeys } from "./queryKeys";

export function useShop(options: { enabled?: boolean } = {}) {
  const api = useApi();
  return useQuery<Shop | null>({
    queryKey: queryKeys.shop,
    queryFn: async () => {
      try {
        const res = await api.getShop();
        return res.shop;
      } catch (err) {
        if (isApiClientError(err) && err.isNotFound) return null;
        throw err;
      }
    },
    enabled: options.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    retry: (count, err) => !(isApiClientError(err) && (err.isUnauthorized || err.isNotFound)) && count < 2,
  });
}

/** Writes a freshly saved shop into the cache (after PUT /shop) and refreshes Home. */
export function useSetShop() {
  const queryClient = useQueryClient();
  return (shop: Shop) => {
    queryClient.setQueryData<Shop | null>(queryKeys.shop, shop);
    void queryClient.invalidateQueries({ queryKey: queryKeys.home });
  };
}
