// "Ask for a review" on a delivered order: a thank-you email with the shop's Google review link, sent once per
// order through the shared email flow (kind "review_request"; the API stamps the order's reviewRequestedAt).
// Shows the sent line once it has gone, and a pointer to Shop details while the shop has no review link yet.
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { Client, Order } from "@shared/types";

import { Button, Card, SectionTitle } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { formatDate } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { useShop } from "@/lib/useShop";

import { SHOP_ORDERS_KEY } from "./queries";
import { EmailDraftFields, useSendEmail, type EmailDraft } from "./SendEmailFlow";

export interface ReviewRequestCardProps {
  order: Order;
  client: Client | undefined;
  style?: StyleProp<ViewStyle>;
}

/** "Anucha Srisuk" → "Anucha". */
function firstNameOf(client: Client | undefined): string {
  if (!client) return "";
  return client.name.trim().split(/\s+/)[0] || client.name;
}

/** The pre-filled thank-you. `reviewUrl` and `shopName` are the shop's; the user can edit before sending. */
export function reviewRequestDraft(order: Order, firstName: string, shopName: string, reviewUrl: string): EmailDraft {
  const garment = order.garment.toLowerCase();
  return {
    subject: `Thank you from ${shopName}`,
    body: `Dear ${firstName || "Sir"},\n\nIt was a pleasure making your ${garment}. If you have a minute, a short review on Google helps other gentlemen find us: ${reviewUrl}\n\nWarm regards,\n${shopName}`,
  };
}

/**
 * Renders nothing unless the order is delivered. Then: the "sent on" line once reviewRequestedAt is set, the
 * Shop-details hint when the shop has no Google review link, nothing while the client has no email, otherwise the card.
 */
export function ReviewRequestCard({ order, client, style }: ReviewRequestCardProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const shopQuery = useShop();
  const shop = shopQuery.data ?? null;
  const { send, sending } = useSendEmail(client);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState<EmailDraft | null>(null);

  const firstName = firstNameOf(client);
  const reviewUrl = shop?.googleReviewUrl?.trim() || null;
  const shopName = shop?.name ?? "the shop";
  // Until the user edits, the draft follows the client / shop as they load.
  const defaults = useMemo(() => reviewRequestDraft(order, firstName, shopName, reviewUrl ?? ""), [order, firstName, shopName, reviewUrl]);
  const draft = edited ?? defaults;

  if (order.status !== "delivered") return null;

  if (order.reviewRequestedAt) {
    return (
      <View style={[styles.sentLine, style]} testID="review-request-sent">
        <Ionicons name="checkmark-circle-outline" size={16} color={colors.successFg} />
        <Text style={styles.sentText}>Review request sent on {formatDate(order.reviewRequestedAt)}</Text>
      </View>
    );
  }

  if (shopQuery.isPending) return null;

  if (!reviewUrl) {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Add your Google review link in Shop details to ask for reviews"
        onPress={() => router.push("/shop-details")}
        style={({ pressed }) => [styles.hint, style, pressed && styles.pressed]}
        testID="review-request-hint"
      >
        <Ionicons name="star-outline" size={16} color={colors.goldDark} />
        <Text style={styles.hintText}>
          Add your Google review link in <Text style={styles.hintLink}>Shop details</Text> to ask for reviews.
        </Text>
      </Pressable>
    );
  }

  if (!client?.email) return null;

  const onSend = async () => {
    const message = await send({ kind: "review_request", orderId: order.id, ...draft });
    if (!message) return;
    setComposing(false);
    // The API stamps reviewRequestedAt with the send; show it right away and let the order and the lists catch up.
    if (message.status !== "failed") {
      qc.setQueryData<Order>(queryKeys.order(order.clientId, order.id), (old) =>
        old ? { ...old, reviewRequestedAt: old.reviewRequestedAt ?? message.createdAt } : old,
      );
    }
    void qc.invalidateQueries({ queryKey: queryKeys.orders(order.clientId) });
    void qc.invalidateQueries({ queryKey: SHOP_ORDERS_KEY });
  };

  const collected = order.deliveredAt ? ` on ${formatDate(order.deliveredAt)}` : "";

  return (
    <Card style={[styles.card, style]} testID="review-request-card">
      <View style={styles.header}>
        <View style={styles.iconTile}>
          <Ionicons name="star-outline" size={20} color={colors.goldDark} />
        </View>
        <SectionTitle title="Ask for a review" style={styles.title} />
      </View>
      <Text style={typography.bodyMuted}>
        {firstName || "The client"} collected the {order.garment.toLowerCase()}
        {collected}. Send a thank-you with your Google review link? It goes once per order, from the shop, and is saved on the
        client&apos;s file like every email.
      </Text>

      {composing ? (
        <>
          <Card variant="soft" style={styles.draftCard}>
            {editing ? (
              <EmailDraftFields
                subject={draft.subject}
                body={draft.body}
                onSubjectChange={(subject) => setEdited({ ...draft, subject })}
                onBodyChange={(body) => setEdited({ ...draft, body })}
                onDone={() => setEditing(false)}
              />
            ) : (
              <>
                <Text style={typography.small}>Subject</Text>
                <Text style={styles.draftSubject}>{draft.subject}</Text>
                <Text style={[typography.small, styles.draftLabel]}>Body</Text>
                <Text style={typography.body}>{draft.body}</Text>
              </>
            )}
          </Card>
          {!editing ? (
            <View style={styles.footer}>
              <View style={styles.actions}>
                <Button size="sm" variant="ghost" icon="pencil-outline" title="Edit" onPress={() => setEditing(true)} disabled={sending} />
                <Button size="sm" icon="send-outline" title="Send email" onPress={() => void onSend()} loading={sending} style={styles.grow} testID="review-request-send" />
              </View>
              <View style={styles.captionRow}>
                <Text style={styles.caption}>To {client.email}</Text>
                <Button size="sm" variant="ghost" title="Cancel" onPress={() => setComposing(false)} disabled={sending} />
              </View>
            </View>
          ) : null}
        </>
      ) : (
        <Button icon="star-outline" title="Send review request" fullWidth onPress={() => setComposing(true)} testID="review-request-open" />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconTile: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.sand, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, minWidth: 0, marginBottom: 0, alignItems: "center" },
  draftCard: { gap: 4 },
  draftSubject: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.ink },
  draftLabel: { marginTop: 8 },
  footer: { gap: 4 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  grow: { flex: 1 },
  captionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  caption: { ...typography.small, flex: 1, minWidth: 0 },
  sentLine: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 2 },
  sentText: { ...typography.small, color: colors.successFg },
  hint: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, minHeight: 32 },
  hintText: { ...typography.small, flex: 1, minWidth: 0 },
  hintLink: { fontFamily: fonts.bodySemi, color: colors.goldDark },
  pressed: { opacity: 0.7 },
});
