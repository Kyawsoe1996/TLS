// "Who sent you?" — a bottom sheet listing the shop's clients with search; picking one makes them the referrer of
// the client being added (CreateClientRequest.referredByClientId). Same shape as the agenda's client picker.
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Client } from "@shared/types";

import { ErrorBlock, LoadingBlock } from "@/components/clients/QueryState";
import { useDebounced } from "@/components/clients/queries";
import { Field } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

import { InitialsCircle } from "./InitialsCircle";

export interface ReferrerPickerProps {
  visible: boolean;
  onPick: (client: Client) => void;
  onClose: () => void;
  /** A client that must not appear (e.g. the one being edited: a client can't refer themselves). */
  excludeId?: string;
}

/** Client list with search in a sheet; tapping a row hands the client back. */
export function ReferrerPicker({ visible, onPick, onClose, excludeId }: ReferrerPickerProps) {
  const api = useApi();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim());
  const params = useMemo(() => (debounced ? { search: debounced } : undefined), [debounced]);
  const clients = useQuery({
    queryKey: queryKeys.clients(params),
    queryFn: () => api.listClients(params),
    select: (res) => (excludeId ? res.clients.filter((c) => c.id !== excludeId) : res.clients),
    enabled: visible,
  });

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="referrer-picker">
          <View style={styles.grabber} />
          <Text style={typography.h2}>Who sent you?</Text>
          <Text style={typography.small}>The client whose friend this is. They earn the reward when the first order is delivered.</Text>
          <Field label="Client" value={search} onChangeText={setSearch} placeholder="Search by name" autoCorrect={false} returnKeyType="search" autoFocus />
          {clients.isPending ? (
            <LoadingBlock />
          ) : clients.isError ? (
            <ErrorBlock error={clients.error} onRetry={() => void clients.refetch()} retrying={clients.isFetching} />
          ) : (
            <FlatList
              data={clients.data ?? []}
              keyExtractor={(c) => c.id}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={[typography.small, styles.empty]}>No client matches. The referrer has to be on your client list already.</Text>}
              renderItem={({ item }) => (
                <Pressable onPress={() => onPick(item)} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                  <InitialsCircle name={item.name} size={36} />
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(20, 33, 58, 0.45)" },
  sheet: { maxHeight: "80%", backgroundColor: colors.ivory, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, gap: 10 },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 2 },
  list: { maxHeight: 360 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  pressed: { opacity: 0.7 },
  name: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.ink },
  empty: { paddingVertical: 12 },
});
