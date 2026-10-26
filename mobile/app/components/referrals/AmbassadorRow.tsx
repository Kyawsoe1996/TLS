import { StyleSheet, Text, View } from "react-native";

import { Tag } from "@/components/clients/Tag";
import { colors, fonts, typography } from "@/constants/theme";
import { ambassadorLine } from "@/lib/referral";

import { InitialsCircle } from "./InitialsCircle";
import type { ReferralAmbassador } from "./queries";

export interface AmbassadorRowProps {
  ambassador: ReferralAmbassador;
}

/** A client whose link brought friends: initials, name, "3 friends booked · 2 became clients" and the reward state. */
export function AmbassadorRow({ ambassador }: AmbassadorRowProps) {
  const ready = ambassador.rewardsReady > 0;
  return (
    <View style={styles.row} accessibilityLabel={`${ambassador.name}, ${ambassadorLine(ambassador.friendsBooked, ambassador.becameClients)}`}>
      <InitialsCircle name={ambassador.name} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {ambassador.name || "Client"}
        </Text>
        <Text style={typography.small} numberOfLines={1}>
          {ambassadorLine(ambassador.friendsBooked, ambassador.becameClients)}
        </Text>
      </View>
      {ready ? (
        <Tag label={ambassador.rewardsReady === 1 ? "Reward ready" : `${ambassador.rewardsReady} rewards ready`} tone="success" icon="gift-outline" />
      ) : (
        <Tag label="After friend's first order" tone="neutral" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.ink },
});
