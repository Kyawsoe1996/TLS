// Data hooks, cache helpers and typed hrefs for Smart Referral (the Grow screens, the Invite sheet and the client file).
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Href } from "expo-router";
import type { ClientReferralResponse, ReferralLead, ReferralOverviewResponse, ReferralReward } from "@shared/types";

import { isApiClientError, useApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { showError, showToast } from "@/lib/toast";

/** One row of ReferralOverviewResponse.ambassadors. */
export type ReferralAmbassador = ReferralOverviewResponse["ambassadors"][number];

/** Typed hrefs for the referral screens in the grow stack, so screens never hand-write pathnames. */
export const referralRoutes = {
  overview: "/(tabs)/grow/referrals" as const satisfies Href,
  offer: "/(tabs)/grow/referrals/offer" as const satisfies Href,
  lead: (leadId: string): Href => ({ pathname: "/(tabs)/grow/referrals/leads/[leadId]", params: { leadId } }),
};

/** GET /referrals — the overview: offer, counters, leads, ambassadors and rewards. */
export function useReferrals() {
  const api = useApi();
  return useQuery<ReferralOverviewResponse>({
    queryKey: queryKeys.referrals,
    queryFn: () => api.getReferrals(),
    retry: 1,
  });
}

/** The lead the user tapped, if the cached overview still holds it, so the lead screen opens without a spinner. */
function findCachedLead(qc: QueryClient, leadId: string): { lead: ReferralLead; updatedAt: number } | undefined {
  const lead = qc.getQueryData<ReferralOverviewResponse>(queryKeys.referrals)?.leads.find((l) => l.id === leadId);
  if (!lead) return undefined;
  return { lead, updatedAt: qc.getQueryState(queryKeys.referrals)?.dataUpdatedAt ?? 0 };
}

/** GET /referrals/leads/:id. Seeds from the cached overview row, then refreshes in the background. A 404 is not retried. */
export function useReferralLead(leadId: string | undefined) {
  const api = useApi();
  const qc = useQueryClient();
  const enabled = !!leadId;
  return useQuery<ReferralLead>({
    queryKey: queryKeys.referralLead(leadId ?? ""),
    queryFn: async () => (await api.getReferralLead(leadId as string)).lead,
    enabled,
    initialData: () => (enabled ? findCachedLead(qc, leadId)?.lead : undefined),
    initialDataUpdatedAt: () => (enabled ? findCachedLead(qc, leadId)?.updatedAt : undefined),
    retry: (count, err) => !(isApiClientError(err) && err.isNotFound) && count < 1,
  });
}

/**
 * GET /clients/:id/referral — the client's personal link, the ready-made message and what it brought in. The API
 * makes the code on the first call, so callers fetch it lazily (`enabled`) rather than for every client row.
 */
export function useClientReferral(clientId: string | undefined, options: { enabled?: boolean } = {}) {
  const api = useApi();
  return useQuery<ClientReferralResponse>({
    queryKey: queryKeys.clientReferral(clientId ?? ""),
    queryFn: () => api.getClientReferral(clientId as string),
    enabled: !!clientId && (options.enabled ?? true),
    retry: (count, err) => !(isApiClientError(err) && err.isNotFound) && count < 1,
  });
}

/** After POST add / dismiss: cache the lead and patch its row in the cached overview. */
export function cacheReferralLead(qc: QueryClient, lead: ReferralLead): void {
  qc.setQueryData<ReferralLead>(queryKeys.referralLead(lead.id), lead);
  qc.setQueryData<ReferralOverviewResponse>(queryKeys.referrals, (old) =>
    old ? { ...old, leads: old.leads.map((l) => (l.id === lead.id ? lead : l)) } : old,
  );
}

/** After POST rewards/:id/given: patch the reward in the cached overview and on the ambassador's cached file. */
export function cacheReferralReward(qc: QueryClient, reward: ReferralReward): void {
  qc.setQueryData<ReferralOverviewResponse>(queryKeys.referrals, (old) => {
    if (!old) return old;
    const rewards = old.rewards.map((r) => (r.id === reward.id ? reward : r));
    return { ...old, rewards, rewardsReady: rewards.filter((r) => r.status === "ready").length };
  });
  qc.setQueryData<ClientReferralResponse>(queryKeys.clientReferral(reward.ambassadorClientId), (old) =>
    old ? { ...old, rewards: old.rewards.map((r) => (r.id === reward.id ? reward : r)) } : old,
  );
}

/**
 * After any referral write: the overview (and every cached lead under its key prefix), Home's "new friends" count
 * and the named ambassadors' own link stats are stale.
 */
export function afterReferralChanged(qc: QueryClient, ambassadorIds: readonly string[] = []): void {
  void qc.invalidateQueries({ queryKey: queryKeys.referrals });
  void qc.invalidateQueries({ queryKey: queryKeys.home });
  for (const id of ambassadorIds) void qc.invalidateQueries({ queryKey: queryKeys.clientReferral(id), exact: true });
}

/** POST /referrals/rewards/:id/given as a mutation; pass the reward id to `mutate`. Shared by the overview, the lead screen and the client file. */
export function useMarkRewardGiven() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rewardId: string) => api.markRewardGiven(rewardId),
    onSuccess: ({ reward }) => {
      cacheReferralReward(qc, reward);
      afterReferralChanged(qc, [reward.ambassadorClientId]);
      showToast("Marked as given", `${reward.ambassadorName || "The ambassador"} has received their reward.`);
    },
    onError: (err) => showError(err, "Couldn't mark the reward"),
  });
}
