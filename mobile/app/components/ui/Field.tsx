import { forwardRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";

import { colors, fonts, radii, sizes, typography } from "@/constants/theme";

export interface FieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  /** Node rendered inside the input box on the right (e.g. a unit suffix). */
  right?: ReactNode;
  /** Gold 2px border: the value was filled in for the user (e.g. from a recording) and should be checked. Focus and error still win. */
  highlight?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

/** Label + 48px TextInput (radius 12, white, 1px line; navy on focus, red on error, gold when highlighted). */
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, hint, error, right, highlight = false, containerStyle, style, multiline, onFocus, onBlur, editable = true, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const highlighted = highlight && !error && !focused;
  const borderColor = error ? colors.danger : focused ? colors.navy : highlighted ? colors.gold : colors.line;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.box, { borderColor }, highlighted && styles.boxHighlight, multiline && styles.boxMultiline, !editable && styles.boxDisabled]}>
        <TextInput
          ref={ref}
          {...rest}
          editable={editable}
          multiline={multiline}
          placeholderTextColor="#8A8F9B"
          selectionColor={colors.gold}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, multiline && styles.inputMultiline, style]}
        />
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: typography.label,
  box: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: sizes.control,
    borderRadius: radii.field,
    borderWidth: 1,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
  },
  // 2px border, 1px less padding so the text doesn't shift.
  boxHighlight: { borderWidth: 2, paddingHorizontal: 13 },
  boxMultiline: { minHeight: 104, alignItems: "flex-start", paddingVertical: 10 },
  boxDisabled: { backgroundColor: colors.cardSoft },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 0,
    minHeight: sizes.control - 2,
  },
  inputMultiline: { minHeight: 84, textAlignVertical: "top" },
  right: { marginLeft: 8, justifyContent: "center" },
  hint: typography.small,
  error: { ...typography.small, color: colors.danger },
});
