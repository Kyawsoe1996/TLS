import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors, fonts } from "@/constants/theme";

const LENGTH = 6;

export interface CodeInputProps {
  value: string;
  onChange: (code: string) => void;
  /** Called once the sixth digit is in. */
  onComplete?: (code: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}

/**
 * Six digit boxes backed by one invisible TextInput, so the keyboard's one-time-code suggestion and
 * paste still work. The box being typed into gets a gold border and a caret.
 */
export function CodeInput({ value, onChange, onComplete, autoFocus = false, disabled = false }: CodeInputProps) {
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? "");
  const activeIndex = Math.min(value.length, LENGTH - 1);

  return (
    <Pressable onPress={() => ref.current?.focus()} style={styles.row} accessible={false}>
      {digits.map((digit, i) => {
        const active = focused && i === activeIndex;
        return (
          <View key={i} style={[styles.box, digit !== "" && styles.boxFilled, active && styles.boxActive]}>
            {digit !== "" ? <Text style={styles.digit}>{digit}</Text> : active ? <View style={styles.caret} /> : null}
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => {
          const next = t.replace(/\D/g, "").slice(0, LENGTH);
          onChange(next);
          if (next.length === LENGTH) onComplete?.(next);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={LENGTH}
        autoFocus={autoFocus}
        editable={!disabled}
        caretHidden
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel="6-digit code"
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  box: {
    flex: 1,
    height: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  boxFilled: { borderColor: colors.navy },
  boxActive: { borderWidth: 2, borderColor: colors.gold },
  digit: { fontFamily: fonts.serifSemi, fontSize: 28, lineHeight: 32, color: colors.navy },
  caret: { width: 2, height: 26, backgroundColor: colors.gold },
  hidden: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0, color: "transparent" },
});
