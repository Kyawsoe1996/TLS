import { StyleSheet, Text, View } from "react-native";
import type { ReferralReward } from "@shared/types";

import { Tag } from "@/components/clients/Tag";
import { Button } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { rewardDetailLine, rewardStatusLabel, rewardStatusTone, rewardTitle } from "@/lib/referral";

export interface RewardRowProps {
  reward: ReferralReward;
  /** The shop's client offer (Shop.referralClientOffer); "Reward" when not set. */
  clientOffer: string | null;
  /** False on the ambassador's own file, where "for <ambassador>" would be redundant. */
  showAmbassador?: boolean;
  /** When set and the reward is ready, a small "Mark as given" button calls it with the reward id. */
  onMarkGiven?: (rewardId: string) => void;
  /** The mark-as-given request for this reward is in flight. */
  marking?: boolean;
}

/** One reward: "<client offer> for <ambassador>", where it came from, and a Mark as given button once it's ready. */
export function RewardRow({ reward, clientOffer, showAmbassador = true, onMarkGiven, marking = false }: RewardRowProps) {
  const title = showAmbassador ? rewardTitle(clientOffer, reward.ambassadorName) : rewardTitle(clientOffer, "");
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={typography.small}>{rewardDetailLine(reward)}</Text>
      </View>
      {reward.status === "ready" && onMarkGiven ? (
        <Button size="sm" variant="gold" title="Mark as given" loading={marking} onPress={() => onMarkGiven(reward.id)} />
      ) : (
        <Tag label={rewardStatusLabel(reward.status)} tone={rewardStatusTone(reward.status)} icon={reward.status === "given" ? "checkmark" : undefined} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.ink },
});
