// Data hook for the Reports screen.
import { useQuery } from "@tanstack/react-query";
import type { ReportResponse } from "@shared/types";

import { useApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

/** GET /reports?month=YYYY-MM. One cache entry per month, so flicking between months is instant the second time. */
export function useReport(month: string) {
  const api = useApi();
  return useQuery<ReportResponse>({
    queryKey: queryKeys.report(month),
    queryFn: () => api.getReport(month),
    retry: 1,
    staleTime: 60_000,
  });
}
