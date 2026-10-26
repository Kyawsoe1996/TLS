import { useRouter } from "expo-router";
import { Fragment, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ReferralOverviewResponse } from "@shared/types";

import { ErrorBlock, LoadingBlock } from "@/components/clients";
import { AmbassadorRow, LeadRow, RewardRow, referralRoutes, useMarkRewardGiven, useReferrals } from "@/components/referrals";
import { Button, Card, Eyebrow, Screen } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";

/**
 * Smart Referral overview: the offer, four counters, the friends who booked (tap → lead screen), the top ambassadors
 * and the rewards with "Mark as given". Invitations themselves start from a client's file (Invite a friend).
 */
export default function ReferralsScreen() {
  const query = useReferrals();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen back eyebrow="Grow" title="Smart Referral" subtitle="Your clients bring the next ones." refreshing={refreshing} onRefresh={() => void onRefresh()}>
      {query.isPending ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : (
        <Overview data={query.data} />
      )}
    </Screen>
  );
}

/** Loaded state. */
function Overview({ data }: { data: ReferralOverviewResponse }) {
  const router = useRouter();
  const markGiven = useMarkRewardGiven();
  const hasOffer = !!(data.friendOffer || data.clientOffer);

  return (
    <>
      <Card variant="dark" style={styles.offerCard}>
        <Eyebrow tone="onDark">The offer</Eyebrow>
        {hasOffer ? (
          <View style={styles.offerRows}>
            <OfferRow label="Friend gets" value={data.friendOffer} />
            <OfferRow label="Client gets" value={data.clientOffer} />
          </View>
        ) : (
          <Text style={styles.offerEmpty}>Set up your offer: what a friend gets on their first order, and what the client who sent them gets.</Text>
        )}
        <Text style={styles.released}>Released: when the friend&apos;s first order is delivered</Text>
        <Button variant="gold" size="sm" icon="pencil-outline" title="Edit the offer" onPress={() => router.push(referralRoutes.offer)} testID="referrals-edit-offer" />
      </Card>

      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <StatCard label="Links shared" value={data.linksShared} />
          <StatCard label="Friends booked" value={data.friendsBooked} />
        </View>
        <View style={styles.gridRow}>
          <StatCard label="Became clients" value={data.becameClients} />
          <StatCard label="Rewards to give" value={data.rewardsReady} alert={data.rewardsReady > 0} />
        </View>
      </View>

      <Card style={styles.listCard}>
        <Text style={typography.h3}>Friends who booked</Text>
        {data.leads.length === 0 ? (
          <Text style={typography.small}>No one yet. When a friend asks for a fitting through a client&apos;s link, they appear here.</Text>
        ) : (
          <View>
            {data.leads.map((lead, i) => (
              <Fragment key={lead.id}>
                {i > 0 ? <View style={styles.divider} /> : null}
                <LeadRow lead={lead} onPress={() => router.push(referralRoutes.lead(lead.id))} />
              </Fragment>
            ))}
          </View>
        )}
      </Card>

      <Card style={styles.listCard}>
        <Text style={typography.h3}>Top ambassadors</Text>
        {data.ambassadors.length === 0 ? (
          <Text style={typography.small}>The clients whose links bring friends will be ranked here.</Text>
        ) : (
          <View>
            {data.ambassadors.map((ambassador, i) => (
              <Fragment key={ambassador.clientId}>
                {i > 0 ? <View style={styles.divider} /> : null}
                <AmbassadorRow ambassador={ambassador} />
              </Fragment>
            ))}
          </View>
        )}
      </Card>

      <Card style={styles.listCard}>
        <Text style={typography.h3}>Rewards</Text>
        {data.rewards.length === 0 ? (
          <Text style={typography.small}>A reward opens when a friend is added as a client, and is ready to give once their first order is delivered.</Text>
        ) : (
          <View>
            {data.rewards.map((reward, i) => (
              <Fragment key={reward.id}>
                {i > 0 ? <View style={styles.divider} /> : null}
                <RewardRow
                  reward={reward}
                  clientOffer={data.clientOffer}
                  onMarkGiven={(id) => markGiven.mutate(id)}
                  marking={markGiven.isPending && markGiven.variables === reward.id}
                />
              </Fragment>
            ))}
          </View>
        )}
      </Card>

      <Text style={styles.footnote}>To invite someone, open a client&apos;s file and tap Invite a friend.</Text>
    </>
  );
}

function OfferRow({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.offerRow}>
      <Text style={styles.offerLabel}>{label}</Text>
      <Text style={[styles.offerValue, !value && styles.offerValueMissing]}>{value ?? "Not set yet"}</Text>
    </View>
  );
}

/** White stat card: small label, big serif number (red when `alert`). */
function StatCard({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <Card padding={14} style={styles.stat} testID={`referrals-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.statValue, alert && styles.statValueAlert]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  offerCard: { gap: 12 },
  offerRows: { gap: 10 },
  offerRow: { gap: 2 },
  offerLabel: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", color: colors.ivorySoft },
  offerValue: { fontFamily: fonts.serifSemi, fontSize: 20, lineHeight: 25, color: colors.ivory },
  offerValueMissing: { color: colors.ivorySoft, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  offerEmpty: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.ivorySoft },
  released: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.gold },
  grid: { gap: 10 },
  gridRow: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, minWidth: 0, gap: 4 },
  statLabel: { ...typography.small, fontFamily: fonts.bodyMedium },
  statValue: typography.kpi,
  statValueAlert: { color: colors.dangerDeep },
  listCard: { gap: 8 },
  divider: { height: 1, backgroundColor: colors.line },
  footnote: { ...typography.small, textAlign: "center", paddingHorizontal: 12 },
});
