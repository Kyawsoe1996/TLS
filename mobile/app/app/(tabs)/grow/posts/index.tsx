import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PostStatus } from "@shared/types";

import { ErrorBlock, LoadingBlock, useDebounced } from "@/components/clients";
import { PostRow, postRoutes, usePosts } from "@/components/grow";
import { Button, Chip, EmptyState, Field, Screen } from "@/components/ui";
import { colors, typography } from "@/constants/theme";

type Filter = "all" | PostStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "shared", label: "Shared" },
];

/** The content library: every post Content Studio wrote, searchable by title / topic and filtered by status. */
export default function PostsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const debouncedSearch = useDebounced(search.trim(), 300);

  const query = usePosts({ status: filter === "all" ? undefined : filter, q: debouncedSearch || undefined });
  const posts = query.data ?? [];
  const filtered = !!debouncedSearch || filter !== "all";

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

  const newPost = <Button size="sm" variant="gold" icon="create-outline" title="New post" onPress={() => router.push(postRoutes.content)} />;

  let body;
  if (query.isPending) {
    body = <LoadingBlock />;
  } else if (query.isError && !query.data) {
    body = <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  } else if (posts.length === 0) {
    body = filtered ? (
      <EmptyState
        icon="search-outline"
        title="No matches"
        body={filter === "shared" && !debouncedSearch ? "Nothing has been shared yet. Open a draft and tap Share." : "Try another word or clear the filter."}
        action={<Button size="sm" variant="secondary" title="Clear filters" onPress={clearFilters} />}
      />
    ) : (
      <EmptyState
        icon="albums-outline"
        title="No posts yet"
        body="Content Studio saves everything it writes here, ready to share."
        action={<Button size="sm" variant="gold" icon="sparkles-outline" title="Write your first post" onPress={() => router.push(postRoutes.content)} />}
      />
    );
  } else {
    body = (
      <View style={styles.list}>
        <View style={styles.countRow}>
          <Text style={styles.count}>
            {posts.length} {posts.length === 1 ? "post" : "posts"}
            {filter === "draft" ? " · drafts" : filter === "shared" ? " · shared" : ""}
          </Text>
          {newPost}
        </View>
        {posts.map((post) => (
          <PostRow key={post.id} post={post} onPress={() => router.push(postRoutes.detail(post.id))} />
        ))}
      </View>
    );
  }

  return (
    <Screen back eyebrow="Grow" title="Posts" subtitle="Everything you've written, ready to share." refreshing={refreshing} onRefresh={() => void onRefresh()}>
      <Field
        value={search}
        onChangeText={setSearch}
        placeholder="Search by title or topic"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
        accessibilityLabel="Search posts"
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
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </View>

      {query.isError && query.data ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}

      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  list: { gap: 10 },
  countRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 2 },
  count: { ...typography.small, flex: 1 },
});
