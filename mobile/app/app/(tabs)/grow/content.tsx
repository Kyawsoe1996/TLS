import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import type { AiPostRequest, Audience, BrandTone, Post } from "@shared/types";

import { ChoiceChips, PostMediaBlock, afterPostChanged, cachePost, postCopyAllText, postRoutes, postShareText, useAttachMedia, usePost } from "@/components/grow";
import { AiResultCard, Button, Card, Eyebrow, Field, LoadingAI, Screen } from "@/components/ui";
import { FEATURES } from "@/constants/features";
import { colors, fonts, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { useAiConsent } from "@/lib/useAiConsent";
import { formatDateTime } from "@/lib/format";
import { showError, showToast } from "@/lib/toast";
import { useShop } from "@/lib/useShop";

const TONES: readonly BrandTone[] = ["Sophisticated", "Welcoming", "Premium"];
const AUDIENCES: readonly Audience[] = ["Expatriates", "Local executives", "Grooms", "Tourists"];

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * Content Studio — pipeline 3 (POST /ai/post). The API saves every result as a draft post; this screen then lets the
 * owner attach a photo or video and hand the caption to the share sheet.
 * Local SEO can deep-link here with `topic` (prefills the field) and `angle` (shown as a hint).
 */
export default function ContentStudioScreen() {
  const params = useLocalSearchParams<{ topic?: string; angle?: string }>();
  const topicParam = firstParam(params.topic);
  const angleParam = firstParam(params.angle);

  const api = useApi();
  const queryClient = useQueryClient();
  const shop = useShop().data ?? null;

  const [tone, setTone] = useState<BrandTone>(shop?.tone ?? "Sophisticated");
  const toneTouched = useRef(false);
  const [audience, setAudience] = useState<Audience>("Expatriates");
  const [topic, setTopic] = useState(topicParam);

  // Default the tone to the shop's tone once it arrives, unless the user already picked one.
  useEffect(() => {
    if (shop?.tone && !toneTouched.current) setTone(shop.tone);
  }, [shop?.tone]);

  // Follow a new deep link (e.g. tapping "Write a post" on a second keyword).
  useEffect(() => {
    if (topicParam) setTopic(topicParam);
  }, [topicParam]);

  const mutation = useMutation({
    mutationFn: (body: AiPostRequest) => api.aiPost(body),
    onSuccess: ({ post }) => {
      cachePost(queryClient, post);
      afterPostChanged(queryClient);
    },
    onError: (err) => showError(err, "Couldn't write the post"),
  });
  const result = mutation.data ?? null;

  const ensureAiConsent = useAiConsent();
  const write = async () => {
    const cleanTopic = topic.trim();
    if (!cleanTopic) return;
    if (!(await ensureAiConsent())) return;
    mutation.mutate({ brandTone: tone, topic: cleanTopic, audience });
  };

  return (
    <Screen
      back
      eyebrow="Grow"
      title="Content Studio"
      subtitle="A blog post, social caption and call to action — written in your voice."
      keyboard
    >
      {angleParam ? (
        <Card variant="soft" style={styles.hintCard}>
          <Ionicons name="bulb-outline" size={20} color={colors.goldDark} style={styles.hintIcon} />
          <Text style={styles.hintText}>
            <Text style={styles.hintLabel}>Angle from Local SEO: </Text>
            {angleParam}
          </Text>
        </Card>
      ) : null}

      <ChoiceChips
        label="Tone"
        options={TONES}
        value={tone}
        onChange={(t) => {
          toneTouched.current = true;
          setTone(t);
        }}
        disabled={mutation.isPending}
      />
      <ChoiceChips label="Audience" options={AUDIENCES} value={audience} onChange={setAudience} disabled={mutation.isPending} />

      <Field
        label="Topic"
        value={topic}
        onChangeText={setTopic}
        placeholder="Linen suits for Bangkok's hot season"
        autoCapitalize="sentences"
        returnKeyType="done"
        onSubmitEditing={() => void write()}
        editable={!mutation.isPending}
      />

      <Button
        title="Write with AI"
        icon="sparkles-outline"
        fullWidth
        onPress={() => void write()}
        loading={mutation.isPending}
        disabled={!topic.trim()}
      />

      {mutation.isPending ? <LoadingAI label="Writing in your tone…" /> : null}

      {result && !mutation.isPending ? <PostResult key={result.post.id} saved={result.post} /> : null}
    </Screen>
  );
}

/** Everything under the form once a post exists: the saved banner, the three cards, media, Copy all + Share. */
function PostResult({ saved }: { saved: Post }) {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  // The cache copy carries media / shared updates made from here; the AI result seeds it.
  const post = usePost(saved.id).data ?? saved;
  const attach = useAttachMedia(post.id);
  const [sharing, setSharing] = useState(false);

  const shared = useMutation({
    mutationFn: () => api.markPostShared(post.id),
    onSuccess: ({ post: updated }) => {
      cachePost(queryClient, updated);
      afterPostChanged(queryClient);
    },
    // The share itself went through; the status is a bookkeeping detail, so keep the error quiet and the screen calm.
    onError: (err) => showError(err, "Shared, but couldn't mark the post"),
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
      if (outcome.action === Share.sharedAction) shared.mutate();
    } catch (err) {
      showError(err, "Couldn't open the share sheet");
    } finally {
      setSharing(false);
    }
  };

  const onCopyAll = async () => {
    try {
      await Clipboard.setStringAsync(postCopyAllText(post));
      showToast("Copied", "Blog post, caption and call to action are on your clipboard.");
    } catch (err) {
      showError(err, "Couldn't copy");
    }
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open the saved post"
        onPress={() => router.push(postRoutes.detail(post.id))}
        style={({ pressed }) => [styles.savedBanner, pressed && styles.pressed]}
      >
        <Ionicons name="checkmark-circle" size={18} color={colors.successFg} />
        <Text style={styles.savedText} numberOfLines={2}>
          Saved to Posts · {post.status === "shared" ? "Shared" : "Draft"} · {formatDateTime(post.createdAt)}
        </Text>
        <Text style={styles.savedLink}>Open</Text>
      </Pressable>

      <View style={styles.results}>
        <AiResultCard eyebrow="Blog post" title={post.title} body={post.body} />
        <AiResultCard eyebrow="Social caption" title="Social caption" body={post.caption} copyText={post.caption} />
        <AiResultCard eyebrow="Call to action" title="Call to action" body={post.callToAction} copyText={post.callToAction} />
      </View>

      {FEATURES.postMedia ? (
        <View style={styles.section}>
          <Eyebrow>Photo or video</Eyebrow>
          <PostMediaBlock post={post} attach={attach} />
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button variant="ghost" icon="copy-outline" title="Copy all" style={styles.action} onPress={() => void onCopyAll()} />
        <Button icon="share-outline" title="Share" style={styles.action} onPress={() => void onShare()} loading={sharing} disabled={attach.busy} />
      </View>
      {post.sharedAt ? (
        <View style={styles.sharedRow}>
          <Ionicons name="checkmark-circle-outline" size={14} color={colors.successFg} />
          <Text style={styles.sharedText}>Shared · {formatDateTime(post.sharedAt)}</Text>
        </View>
      ) : null}
      <Text style={styles.caption}>
        Share opens your phone&apos;s share sheet: paste into Instagram, Facebook, LINE or anywhere else. The post is marked as shared.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  hintCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12 },
  hintIcon: { marginTop: 2 },
  hintText: { ...typography.body, flex: 1 },
  hintLabel: { fontFamily: fonts.bodySemi, color: colors.goldDark },
  savedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.successBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pressed: { opacity: 0.8 },
  savedText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.successFg },
  savedLink: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 20, color: colors.successFg, textDecorationLine: "underline" },
  results: { gap: 16 },
  section: { gap: 10, marginTop: 4 },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  action: { flex: 1 },
  sharedRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: -6 },
  sharedText: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.successFg },
  caption: { ...typography.small, textAlign: "center", paddingHorizontal: 8, marginTop: -4 },
});
