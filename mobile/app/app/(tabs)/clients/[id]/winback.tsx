import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Incentive } from "@shared/types";

import {
  EmailDraftFields,
  ErrorBlock,
  InactiveTag,
  LoadingBlock,
  Monogram,
  NoEmailHint,
  SenderNote,
  SentCard,
  clientRoutes,
  isNotFoundError,
  showAiError,
  useClient,
  useSendEmail,
  type EmailDraft,
} from "@/components/clients";
import { AiResultCard, Button, Card, Chip, EmptyState, Eyebrow, LoadingAI, Screen } from "@/components/ui";
import { colors, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { useAiConsent } from "@/lib/useAiConsent";
import { formatMonthsSince, monthsSince } from "@/lib/format";
import { useEmailStatus, useShop } from "@/lib/useShop";

const INCENTIVES: Incentive[] = ["Complimentary shirt with a suit", "10% off", "Free alteration"];

/** Win-back: pick an incentive, draft the email with AI (POST /ai/winback), tweak it, then send it to the client's email. */
export default function WinbackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const api = useApi();
  const clientQuery = useClient(id);
  const client = clientQuery.data;
  const shop = useShop().data ?? null;
  const email = useEmailStatus().data ?? null;
  const [incentive, setIncentive] = useState<Incentive>(INCENTIVES[0]);
  const [draftText, setDraftText] = useState<EmailDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const { send, sending, sent, reset } = useSendEmail(client);
  const ensureAiConsent = useAiConsent();

  const draft = useMutation({
    mutationFn: (chosen: Incentive) => api.aiWinback({ clientId: id, incentive: chosen }),
    onSuccess: (res) => {
      setDraftText({ subject: res.email_subject, body: res.email_body });
      setEditing(false);
      reset();
    },
    onError: (err) => showAiError(err, "Couldn't draft the email"),
  });

  const onSend = () => {
    if (draftText) void send({ kind: "winback", ...draftText });
  };

  let body;
  if (clientQuery.isPending) {
    body = <LoadingBlock />;
  } else if (clientQuery.isError || !client) {
    body = isNotFoundError(clientQuery.error) ? (
      <EmptyState
        icon="person-remove-outline"
        title="Client not found"
        body="This client may have been deleted."
        action={<Button size="sm" variant="secondary" title="Back to clients" onPress={() => router.dismissTo(clientRoutes.list)} />}
      />
    ) : (
      <ErrorBlock error={clientQuery.error} onRetry={() => void clientQuery.refetch()} retrying={clientQuery.isFetching} />
    );
  } else {
    const quiet = monthsSince(client.lastOrderAt ?? client.createdAt);
    const quietText = quiet === 0 ? "Visited this month" : `Quiet for ${quiet} ${quiet === 1 ? "month" : "months"}`;
    const emailText = draftText ? `Subject: ${draftText.subject}\n\n${draftText.body}` : "";

    body = (
      <>
        <Card style={styles.summary}>
          <Monogram name={client.name} size={52} />
          <View style={styles.summaryText}>
            <Text style={typography.h3} numberOfLines={1}>
              {client.name}
            </Text>
            <Text style={styles.quiet}>{quietText}</Text>
            <Text style={typography.small}>Last order: {formatMonthsSince(client.lastOrderAt)}</Text>
          </View>
          {client.inactive ? <InactiveTag /> : null}
        </Card>

        <View style={styles.block}>
          <Eyebrow>Incentive</Eyebrow>
          <Text style={typography.small}>What you&apos;re offering to bring them back.</Text>
          <View style={styles.chips}>
            {INCENTIVES.map((i) => (
              <Chip key={i} label={i} selected={incentive === i} onPress={() => setIncentive(i)} disabled={draft.isPending || sending} />
            ))}
          </View>
        </View>

        {draft.isPending ? (
          <LoadingAI label="Writing the email…" />
        ) : (
          <Button
            title={draftText ? "Draft again" : "Draft email with AI"}
            icon="sparkles"
            variant={draftText ? "secondary" : "primary"}
            fullWidth
            onPress={() => void ensureAiConsent().then((ok) => ok && draft.mutate(incentive))}
            disabled={sending}
          />
        )}

        {draftText ? (
          <View style={styles.resultBlock}>
            {editing ? (
              <Card variant="dark" style={styles.editCard}>
                <Eyebrow tone="onDark">Win-back email</Eyebrow>
                <EmailDraftFields
                  tone="dark"
                  subject={draftText.subject}
                  body={draftText.body}
                  onSubjectChange={(subject) => setDraftText({ ...draftText, subject })}
                  onBodyChange={(body) => setDraftText({ ...draftText, body })}
                  onDone={() => setEditing(false)}
                />
              </Card>
            ) : (
              <AiResultCard
                eyebrow="Win-back email"
                title={draftText.subject}
                body={draftText.body}
                copyText={emailText}
                shareText={emailText}
                actions={<Button size="sm" variant="onDark" icon="pencil-outline" title="Edit" onPress={() => setEditing(true)} disabled={sending} />}
              />
            )}

            {sent ? (
              <SentCard message={sent}>
                <Button size="sm" variant="ghost" icon="refresh-outline" title="Send again" onPress={reset} />
                <Button
                  size="sm"
                  variant="secondary"
                  icon="mail-open-outline"
                  title="View in Messages"
                  onPress={() => router.dismissTo(clientRoutes.detail(id))}
                />
              </SentCard>
            ) : client.email ? (
              <View style={styles.sendBlock}>
                <Button title="Send email" icon="send-outline" fullWidth onPress={onSend} loading={sending} disabled={editing} testID="winback-send" />
                <Text style={styles.caption}>To {client.email}</Text>
              </View>
            ) : (
              <NoEmailHint client={client} />
            )}
          </View>
        ) : null}

        <SenderNote shop={shop} email={email} />
      </>
    );
  }

  return (
    <Screen back eyebrow="Win-back" title="Win-back email" keyboard>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", gap: 12 },
  summaryText: { flex: 1, gap: 2, minWidth: 0 },
  quiet: { ...typography.body, color: colors.goldDark },
  block: { gap: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  resultBlock: { gap: 12 },
  editCard: { gap: 10 },
  sendBlock: { gap: 6 },
  caption: { ...typography.small, textAlign: "center" },
});
