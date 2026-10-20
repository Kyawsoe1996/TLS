// Progress photos on an order: the "Progress photos" section (3-column grid of thumbnails + the "Add photo" tile)
// and the full-screen viewer with Share / Delete. Picking goes through lib/media; uploads carry the order's current
// status as the photo's stage and the returned order goes straight into the react-query cache.
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Image, Modal, Platform, Pressable, Share, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ORDER_PHOTO_LIMITS, type Order, type OrderPhoto } from "@shared/types";

import { Button, SectionTitle } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { useApi, type MediaFile } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { pickMedia, type MediaLimits } from "@/lib/media";
import { confirm, showError } from "@/lib/toast";

import { cacheOrder } from "./queries";
import { orderStatusLabel } from "./Tag";

const COLUMNS = 3;
const PHOTO_LIMITS: MediaLimits = { types: ORDER_PHOTO_LIMITS.types, bytes: ORDER_PHOTO_LIMITS.bytes };

export interface OrderPhotosProps {
  order: Order;
  /** For the share message: "<garment> for <client> · <stage>". */
  clientName?: string;
  /** Blocks adding / deleting (e.g. while the order is being deleted). */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

type Cell = { kind: "photo"; photo: OrderPhoto } | { kind: "add" };

/** "<garment> for <client> · <stage>" — the line that goes with a shared photo. */
export function orderPhotoShareText(order: Order, clientName: string | undefined, photo: OrderPhoto): string {
  return `${order.garment} for ${clientName ?? "the client"} · ${orderStatusLabel(photo.stage)}`;
}

/** The section on the order screen: title with the count, the grid, the privacy line. */
export function OrderPhotos({ order, clientName, disabled = false, style }: OrderPhotosProps) {
  const api = useApi();
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [viewing, setViewing] = useState<OrderPhoto | null>(null);
  // Orders cached before the field existed have no `photos`.
  const photos = order.photos ?? [];
  const full = photos.length >= ORDER_PHOTO_LIMITS.perOrder;

  const upload = useMutation({
    mutationFn: (file: MediaFile) => api.uploadOrderPhoto(order.clientId, order.id, file, order.status),
    onSuccess: ({ order: saved }) => cacheOrder(qc, saved),
    onError: (err) => showError(err, "Couldn't add the photo"),
  });

  const removal = useMutation({
    mutationFn: (photoId: string) => api.deleteOrderPhoto(order.clientId, order.id, photoId),
    onSuccess: ({ order: saved }) => {
      cacheOrder(qc, saved);
      setViewing(null);
    },
    onError: (err) => showError(err, "Couldn't delete the photo"),
  });

  const uploading = picking || upload.isPending;

  const add = async () => {
    if (disabled || uploading || full) return;
    setPicking(true);
    try {
      const file = await pickMedia("image", PHOTO_LIMITS);
      if (!file) return;
      try {
        await upload.mutateAsync(file);
      } catch {
        // already shown by onError
      }
    } finally {
      setPicking(false);
    }
  };

  const onDelete = async (photo: OrderPhoto) => {
    if (disabled || removal.isPending) return;
    const ok = await confirm({
      title: "Delete this photo?",
      message: "It will be removed from the order. This can't be undone.",
      confirmText: "Delete",
      destructive: true,
    });
    if (ok) removal.mutate(photo.id);
  };

  const onShare = async (photo: OrderPhoto) => {
    const message = orderPhotoShareText(order, clientName, photo);
    try {
      // iOS shares the link as an attachment next to the text; Android only takes a message.
      await Share.share(Platform.OS === "ios" ? { message, url: photo.url } : { message: `${message}\n${photo.url}` });
    } catch {
      // user dismissed or share unavailable
    }
  };

  const cells: Cell[] = [...photos.map((photo): Cell => ({ kind: "photo", photo })), ...(full ? [] : [{ kind: "add" } as Cell])];
  const rows: Cell[][] = [];
  for (let i = 0; i < cells.length; i += COLUMNS) rows.push(cells.slice(i, i + COLUMNS));

  return (
    <View style={[styles.block, style]} testID="order-photos">
      <SectionTitle title="Progress photos" right={photos.length > 0 ? <Text style={typography.small}>{photos.length}</Text> : undefined} style={styles.sectionTitle} />
      <View style={styles.grid}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((cell) =>
              cell.kind === "photo" ? (
                <PhotoTile key={cell.photo.id} photo={cell.photo} onPress={() => setViewing(cell.photo)} />
              ) : (
                <AddPhotoTile key="add" onPress={() => void add()} disabled={disabled} loading={uploading} />
              ),
            )}
            {Array.from({ length: COLUMNS - row.length }, (_, i) => (
              <View key={`pad-${i}`} style={styles.cell} />
            ))}
          </View>
        ))}
      </View>
      {full ? (
        <Text style={typography.small}>
          {photos.length} of {ORDER_PHOTO_LIMITS.perOrder} photos
        </Text>
      ) : null}
      <Text style={typography.small}>Photos stay private to the shop unless you share one.</Text>

      <PhotoViewer
        photo={viewing}
        title={order.garment}
        onClose={() => setViewing(null)}
        onShare={() => viewing && void onShare(viewing)}
        onDelete={() => viewing && void onDelete(viewing)}
        deleting={removal.isPending}
        disabled={disabled}
      />
    </View>
  );
}

function PhotoTile({ photo, onPress }: { photo: OrderPhoto; onPress: () => void }) {
  const stage = orderStatusLabel(photo.stage);
  return (
    <View style={styles.cell}>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`${stage} photo, ${formatDate(photo.createdAt)}`}
        onPress={onPress}
        style={({ pressed }) => [styles.thumb, pressed && styles.pressed]}
        testID={`order-photo-${photo.id}`}
      >
        <Image source={{ uri: photo.url }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
      </Pressable>
      <Text style={styles.stage} numberOfLines={1}>
        {stage}
      </Text>
      <Text style={styles.date} numberOfLines={1}>
        {formatDate(photo.createdAt)}
      </Text>
    </View>
  );
}

function AddPhotoTile({ onPress, disabled, loading }: { onPress: () => void; disabled: boolean; loading: boolean }) {
  return (
    <View style={styles.cell}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add photo"
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
        onPress={onPress}
        disabled={disabled || loading}
        style={({ pressed }) => [styles.addTile, pressed && styles.pressed, disabled && !loading && styles.disabled]}
        testID="order-photo-add"
      >
        {loading ? <ActivityIndicator color={colors.goldDark} /> : <Ionicons name="camera-outline" size={24} color={colors.goldDark} />}
        <Text style={styles.addLabel}>{loading ? "Uploading…" : "Add photo"}</Text>
      </Pressable>
    </View>
  );
}

interface PhotoViewerProps {
  /** Hidden when null. */
  photo: OrderPhoto | null;
  title: string;
  onClose: () => void;
  onShare: () => void;
  onDelete: () => void;
  deleting: boolean;
  disabled: boolean;
}

/** Full-screen photo on black with close, the stage · date line, Share and Delete. */
function PhotoViewer({ photo, title, onClose, onShare, onDelete, deleting, disabled }: PhotoViewerProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!photo} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.viewer} testID="order-photo-viewer">
        {photo ? <Image source={{ uri: photo.url }} style={styles.viewerImage} resizeMode="contain" accessibilityLabel={`${title} photo`} accessibilityIgnoresInvertColors /> : null}
        <View style={[styles.viewerTop, { paddingTop: insets.top + 8 }]}>
          <View style={styles.viewerTitle}>
            <Text style={styles.viewerHeading} numberOfLines={1}>
              {title}
            </Text>
            {photo ? (
              <Text style={styles.viewerLine} numberOfLines={1}>
                {orderStatusLabel(photo.stage)} · {formatDate(photo.createdAt)}
              </Text>
            ) : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Ionicons name="close" size={22} color={colors.ivory} />
          </Pressable>
        </View>
        <View style={[styles.viewerBottom, { paddingBottom: insets.bottom + 12 }]}>
          <Button size="sm" variant="onDark" icon="share-outline" title="Share" onPress={onShare} disabled={deleting} />
          <Button
            size="sm"
            variant="onDark"
            icon="trash-outline"
            title="Delete"
            onPress={onDelete}
            loading={deleting}
            disabled={disabled}
            textStyle={styles.deleteText}
            testID="order-photo-delete"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  sectionTitle: { marginBottom: 0 },
  grid: { gap: 10 },
  row: { flexDirection: "row", gap: 10 },
  cell: { flex: 1, minWidth: 0, gap: 2 },
  thumb: {
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.sand,
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  stage: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16, color: colors.ink, marginTop: 4 },
  date: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.muted },
  addTile: {
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.gold,
    backgroundColor: colors.cardSoft,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 8,
  },
  addLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16, color: colors.goldDark, textAlign: "center" },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.55 },
  viewer: { flex: 1, backgroundColor: "#000000" },
  viewerImage: { ...StyleSheet.absoluteFillObject },
  viewerTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  viewerTitle: { flex: 1, minWidth: 0, gap: 2, paddingTop: 6 },
  viewerHeading: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 20, color: colors.ivory },
  viewerLine: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.ivorySoft },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  deleteText: { color: colors.dangerBg },
});
