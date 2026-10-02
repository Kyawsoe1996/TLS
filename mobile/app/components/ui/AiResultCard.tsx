import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Share, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts, typography } from "@/constants/theme";

import { Button } from "./Button";
import { Card } from "./Card";
import { Eyebrow } from "./Eyebrow";

export interface AiResultCardProps {
  title: string;
  body: string;
  /** Defaults to "AI result". */
  eyebrow?: string;
  /** Text put on the clipboard; defaults to "title\n\nbody". */
  copyText?: string;
  /** Text handed to the share sheet; defaults to `copyText`. */
  shareText?: string;
  /** Extra content rendered between the body and the buttons. */
  children?: ReactNode;
  /** Extra buttons after Copy / Share (e.g. "Edit", "Send by email"). */
  actions?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Dark card for AI output with gold eyebrow and Copy / Share actions. */
export function AiResultCard({ title, body, eyebrow = "AI result", copyText, shareText, children, actions, style }: AiResultCardProps) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const textToCopy = copyText ?? `${title}\n\n${body}`;
  const textToShare = shareText ?? textToCopy;

  const onCopy = async () => {
    try {
      await Clipboard.setStringAsync(textToCopy);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — nothing to do
    }
  };

  const onShare = async () => {
    setSharing(true);
    try {
      await Share.share({ message: textToShare, title });
    } catch {
      // user dismissed or share unavailable
    } finally {
      setSharing(false);
    }
  };

  return (
    <Card variant="dark" style={[styles.card, style]}>
      <Eyebrow tone="onDark">{eyebrow}</Eyebrow>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body} selectable>
        {body}
      </Text>
      {children}
      <View style={styles.actions}>
        <Button
          size="sm"
          variant="gold"
          icon={copied ? "checkmark" : "copy-outline"}
          title={copied ? "Copied" : "Copy"}
          onPress={onCopy}
        />
        <Button size="sm" variant="onDark" icon="share-outline" title="Share" onPress={onShare} loading={sharing} />
        {actions}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  title: { ...typography.h2, color: colors.ivory, marginTop: 2 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.ivorySoft },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
});
