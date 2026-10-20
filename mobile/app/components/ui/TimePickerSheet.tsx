import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, typography } from "@/constants/theme";

import { Button } from "./Button";

export interface TimePickerSheetProps {
  visible: boolean;
  title: string;
  /** Minutes after midnight. */
  minutes: number;
  /** Granularity of the minute wheel (default 5). */
  minuteStep?: number;
  /** "time" (default): a time of day, read back as "6:30 PM". "duration": hours and minutes, read back as "1 hour 30 minutes". */
  mode?: "time" | "duration";
  onConfirm: (minutes: number) => void;
  onCancel: () => void;
}

/** 90 → "1 hour 30 minutes" */
function describeDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins} ${mins === 1 ? "minute" : "minutes"}`);
  return parts.join(" ");
}

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const PAD = ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2);

/** 1110 → "6:30 PM" */
function describe(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${String(mins).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/**
 * A bottom sheet with two snapping wheels (hour, minute) in pure JavaScript — no native picker module, so it works in
 * every build and both platforms look the same. 24-hour wheels; the title line reads the choice back in 12-hour words.
 */
export function TimePickerSheet({ visible, title, minutes, minuteStep = 5, mode = "time", onConfirm, onCancel }: TimePickerSheetProps) {
  const insets = useSafeAreaInsets();
  const hours = Array.from({ length: mode === "duration" ? 13 : 24 }, (_, i) => i);
  const minuteValues = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);
  const [hour, setHour] = useState(Math.floor(minutes / 60));
  const [minute, setMinute] = useState(Math.round((minutes % 60) / minuteStep) * minuteStep % 60);

  useEffect(() => {
    if (!visible) return;
    setHour(Math.floor(minutes / 60));
    setMinute((Math.round((minutes % 60) / minuteStep) * minuteStep) % 60);
  }, [visible, minutes, minuteStep]);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          <Text style={typography.h2}>{title}</Text>
          <Text style={styles.readback} accessibilityLiveRegion="polite">
            {mode === "duration" ? describeDuration(hour * 60 + minute) : describe(hour * 60 + minute)}
          </Text>
          <View style={styles.wheels}>
            <View pointerEvents="none" style={styles.band} />
            <Wheel values={hours} selected={hour} onChange={setHour} label={mode === "duration" ? "Hours" : "Hour"} format={(h) => String(h).padStart(2, "0")} />
            <Text style={styles.colon}>{mode === "duration" ? "h" : ":"}</Text>
            <Wheel values={minuteValues} selected={minute} onChange={setMinute} label={mode === "duration" ? "Minutes" : "Minute"} format={(m) => String(m).padStart(2, "0")} />
            {mode === "duration" ? <Text style={styles.colon}>min</Text> : null}
          </View>
          <View style={styles.actions}>
            <Button title="Done" variant="gold" onPress={() => onConfirm(hour * 60 + minute)} style={styles.done} testID="time-picker-done" />
            <Button title="Cancel" variant="secondary" onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Wheel({ values, selected, onChange, label, format }: { values: number[]; selected: number; onChange: (value: number) => void; label: string; format: (value: number) => string }) {
  const ref = useRef<ScrollView>(null);
  const index = Math.max(0, values.indexOf(selected));

  // Scroll to the current value when the wheel appears (and when a chip outside changes it).
  useEffect(() => {
    const timer = setTimeout(() => ref.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false }), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount / external change of `selected`
  }, [selected]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.min(values.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT)));
    const value = values[i];
    if (value !== undefined && value !== selected) onChange(value);
  };

  return (
    <ScrollView
      ref={ref}
      style={styles.wheel}
      contentContainerStyle={{ paddingVertical: PAD }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      onMomentumScrollEnd={settle}
      onScrollEndDrag={settle}
      accessibilityLabel={label}
      nestedScrollEnabled
    >
      {values.map((value) => (
        <Pressable key={value} onPress={() => onChange(value)} style={styles.item} accessibilityRole="button" accessibilityLabel={`${label} ${format(value)}`}>
          <Text style={[styles.itemText, value === selected && styles.itemTextSelected]}>{format(value)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(20, 33, 58, 0.45)" },
  sheet: {
    backgroundColor: colors.ivory,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 12,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 4 },
  readback: { fontFamily: fonts.serif, fontSize: 36, lineHeight: 42, color: colors.navy },
  wheels: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: ITEM_HEIGHT * VISIBLE_ITEMS },
  band: {
    position: "absolute",
    left: 0,
    right: 0,
    top: PAD,
    height: ITEM_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.sand,
    borderRadius: 10,
  },
  wheel: { width: 96, height: ITEM_HEIGHT * VISIBLE_ITEMS },
  item: { height: ITEM_HEIGHT, alignItems: "center", justifyContent: "center" },
  itemText: { fontFamily: fonts.serifSemi, fontSize: 26, color: colors.muted },
  itemTextSelected: { color: colors.navy, fontFamily: fonts.serif },
  colon: { fontFamily: fonts.serif, fontSize: 28, color: colors.navy, marginBottom: 4 },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  done: { flex: 1 },
});
