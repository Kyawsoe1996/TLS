import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ErrorBlock, LoadingBlock, MessageStatusTag, clientRoutes, isNotFoundError, messageKindLabel, useMessage } from "@/components/clients";
import { Button, Card, EmptyState, Eyebrow, Screen } from "@/components/ui";
import { colors, typography } from "@/constants/theme";
import { formatDateTime } from "@/lib/format";
import { showError } from "@/lib/toast";

/** One sent email: who it went to, subject, body, and whether it really went out. */
export default function MessageDetailScreen() {
  const { id, messageId } = useLocalSearchParams<{ id: string; messageId: string }>();
  const router = useRouter();
  const query = useMessage(id, messageId);
  const message = query.data;
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onCopy = async () => {
    if (!message) return;
    try {
      await Clipboard.setStringAsync(`Subject: ${message.subject}\n\n${message.body}`);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      showError(err, "Couldn't copy");
    }
  };

  let body;
  if (query.isPending) {
    body = <LoadingBlock />;
  } else if (query.isError || !message) {
    body = isNotFoundError(query.error) ? (
      <EmptyState
        icon="mail-outline"
        title="Message not found"
        body="This message may have been removed."
        action={<Button size="sm" variant="secondary" title="Back to client" onPress={() => router.dismissTo(clientRoutes.detail(id))} />}
      />
    ) : (
      <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
    );
  } else {
    body = (
      <>
        <Card style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Eyebrow tone="muted">To</Eyebrow>
              <Text style={typography.body} selectable>
                {message.to}
              </Text>
            </View>
            <MessageStatusTag status={message.status} />
          </View>
          {message.status === "failed" && message.error ? <Text style={styles.error}>{message.error}</Text> : null}
          {message.status === "simulated" ? (
            <Text style={typography.small}>
              Email sending was not set up yet when this was sent; the text was saved but no email went out.
            </Text>
          ) : null}

          <View style={styles.divider} />
          <Eyebrow tone="muted">Subject</Eyebrow>
          <Text style={typography.h3} selectable>
            {message.subject}
          </Text>

          <View style={styles.divider} />
          <Eyebrow tone="muted">Body</Eyebrow>
          <Text style={typography.body} selectable>
            {message.body}
          </Text>
        </Card>

        <Button
          variant="secondary"
          icon={copied ? "checkmark" : "copy-outline"}
          title={copied ? "Copied" : "Copy"}
          fullWidth
          onPress={() => void onCopy()}
        />
      </>
    );
  }

  return (
    <Screen
      back
      eyebrow={message ? `Message · ${formatDateTime(message.createdAt)}` : "Message"}
      title={message ? messageKindLabel(message.kind) : "Message"}
      subtitle={message ? "Sent by email" : undefined}
    >
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  error: { ...typography.small, color: colors.danger },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 6 },
});
