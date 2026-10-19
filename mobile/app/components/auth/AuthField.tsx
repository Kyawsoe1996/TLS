import { Ionicons } from "@expo/vector-icons";
import { forwardRef, useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import type { IoniconName } from "@/components/ui";
import { colors, fonts } from "@/constants/theme";

export interface AuthFieldProps extends TextInputProps {
  label: string;
  icon?: IoniconName;
}

/** Underline-style input for the auth screens: gold uppercase label, navy text, gold rule on focus. */
export const AuthField = forwardRef<TextInput, AuthFieldProps>(function AuthField({ label, icon, style, onFocus, onBlur, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.row, focused && styles.rowFocused]}>
        {icon ? <Ionicons name={icon} size={20} color={focused ? colors.goldDark : colors.muted} /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor="#8A8F9B"
          selectionColor={colors.gold}
          cursorColor={colors.goldDark}
          style={[styles.input, style]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  label: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: colors.goldDark },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 6 },
  rowFocused: { borderBottomColor: colors.gold },
  input: { flex: 1, minWidth: 0, minHeight: 40, padding: 0, fontFamily: fonts.body, fontSize: 17, color: colors.navy },
});
