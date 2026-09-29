import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import type { AiPostRequest, Audience, BrandTone } from "@shared/types";

import { ChoiceChips, DEFAULT_PLATFORM_SELECTION, PLATFORMS, PlaceholderTile, PlatformRow, type PlatformKey } from "@/components/grow";
import { AiResultCard, Button, Card, Eyebrow, Field, LoadingAI, Screen } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { showError, showToast } from "@/lib/toast";
import { useShop } from "@/lib/useShop";

const TONES: readonly BrandTone[] = ["Sophisticated", "Welcoming", "Premium"];
const AUDIENCES: readonly Audience[] = ["Expatriates", "Local executives", "Grooms", "Tourists"];

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * Content Studio — pipeline 3 (POST /ai/post).
 * Local SEO can deep-link here with `topic` (prefills the field) and `angle` (shown as a hint).
 */
export default function ContentStudioScreen() {
  const params = useLocalSearchParams<{ topic?: string; angle?: string }>();
  const topicParam = firstParam(params.topic);
  const angleParam = firstParam(params.angle);

  const router = useRouter();
  const api = useApi();
  const shop = useShop().data ?? null;

  const [tone, setTone] = useState<BrandTone>(shop?.tone ?? "Sophisticated");
  const toneTouched = useRef(false);
  const [audience, setAudience] = useState<Audience>("Expatriates");
  const [topic, setTopic] = useState(topicParam);
  const [platforms, setPlatforms] = useState<Record<PlatformKey, boolean>>(DEFAULT_PLATFORM_SELECTION);
  const [sharing, setSharing] = useState(false);

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
    onError: (err) => showError(err, "Couldn't write the post"),
  });
  const result = mutation.data ?? null;

  const write = () => {
    const cleanTopic = topic.trim();
    if (!cleanTopic) return;
    mutation.mutate({ brandTone: tone, topic: cleanTopic, audience });
  };

  const selectedKeys = PLATFORMS.filter((p) => platforms[p.key]).map((p) => p.key);
  const canPost = !!result && selectedKeys.length > 0 && !sharing;

  const postCaption = result ? `${result.social_caption}\n\n${result.call_to_action}` : "";

  const onPostNow = async () => {
    if (!result) return;
    setSharing(true);
    try {
      await Share.share({ message: postCaption });
    } catch {
      // share sheet dismissed or unavailable — still show the confirmation
    } finally {
      setSharing(false);
    }
    router.push({
      pathname: "/(tabs)/grow/posted",
      params: { platforms: selectedKeys.join(","), caption: postCaption },
    });
  };

  const onCopyAll = async () => {
    if (!result) return;
    const all = [`${result.blog_title}\n\n${result.blog_body}`, result.social_caption, result.call_to_action].join("\n\n");
    try {
      await Clipboard.setStringAsync(all);
      showToast("Copied", "Blog post, caption and call to action are on your clipboard.");
    } catch (err) {
      showError(err, "Couldn't copy");
    }
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
        onSubmitEditing={write}
        editable={!mutation.isPending}
      />

      <Button
        title="Write with AI"
        icon="sparkles-outline"
        fullWidth
        onPress={write}
        loading={mutation.isPending}
        disabled={!topic.trim()}
      />

      {mutation.isPending ? <LoadingAI label="Writing in your tone…" /> : null}

      {result ? (
        <View style={styles.results}>
          <AiResultCard eyebrow="Blog post" title={result.blog_title} body={result.blog_body} />
          <AiResultCard eyebrow="Social caption" title="Social caption" body={result.social_caption} copyText={result.social_caption} />
          <AiResultCard eyebrow="Call to action" title="Call to action" body={result.call_to_action} copyText={result.call_to_action} />
        </View>
      ) : null}

      <View style={styles.section}>
        <Eyebrow>Media</Eyebrow>
        <View style={styles.tiles}>
          <PlaceholderTile icon="image-outline" label="Photo post" hint="Square, 1080 × 1080" />
          <PlaceholderTile icon="videocam-outline" label="15s video" hint="Vertical, 9:16" />
        </View>
        <Button
          variant="ghost"
          size="sm"
          icon="add"
          title="Add photo"
          onPress={() => showToast("Coming soon", "Photo upload is coming in the next update.")}
        />
      </View>

      <Card style={styles.shareCard}>
        <Eyebrow>Share to</Eyebrow>
        <View>
          {PLATFORMS.map((platform, i) => (
            <PlatformRow
              key={platform.key}
              platform={platform}
              value={platforms[platform.key]}
              onValueChange={(v) => setPlatforms((prev) => ({ ...prev, [platform.key]: v }))}
              last={i === PLATFORMS.length - 1}
            />
          ))}
        </View>
        <Text style={typography.small}>
          Direct posting to these apps is coming. For now, Post now opens your phone&apos;s share sheet.
        </Text>
      </Card>

      <View style={styles.actions}>
        <Button
          variant="secondary"
          icon="calendar-outline"
          title="Schedule"
          style={styles.action}
          onPress={() => showToast("Scheduling is coming soon")}
        />
        <Button
          variant="gold"
          icon="send"
          title="Post now"
          style={styles.action}
          onPress={() => void onPostNow()}
          loading={sharing}
          disabled={!canPost}
        />
      </View>
      <Button variant="ghost" icon="copy-outline" title="Copy all" onPress={() => void onCopyAll()} disabled={!result} style={styles.copyAll} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hintCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12 },
  hintIcon: { marginTop: 2 },
  hintText: { ...typography.body, flex: 1 },
  hintLabel: { fontFamily: fonts.bodySemi, color: colors.goldDark },
  results: { gap: 16 },
  section: { gap: 10, marginTop: 4 },
  tiles: { flexDirection: "row", gap: 12 },
  shareCard: { gap: 10 },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1 },
  copyAll: { alignSelf: "center" },
});
