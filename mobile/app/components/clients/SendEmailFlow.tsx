// Everything the three "send an email" screens share (win-back, order detail, fitting detail):
// the confirm → POST /clients/:id/messages → sent-state hook, and the small UI pieces around it.
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { Client, EmailStatus, Message, MessageKind, MessageStatus, Shop } from "@shared/types";

import { Button, Card, Eyebrow, Field, type IoniconName } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { confirm, showError, showToast } from "@/lib/toast";

import { messageStatusLabel } from "./MessageRow";
import { afterMessageSent, cacheMessage, clientRoutes } from "./queries";

export interface EmailDraft {
  subject: string;
  body: string;
}

export interface SendEmailInput extends EmailDraft {
  kind: MessageKind;
  orderId?: string;
}

/**
 * Confirm → POST → remember the result. `sent` is the message from the last POST (any status — a "failed" send is
 * still a saved record); `reset()` returns to the compose state ("Send again"). The request is only made when the
 * client has an email address; callers show `NoEmailHint` otherwise.
 */
export function useSendEmail(client: Client | undefined) {
  const api = useApi();
  const qc = useQueryClient();
  const [sent, setSent] = useState<Message | null>(null);
  const clientId = client?.id;

  const mutation = useMutation({
    mutationFn: (input: SendEmailInput) => api.sendMessage(clientId as string, input),
    onSuccess: ({ message }) => {
      setSent(message);
      cacheMessage(qc, message);
      afterMessageSent(qc, message.clientId);
    },
    onError: (err) => showError(err, "Couldn't send the email"),
  });

  /** Asks first. Resolves to the saved message, or null when cancelled or the request failed (already reported). */
  const send = async (input: SendEmailInput): Promise<Message | null> => {
    if (!client?.email || mutation.isPending) return null;
    const subject = input.subject.trim();
    const body = input.body.trim();
    if (!subject || !body) {
      showToast("Nothing to send", "Add a subject and a message first.");
      return null;
    }
    const ok = await confirm({
      title: "Send this email?",
      message: `To ${client.name} · ${client.email}\nSubject: ${subject}`,
      confirmText: "Send",
    });
    if (!ok) return null;
    try {
      return (await mutation.mutateAsync({ ...input, subject, body })).message;
    } catch {
      return null;
    }
  };

  return { send, sending: mutation.isPending, sent, reset: () => setSent(null) };
}

// ---------- UI pieces ----------

export interface EmailDraftFieldsProps extends EmailDraft {
  onSubjectChange: (subject: string) => void;
  onBodyChange: (body: string) => void;
  onDone: () => void;
  /** "dark" when the fields sit on a navy card (labels become gold eyebrows). */
  tone?: "light" | "dark";
  style?: StyleProp<ViewStyle>;
}

/** Subject (single line) + message (multiline) fields with a "Done" button — the Edit mode of a draft card. */
export function EmailDraftFields({ subject, body, onSubjectChange, onBodyChange, onDone, tone = "light", style }: EmailDraftFieldsProps) {
  const onDark = tone === "dark";
  return (
    <View style={[styles.fields, style]}>
      {onDark ? <Eyebrow tone="onDark">Subject</Eyebrow> : null}
      <Field
        label={onDark ? undefined : "Subject"}
        value={subject}
        onChangeText={onSubjectChange}
        autoCapitalize="sentences"
        returnKeyType="done"
        testID="email-subject"
      />
      {onDark ? <Eyebrow tone="onDark">Message</Eyebrow> : null}
      <Field label={onDark ? undefined : "Message"} value={body} onChangeText={onBodyChange} multiline style={styles.bodyInput} testID="email-body" />
      <Button size="sm" variant={onDark ? "gold" : "secondary"} icon="checkmark" title="Done" onPress={onDone} style={styles.done} />
    </View>
  );
}

const STATUS_DISC: Record<MessageStatus, { icon: IoniconName; bg: string; fg: string }> = {
  sent: { icon: "checkmark", bg: colors.successBg, fg: colors.successFg },
  simulated: { icon: "time-outline", bg: colors.sand, fg: colors.goldDark },
  failed: { icon: "alert", bg: colors.dangerBg, fg: colors.danger },
};

export interface SentCardProps {
  message: Message;
  /** Defaults to the status ("Sent" / "Simulated" / "Failed"). */
  label?: string;
  /** Defaults to "<date, time> · to <email>". */
  line?: string;
  /** Buttons under the status line, e.g. "Send again". */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Soft card shown once an email has gone out: status disc, when and to whom, the provider error when it failed. */
export function SentCard({ message, label, line, children, style }: SentCardProps) {
  const disc = STATUS_DISC[message.status];
  return (
    <Card variant="soft" style={[styles.sentCard, style]} testID="email-sent-card">
      <View style={styles.sentRow}>
        <View style={[styles.disc, { backgroundColor: disc.bg }]}>
          <Ionicons name={disc.icon} size={20} color={disc.fg} />
        </View>
        <View style={styles.sentText}>
          <Text style={styles.sentLabel}>{label ?? messageStatusLabel(message.status)}</Text>
          <Text style={typography.small}>{line ?? `${formatDateTime(message.createdAt)} · to ${message.to}`}</Text>
          {message.status === "failed" && message.error ? <Text style={styles.sentError}>{message.error}</Text> : null}
          {message.status === "simulated" ? (
            <Text style={typography.small}>Email sending isn&apos;t set up yet, so nothing went out. The text is saved to the file.</Text>
          ) : null}
        </View>
      </View>
      {children ? <View style={styles.sentActions}>{children}</View> : null}
    </Card>
  );
}

/** Shown in place of the Send button when the client has no email address. */
export function NoEmailHint({ client, style }: { client: Client; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  return (
    <View style={[styles.noEmail, style]}>
      <Text style={styles.noEmailText}>Add an email address to {client.name}&apos;s file to send this.</Text>
      <Button size="sm" variant="secondary" icon="pencil-outline" title="Edit client" onPress={() => router.push(clientRoutes.edit(client.id))} />
    </View>
  );
}

/** `"Shamu via Magick TLS <onboarding@resend.dev>"` → name + address. */
function parseFrom(from: string | undefined): { name: string | null; address: string } | null {
  if (!from) return null;
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  if (m) return { name: m[1].trim() || null, address: m[2].trim() };
  return { name: null, address: from.trim() };
}

/**
 * Info row: who the email appears to come from (the API's real sender once /shop has loaded) and, when the shop has
 * set a reply-to address in Shop details, where the client's replies land.
 */
export function SenderNote({ shop, email, style }: { shop: Shop | null | undefined; email: EmailStatus | null | undefined; style?: StyleProp<ViewStyle> }) {
  const parsed = parseFrom(email?.from);
  const name = parsed?.name ?? (shop ? `${shop.name} via Magick TLS` : "your shop via Magick TLS");
  const address = parsed?.address ?? "onboarding@resend.dev";
  const text =
    email && !email.configured
      ? "Email sending isn't set up yet: emails are saved to the client's file as Simulated and nothing goes out. See Settings."
      : address.endsWith("resend.dev")
        ? `Sent from ${name}. Until your domain is verified, emails go out from ${address}.`
        : `Sent from ${name} (${address}).`;
  const replyTo = shop?.replyToEmail?.trim() || null;
  return (
    <Card variant="soft" style={[styles.note, style]}>
      <Ionicons name="information-circle-outline" size={18} color={colors.goldDark} />
      <View style={styles.noteLines}>
        <Text style={styles.noteText}>{text}</Text>
        {replyTo ? <Text style={styles.noteText}>Replies go to {replyTo}.</Text> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 8 },
  bodyInput: { minHeight: 140 },
  done: { alignSelf: "flex-end", marginTop: 2 },
  sentCard: { gap: 12 },
  sentRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  disc: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  sentText: { flex: 1, minWidth: 0, gap: 2, paddingTop: 2 },
  sentLabel: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 22, color: colors.ink },
  sentError: { ...typography.small, color: colors.danger },
  sentActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  noEmail: { alignItems: "center", gap: 10, paddingVertical: 4 },
  noEmailText: { ...typography.bodyMuted, textAlign: "center" },
  note: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  noteLines: { flex: 1, minWidth: 0, gap: 4 },
  noteText: { ...typography.small, color: colors.ink },
});
