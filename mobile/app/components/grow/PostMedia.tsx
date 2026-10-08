// Photo / video attached to a post: the picker + size and duration checks + upload (useAttachMedia), and the tiles
// that show it (MediaPreview) or invite one (AddMediaTiles). PostMediaBlock puts the two together for a post.
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { MEDIA_LIMITS, type MediaKind, type Post, type PostMedia } from "@shared/types";

import { Button, type IoniconName } from "@/components/ui";
import { FEATURES } from "@/constants/features";
import { colors, fonts, radii, typography } from "@/constants/theme";
import { useApi, type MediaFile } from "@/lib/api";
import { formatBytes, formatDuration } from "@/lib/format";
import { showError, showToast } from "@/lib/toast";

import { afterPostChanged, cachePost } from "./queries";

const IMAGE_TYPES: readonly string[] = MEDIA_LIMITS.imageTypes;
const VIDEO_TYPES: readonly string[] = MEDIA_LIMITS.videoTypes;

const EXTENSION_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
};

/** The MIME type to send: the picker's when it's one the API accepts, otherwise guessed from the file extension. */
function resolveMimeType(asset: ImagePicker.ImagePickerAsset, kind: MediaKind): string | null {
  const allowed = kind === "image" ? IMAGE_TYPES : VIDEO_TYPES;
  const reported = asset.mimeType?.toLowerCase();
  if (reported && allowed.includes(reported)) return reported;
  const name = asset.fileName ?? asset.uri;
  const ext = name.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const guessed = EXTENSION_TYPES[ext];
  if (guessed && allowed.includes(guessed)) return guessed;
  // The picker re-encodes most photos as JPEG and iOS hands videos over as QuickTime; fall back to those when it says nothing.
  if (!reported && kind === "image") return "image/jpeg";
  if (!reported && kind === "video") return Platform.OS === "ios" ? "video/quicktime" : "video/mp4";
  return null;
}

/** Bytes of the picked file: the picker's figure when present, otherwise read through fetch(). */
async function fileSize(asset: ImagePicker.ImagePickerAsset): Promise<number | null> {
  if (typeof asset.fileSize === "number" && asset.fileSize > 0) return asset.fileSize;
  try {
    const blob = await (await fetch(asset.uri)).blob();
    return blob.size;
  } catch {
    return null; // the API enforces the limit too; let the upload decide
  }
}

/**
 * iOS shows its own picker without any permission; Android needs the media-library permission before 13.
 * Returns false (after explaining) when access was refused.
 */
async function ensureLibraryAccess(): Promise<boolean> {
  if (Platform.OS === "ios") return true;
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  const asked = current.canAskAgain ? await ImagePicker.requestMediaLibraryPermissionsAsync() : current;
  if (asked.granted) return true;
  Alert.alert("Photo access needed", "Allow photo access in Settings to attach a photo.", [
    { text: "Not now", style: "cancel" },
    { text: "Open Settings", onPress: () => void Linking.openSettings() },
  ]);
  return false;
}

function isPermissionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /permission|denied|not authori[sz]ed/i.test(message);
}

export interface AttachMedia {
  /** Opens the camera roll for a photo or a video, checks it against MEDIA_LIMITS and uploads it. Resolves to the updated post, or null when nothing changed. */
  pick: (kind: MediaKind) => Promise<Post | null>;
  /** DELETE /posts/:id/media. */
  remove: () => Promise<Post | null>;
  /** The kind being uploaded right now, or null. */
  uploading: MediaKind | null;
  removing: boolean;
  busy: boolean;
}

/** Everything behind "Add photo" / "Add video" / "Replace" / "Remove" for one post. Updates the react-query cache on success. */
export function useAttachMedia(postId: string | undefined): AttachMedia {
  const api = useApi();
  const qc = useQueryClient();
  const [picking, setPicking] = useState<MediaKind | null>(null);

  const upload = useMutation({
    mutationFn: ({ file }: { kind: MediaKind; file: MediaFile }) => api.uploadPostMedia(postId as string, file),
    onSuccess: ({ post }) => {
      cachePost(qc, post);
      afterPostChanged(qc);
    },
    onError: (err, { kind }) => showError(err, kind === "video" ? "Couldn't add the video" : "Couldn't add the photo"),
  });

  const removal = useMutation({
    mutationFn: () => api.deletePostMedia(postId as string),
    onSuccess: ({ post }) => {
      cachePost(qc, post);
      afterPostChanged(qc);
    },
    onError: (err) => showError(err, "Couldn't remove it"),
  });

  const pick = async (kind: MediaKind): Promise<Post | null> => {
    if (!postId || picking || upload.isPending || removal.isPending) return null;
    setPicking(kind);
    try {
      if (!(await ensureLibraryAccess())) return null;

      let result: ImagePicker.ImagePickerResult;
      try {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: kind === "image" ? ["images"] : ["videos"],
          allowsEditing: false,
          quality: 0.85,
          exif: false,
          videoMaxDuration: MEDIA_LIMITS.videoSeconds,
        });
      } catch (err) {
        if (isPermissionError(err)) {
          showToast("Photo access needed", "Allow photo access in Settings to attach a photo.");
        } else {
          showError(err, "Couldn't open your photos");
        }
        return null;
      }
      if (result.canceled) return null;
      const asset = result.assets[0];
      if (!asset) return null;

      const mimeType = resolveMimeType(asset, kind);
      if (!mimeType) {
        showToast(
          kind === "video" ? "That video format isn't supported" : "That photo format isn't supported",
          kind === "video" ? "Use an MP4 or MOV video." : "Use a JPEG, PNG or WebP photo.",
        );
        return null;
      }

      const durationSec = kind === "video" && typeof asset.duration === "number" ? asset.duration / 1000 : null;
      if (durationSec !== null && durationSec > MEDIA_LIMITS.videoSeconds) {
        showToast("Videos up to 60 seconds", `This one is ${formatDuration(durationSec)}. Trim it in Photos and try again.`);
        return null;
      }

      const size = await fileSize(asset);
      const limit = kind === "video" ? MEDIA_LIMITS.videoBytes : MEDIA_LIMITS.imageBytes;
      if (size !== null && size > limit) {
        showToast(kind === "video" ? "Videos up to 60 MB" : "Photos up to 10 MB", `This one is ${formatBytes(size)}.`);
        return null;
      }

      const file: MediaFile = {
        uri: asset.uri,
        mimeType,
        width: asset.width || null,
        height: asset.height || null,
        duration: durationSec,
        size,
      };
      try {
        return (await upload.mutateAsync({ kind, file })).post;
      } catch {
        return null; // already shown by onError
      }
    } finally {
      setPicking(null);
    }
  };

  const remove = async (): Promise<Post | null> => {
    if (!postId || upload.isPending || removal.isPending) return null;
    try {
      return (await removal.mutateAsync()).post;
    } catch {
      return null;
    }
  };

  const uploading = upload.isPending ? upload.variables?.kind ?? picking : null;
  return {
    pick,
    remove,
    uploading,
    removing: removal.isPending,
    busy: !!picking || upload.isPending || removal.isPending,
  };
}

export interface MediaPreviewProps {
  media: PostMedia;
  /** Height of the frame (default 220). */
  height?: number;
  onReplace?: () => void;
  onRemove?: () => void;
  /** Label of the replace button (default "Replace"). */
  replaceLabel?: string;
  removing?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The attached photo (or a dark video tile with a play icon and its length) with Replace / Remove underneath. */
export function MediaPreview({ media, height = 220, onReplace, onRemove, replaceLabel = "Replace", removing = false, disabled = false, style }: MediaPreviewProps) {
  const label = media.kind === "video" ? "Video" : "Photo";
  return (
    <View style={[styles.preview, style]}>
      {media.kind === "image" ? (
        <Image source={{ uri: media.url }} style={[styles.frame, { height }]} resizeMode="cover" accessibilityLabel="Attached photo" accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.frame, styles.videoFrame, { height }]} accessibilityLabel="Attached video">
          <View style={styles.playCircle}>
            <Ionicons name="play" size={26} color={colors.navy} style={styles.playIcon} />
          </View>
          {media.durationSec ? <Text style={styles.duration}>{formatDuration(media.durationSec)}</Text> : null}
        </View>
      )}
      <View style={styles.previewRow}>
        <Text style={typography.small} numberOfLines={1}>
          {label}
          {media.width && media.height ? ` · ${media.width} × ${media.height}` : ""}
          {media.sizeBytes ? ` · ${formatBytes(media.sizeBytes)}` : ""}
        </Text>
        <View style={styles.previewActions}>
          {onReplace ? <Button size="sm" variant="ghost" icon="swap-horizontal-outline" title={replaceLabel} onPress={onReplace} disabled={disabled} /> : null}
          {onRemove ? (
            <Button size="sm" variant="ghost" icon="trash-outline" title="Remove" onPress={onRemove} loading={removing} disabled={disabled && !removing} textStyle={styles.removeText} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function AddTile({ icon, label, hint, onPress, disabled, loading }: { icon: IoniconName; label: string; hint: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed, disabled && !loading && styles.tileDisabled]}
    >
      <View style={styles.tileIcon}>{loading ? <ActivityIndicator color={colors.goldDark} /> : <Ionicons name={icon} size={20} color={colors.goldDark} />}</View>
      <Text style={styles.tileLabel}>{loading ? "Uploading…" : label}</Text>
      <Text style={styles.tileHint}>{hint}</Text>
    </Pressable>
  );
}

export interface AddMediaTilesProps {
  onAdd: (kind: MediaKind) => void;
  /** Which kind is uploading right now (shows a spinner on that tile). */
  uploading?: MediaKind | null;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Two dashed tiles: "Add photo" (from the camera roll) and "Add video" (up to 60 seconds). */
export function AddMediaTiles({ onAdd, uploading = null, disabled = false, style }: AddMediaTilesProps) {
  return (
    <View style={[styles.tiles, style]}>
      <AddTile icon="image-outline" label="Add photo" hint="From your camera roll" onPress={() => onAdd("image")} disabled={disabled} loading={uploading === "image"} />
      <AddTile icon="videocam-outline" label="Add video" hint="Up to 60 seconds" onPress={() => onAdd("video")} disabled={disabled} loading={uploading === "video"} />
    </View>
  );
}

export interface PostMediaBlockProps {
  post: Post;
  attach: AttachMedia;
  /** Height of the preview frame (default 220). */
  height?: number;
  /** "Replace" (default) or e.g. "Change photo". */
  replaceLabel?: string | ((kind: MediaKind) => string);
  /** Disable everything (e.g. while the post is being saved). */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The post's media with Replace / Remove, or the Add tiles when it has none, plus an "Uploading…" row during an upload.
 * Renders nothing while media is switched off for the release (constants/features.ts).
 */
export function PostMediaBlock({ post, attach, height, replaceLabel = "Replace", disabled = false, style }: PostMediaBlockProps) {
  if (!FEATURES.postMedia) return null;
  const media = post.media;
  const locked = disabled || attach.busy;
  const label = typeof replaceLabel === "function" ? replaceLabel(media?.kind ?? "image") : replaceLabel;
  return (
    <View style={[styles.block, style]}>
      {media ? (
        <MediaPreview
          media={media}
          height={height}
          replaceLabel={label}
          onReplace={() => void attach.pick(media.kind)}
          onRemove={() => void attach.remove()}
          removing={attach.removing}
          disabled={locked}
        />
      ) : (
        <AddMediaTiles onAdd={(kind) => void attach.pick(kind)} uploading={attach.uploading} disabled={locked} />
      )}
      {attach.uploading ? (
        <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel="Uploading">
          <ActivityIndicator color={colors.goldDark} size="small" />
          <Text style={styles.progressText}>{attach.uploading === "video" ? "Uploading video… this can take a moment on mobile data." : "Uploading photo…"}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  preview: { gap: 8 },
  frame: { width: "100%", borderRadius: radii.card, backgroundColor: colors.sand, overflow: "hidden" },
  videoFrame: { backgroundColor: colors.navy, alignItems: "center", justifyContent: "center" },
  playCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  playIcon: { marginLeft: 3 },
  duration: {
    position: "absolute",
    right: 12,
    bottom: 10,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    lineHeight: 16,
    color: colors.ivory,
    backgroundColor: "rgba(20, 33, 58, 0.72)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: "hidden",
  },
  previewRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  previewActions: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: "auto" },
  removeText: { color: colors.danger },
  tiles: { flexDirection: "row", gap: 12 },
  tile: {
    flex: 1,
    minWidth: 0,
    minHeight: 124,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.line,
    backgroundColor: colors.cardSoft,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: 12,
  },
  tilePressed: { opacity: 0.8 },
  tileDisabled: { opacity: 0.55 },
  tileIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sand, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  tileLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 18, color: colors.ink },
  tileHint: { ...typography.small, textAlign: "center" },
  progress: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4 },
  progressText: { ...typography.small, flex: 1 },
});
