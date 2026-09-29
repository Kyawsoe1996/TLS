import { Ionicons } from "@expo/vector-icons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ClientRow, ErrorBlock, LoadingBlock, clientRoutes, useDebounced } from "@/components/clients";
import { Button, Chip, EmptyState, Field, Screen } from "@/components/ui";
import { colors, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

type Filter = "all" | "inactive";

/** Client list. `?inactive=1` (from Home / Win-back) preselects the "Inactive 90+ days" filter. */
export default function ClientsScreen() {
  const { inactive } = useLocalSearchParams<{ inactive?: string }>();
  const inactiveParam = inactive === "1" || inactive === "true";
  const router = useRouter();
  const api = useApi();

  const [filter, setFilter] = useState<Filter>(inactiveParam ? "inactive" : "all");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const debouncedSearch = useDebounced(search.trim(), 300);

  // Re-apply the filter whenever Home navigates here with (or without) the param.
  useEffect(() => {
    setFilter(inactiveParam ? "inactive" : "all");
  }, [inactiveParam]);

  const params = { search: debouncedSearch || undefined, inactive: filter === "inactive" || undefined };
  const query = useQuery({
    queryKey: queryKeys.clients(params),
    queryFn: () => api.listClients(params),
    select: (res) => res.clients,
    placeholderData: keepPreviousData,
  });

  const clients = query.data ?? [];
  const filtered = !!debouncedSearch || filter === "inactive";

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setFilter("all");
  };

  let body;
  if (query.isPending) {
    body = <LoadingBlock />;
  } else if (query.isError && !query.data) {
    body = <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  } else if (clients.length === 0) {
    body = filtered ? (
      <EmptyState
        icon="search-outline"
        title="No matches"
        body={filter === "inactive" && !debouncedSearch ? "Everyone on your book has visited in the last 90 days." : "Try another name or clear the filter."}
        action={<Button size="sm" variant="secondary" title="Clear filters" onPress={clearFilters} />}
      />
    ) : (
      <EmptyState
        icon="people-outline"
        title="No clients yet"
        body="Add your first client"
        action={<Button size="sm" variant="gold" icon="add" title="Add client" onPress={() => router.push(clientRoutes.new)} />}
      />
    );
  } else {
    body = (
      <View style={styles.list}>
        <Text style={styles.count}>
          {clients.length} {clients.length === 1 ? "client" : "clients"}
          {filter === "inactive" ? " · inactive 90+ days" : ""}
        </Text>
        {clients.map((client) => (
          <ClientRow key={client.id} client={client} onPress={() => router.push(clientRoutes.detail(client.id))} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Screen
        eyebrow={filter === "inactive" ? "Inactive 90+ days" : "Your book"}
        title="Clients"
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
        contentStyle={styles.content}
      >
        <Field
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="never"
          accessibilityLabel="Search clients"
          right={
            search ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={20} color={colors.muted} />
              </Pressable>
            ) : (
              <Ionicons name="search-outline" size={20} color={colors.muted} />
            )
          }
        />

        <View style={styles.chips}>
          <Chip label="All" selected={filter === "all"} onPress={() => setFilter("all")} />
          <Chip label="Inactive 90+ days" icon="time-outline" selected={filter === "inactive"} onPress={() => setFilter("inactive")} />
        </View>

        {query.isError && query.data ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}

        {body}
      </Screen>

      <Button title="Add client" icon="add" onPress={() => router.push(clientRoutes.new)} style={styles.fab} accessibilityLabel="Add client" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ivory },
  content: { paddingBottom: 104 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  list: { gap: 10 },
  count: { ...typography.small, marginBottom: 2 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    shadowColor: colors.navy,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
