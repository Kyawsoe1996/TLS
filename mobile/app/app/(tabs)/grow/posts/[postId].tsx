import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, Share, StyleSheet, Text, View } from "react-native";
import type { Post } from "@shared/types";

import { ErrorBlock, LoadingBlock, isNotFoundError } from "@/components/clients";
import { PostMediaBlock, PostStatusTag, afterPostChanged, cachePost, forgetPost, postBriefLine, postRoutes, postShareText, useAttachMedia, usePost } from "@/components/grow";
import { Button, Card, EmptyState, Eyebrow, Screen } from "@/components/ui";
import { FEATURES } from "@/constants/features";
import { colors, fonts, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { confirm, showError } from "@/lib/toast";

/** One saved post: media, the three texts, Share / Edit / Duplicate / Delete. */
export default function PostDetailScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  // Once deleted, stop observing so the detail query isn't re-fetched (404) while the screen animates away.
  const [deleted, setDeleted] = useState(false);
  const postQuery = usePost(deleted ? undefined : postId);
  const [refreshing, setRefreshing] = useState(false);
  const post = postQuery.data;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await postQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  let body;
  if (postQuery.isPending || deleted) {
    body = <LoadingBlock />;
  } else if (postQuery.isError || !post) {
    body = isNotFoundError(postQuery.error) ? (
      <EmptyState
        icon="document-text-outline"
        title="Post not found"
        body="This post may have been deleted."
        action={<Button size="sm" variant="secondary" title="Back to posts" onPress={() => router.dismissTo(postRoutes.list)} />}
      />
    ) : (
      <ErrorBlock error={postQuery.error} onRetry={() => void postQuery.refetch()} retrying={postQuery.isFetching} />
    );
  } else {
    body = <PostDetails post={post} onDeleted={() => setDeleted(true)} />;
  }

  return (
    <Screen back eyebrow={post ? `Post · ${formatDate(post.createdAt)}` : "Post"} title={post?.title ?? "Post"} refreshing={refreshing} onRefresh={() => void onRefresh()}>
      {body}
    </Screen>
  );
}

/** Loaded state. */
function PostDetails({ post, onDeleted }: { post: Post; onDeleted: () => void }) {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const attach = useAttachMedia(post.id);
  const [sharing, setSharing] = useState(false);

  const onSaved = (saved: Post) => {
    cachePost(queryClient, saved);
    afterPostChanged(queryClient);
  };

  const sharedMutation = useMutation({
    mutationFn: () => api.markPostShared(post.id),
    onSuccess: ({ post: saved }) => onSaved(saved),
    onError: (err) => showError(err, "Shared, but couldn't mark the post"),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => api.duplicatePost(post.id),
    onSuccess: ({ post: copy }) => {
      onSaved(copy);
      router.push(postRoutes.detail(copy.id));
    },
    onError: (err) => showError(err, "Couldn't duplicate the post"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deletePost(post.id),
    onSuccess: () => {
      onDeleted();
      forgetPost(queryClient, post.id);
      if (router.canGoBack()) router.back();
      else router.replace(postRoutes.list);
    },
    onError: (err) => showError(err, "Couldn't delete the post"),
  });

  const onShare = async () => {
    setSharing(true);
    try {
      const message = postShareText(post);
      const url = post.media?.url;
      const outcome = await Share.share(
        // Android's sheet ignores `url`, so the photo link rides along in the text there.
        Platform.OS === "android" && url ? { message: `${message}\n\n${url}` } : { message, url },
        { subject: post.title, dialogTitle: "Share post" },
      );
      if (outcome.action === Share.sharedAction) sharedMutation.mutate();
    } catch (err) {
      showError(err, "Couldn't open the share sheet");
    } finally {
      setSharing(false);
    }
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: "Delete this post?",
      message: post.media
        ? `"${post.title}" and its ${post.media.kind === "video" ? "video" : "photo"} will be removed. This can't be undone.`
        : `"${post.title}" will be removed. This can't be undone.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (ok) deleteMutation.mutate();
  };

  const busy = sharing || sharedMutation.isPending || duplicateMutation.isPending || deleteMutation.isPending || attach.busy;

  return (
    <>
      <Card style={styles.headerCard}>
        <View style={styles.tagRow}>
          <PostStatusTag status={post.status} />
          {post.sharedAt ? <Text style={styles.sharedText}>Shared · {formatDateTime(post.sharedAt)}</Text> : null}
        </View>
        <Text style={typography.small}>{postBriefLine(post)}</Text>
      </Card>

      {FEATURES.postMedia ? (
        <View style={styles.section}>
          <Eyebrow>Photo or video</Eyebrow>
          <PostMediaBlock
            post={post}
            attach={attach}
            replaceLabel={(kind) => (kind === "video" ? "Change video" : "Change photo")}
            disabled={deleteMutation.isPending || duplicateMutation.isPending}
          />
        </View>
      ) : null}

      <TextCard eyebrow="Blog post" title={post.title} body={post.body} collapsible />
      <TextCard eyebrow="Social caption" body={post.caption} />
      <TextCard eyebrow="Call to action" body={post.callToAction} />

      <View style={styles.actions}>
        <Button variant="secondary" icon="pencil-outline" title="Edit" style={styles.action} onPress={() => router.push(postRoutes.edit(post.id))} disabled={busy} />
        <Button icon="share-outline" title="Share" style={styles.action} onPress={() => void onShare()} loading={sharing} disabled={busy && !sharing} />
      </View>
      <View style={styles.actions}>
        <Button
          variant="ghost"
          icon="copy-outline"
          title="Duplicate"
          style={styles.action}
          onPress={() => duplicateMutation.mutate()}
          loading={duplicateMutation.isPending}
          disabled={busy && !duplicateMutation.isPending}
        />
        <Button
          variant="danger"
          icon="trash-outline"
          title="Delete"
          style={styles.action}
          onPress={() => void onDelete()}
          loading={deleteMutation.isPending}
          disabled={busy && !deleteMutation.isPending}
        />
      </View>

      <Card variant="soft" style={styles.infoCard}>
        <Ionicons name="information-circle-outline" size={20} color={colors.goldDark} style={styles.infoIcon} />
        <Text style={styles.infoText}>
          Share sends the caption to any app on your phone.
        </Text>
      </Card>
    </>
  );
}

const COLLAPSED_LINES = 6;

/** Eyebrow + text with a Copy button; `collapsible` clips long text to a few lines behind a "Read all" toggle. */
function TextCard({ eyebrow, title, body, collapsible = false }: { eyebrow: string; title?: string; body: string; collapsible?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onCopy = async () => {
    try {
      await Clipboard.setStringAsync(title ? `${title}\n\n${body}` : body);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      showError(err, "Couldn't copy");
    }
  };

  // Rough line estimate so "Read all" only appears when there's more to read.
  const long = collapsible && (body.length > 320 || body.split("\n").length > COLLAPSED_LINES);

  return (
    <Card style={styles.textCard}>
      <Eyebrow>{eyebrow}</Eyebrow>
      {title ? <Text style={typography.h3}>{title}</Text> : null}
      <Text style={typography.body} selectable numberOfLines={collapsible && !expanded ? COLLAPSED_LINES : undefined}>
        {body}
      </Text>
      <View style={styles.textActions}>
        {long ? (
          <Button size="sm" variant="ghost" icon={expanded ? "chevron-up" : "chevron-down"} title={expanded ? "Show less" : "Read all"} onPress={() => setExpanded((v) => !v)} />
        ) : null}
        <Button size="sm" variant="ghost" icon={copied ? "checkmark" : "copy-outline"} title={copied ? "Copied" : "Copy"} onPress={() => void onCopy()} style={styles.copy} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerCard: { gap: 8 },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  sharedText: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.successFg },
  section: { gap: 10 },
  textCard: { gap: 8 },
  textActions: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  copy: { marginLeft: "auto" },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1 },
  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12 },
  infoIcon: { marginTop: 1 },
  infoText: { ...typography.body, flex: 1 },
});
