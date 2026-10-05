import { Ionicons } from "@expo/vector-icons";
import { Image, StyleSheet, Text, View } from "react-native";
import type { Post } from "@shared/types";

import { Tag } from "@/components/clients";
import { Card } from "@/components/ui";
import { colors, radii, typography } from "@/constants/theme";
import { formatDate } from "@/lib/format";

import { postBriefLine, postStatusLabel } from "./queries";

export interface PostRowProps {
  post: Post;
  onPress: () => void;
}

/** Draft in gold, Shared in green. */
export function PostStatusTag({ status }: { status: Post["status"] }) {
  return <Tag label={postStatusLabel(status)} tone={status === "shared" ? "success" : "warning"} icon={status === "shared" ? "checkmark" : undefined} />;
}

/** 64×64 thumbnail: the photo, a dark tile with a play icon for a video, or a soft tile with a document icon when there's no media. */
function Thumb({ post }: { post: Post }) {
  const media = post.media;
  if (media?.kind === "image") {
    return <Image source={{ uri: media.url }} style={styles.thumb} accessibilityIgnoresInvertColors resizeMode="cover" />;
  }
  if (media?.kind === "video") {
    return (
      <View style={[styles.thumb, styles.thumbVideo]}>
        <Ionicons name="play" size={22} color={colors.ivory} />
      </View>
    );
  }
  return (
    <View style={[styles.thumb, styles.thumbEmpty]}>
      <Ionicons name="document-text-outline" size={22} color={colors.goldDark} />
    </View>
  );
}

/** One post in the library: thumbnail, serif title, "topic · tone · audience · date", status tag. */
export function PostRow({ post, onPress }: PostRowProps) {
  return (
    <Card onPress={onPress} padding={12} style={styles.card} testID={`post-row-${post.id}`}>
      <Thumb post={post} />
      <View style={styles.text}>
        <Text style={typography.h3} numberOfLines={2}>
          {post.title}
        </Text>
        <Text style={typography.small} numberOfLines={1}>
          {postBriefLine(post)} · {formatDate(post.createdAt)}
        </Text>
        <PostStatusTag status={post.status} />
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: radii.field, backgroundColor: colors.sand },
  thumbVideo: { backgroundColor: colors.navy, alignItems: "center", justifyContent: "center" },
  thumbEmpty: { backgroundColor: colors.cardSoft, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, minWidth: 0, gap: 4 },
});
