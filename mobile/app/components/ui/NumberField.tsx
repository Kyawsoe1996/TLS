import { forwardRef, useEffect, useState } from "react";
import { StyleSheet, Text, type TextInput } from "react-native";

import { colors, fonts } from "@/constants/theme";

import { Field, type FieldProps } from "./Field";

export interface NumberFieldProps extends Omit<FieldProps, "value" | "onChangeText" | "keyboardType" | "right"> {
  value: number | null;
  onChangeValue: (value: number | null) => void;
  /** Suffix shown inside the box, e.g. "cm". */
  unit?: string;
  /** Max decimals kept while typing (default 1). */
  decimals?: number;
}

function toText(value: number | null): string {
  return value === null || Number.isNaN(value) ? "" : String(value);
}

function sanitize(text: string, decimals: number): string {
  let s = text.replace(",", ".").replace(/[^0-9.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
    if (decimals === 0) s = s.slice(0, firstDot);
    else s = s.slice(0, firstDot + 1 + decimals);
  }
  return s;
}

/** Decimal-keyboard Field for measurements. Emits `null` when empty. */
export const NumberField = forwardRef<TextInput, NumberFieldProps>(function NumberField(
  { value, onChangeValue, unit, decimals = 1, placeholder = "0", ...rest },
  ref,
) {
  const [text, setText] = useState(() => toText(value));

  // Keep local text in sync when the parent changes the value (e.g. reset form).
  useEffect(() => {
    const parsed = text === "" || text === "." ? null : Number(text);
    if (parsed !== value) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Field
      ref={ref}
      {...rest}
      value={text}
      placeholder={placeholder}
      keyboardType="decimal-pad"
      inputMode="decimal"
      onChangeText={(raw) => {
        const next = sanitize(raw, decimals);
        setText(next);
        const parsed = next === "" || next === "." ? null : Number(next);
        onChangeValue(parsed === null || Number.isNaN(parsed) ? null : parsed);
      }}
      right={unit ? <Text style={styles.unit}>{unit}</Text> : undefined}
    />
  );
});

const styles = StyleSheet.create({
  unit: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.muted },
});
