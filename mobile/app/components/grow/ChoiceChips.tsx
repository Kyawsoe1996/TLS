import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Chip, Eyebrow } from "@/components/ui";
import { typography } from "@/constants/theme";

export interface ChoiceChipsProps<T extends string> {
  label: string;
  hint?: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Eyebrow label + a wrapping row of single-select Chips. */
export function ChoiceChips<T extends string>({ label, hint, options, value, onChange, disabled, style }: ChoiceChipsProps<T>) {
  return (
    <View style={[styles.block, style]}>
      <Eyebrow>{label}</Eyebrow>
      {hint ? <Text style={typography.small}>{hint}</Text> : null}
      <View style={styles.chips}>
        {options.map((option) => (
          <Chip key={option} label={option} selected={option === value} disabled={disabled} onPress={() => onChange(option)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
});
