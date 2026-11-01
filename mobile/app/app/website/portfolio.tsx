import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import {
  ORDER_PHOTO_LIMITS,
  WEBSITE_LIMITS,
  WEBSITE_PIECE_CATEGORIES,
  type PortfolioOrderCandidate,
  type WebsitePiece,
  type WebsitePieceCategory,
  type WebsitePortfolioResponse,
} from "@shared/types";

import { ErrorBlock, LoadingBlock } from "@/components/clients";
import { Button, Card, Chip, EmptyState, Eyebrow, Field, Screen } from "@/components/ui";
import { useUpdateWebsite, useWebsiteAction, useWebsitePortfolio } from "@/components/website";
import { colors, fonts, radii, typography } from "@/constants/theme";
import { isApiClientError } from "@/lib/api";
import { pickMedia, type MediaLimits } from "@/lib/media";
import { confirm, showError, showToast } from "@/lib/toast";
import { useAiConsent } from "@/lib/useAiConsent";
import { CATEGORY_LABELS, moveItem, orderSourceLine } from "@/lib/website";

const COLUMNS = 3;
const PHOTO_LIMITS: MediaLimits = { types: ORDER_PHOTO_LIMITS.types, bytes: ORDER_PHOTO_LIMITS.bytes };
type Source = "orders" | "posts" | "upload";

/**
 * Your free website → Portfolio: pick the work the website shows. Source chips (orders with photos, posts with a
 * photo, uploads), a 3-column grid with tick circles (ticked = on the website) and a COVER badge, and the selected
 * piece's card: title, the read-only line from its order, a line about it, cover, AI line, photos, order and removal.
 * Client names are never shown or sent: pieces carry only the garment, cloth and the owner's words.
 */
export default function WebsitePortfolioScreen() {
  const query = useWebsitePortfolio();
  const [refreshing, setRefreshing] = useState(false);
  const count = query.data?.pieces.length ?? 0;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen
      back
      keyboard
      eyebrow="Your website"
      title="Portfolio"
      subtitle={`Pick the work clients see. ${count} ${count === 1 ? "piece" : "pieces"} shown.`}
      edges={["top", "bottom"]}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      {query.isPending ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : (
        <PortfolioManager data={query.data} />
      )}
    </Screen>
  );
}

interface Tile {
  key: string;
  url: string | null;
  pieceId: string | null;
  label: string;
  onAdd?: () => void;
}

function PortfolioManager({ data }: { data: WebsitePortfolioResponse }) {
  const [source, setSource] = useState<Source>("orders");
  const [selectedId, setSelectedId] = useState<string | null>(data.pieces[0]?.id ?? null);
  const [uploading, setUploading] = useState(false);
  const pieces = data.pieces;
  const selected = pieces.find((p) => p.id === selectedId) ?? null;
  const full = pieces.length >= WEBSITE_LIMITS.piecesMax;

  // A removed piece (or a refetch without it) drops the selection back to the first piece.
  useEffect(() => {
    if (selectedId && !pieces.some((p) => p.id === selectedId)) setSelectedId(pieces[0]?.id ?? null);
  }, [pieces, selectedId]);

  const create = useWebsiteAction((api, body: { orderId?: string; postId?: string; title?: string }) => api.createWebsitePiece(body), "Couldn't add it to the website");
  const remove = useWebsiteAction((api, id: string) => api.deleteWebsitePiece(id), "Couldn't remove it");
  const upload = useWebsiteAction((api, v: { id: string; file: Parameters<typeof api.uploadWebsitePiecePhoto>[1] }) => api.uploadWebsitePiecePhoto(v.id, v.file), "Couldn't add the photo");

  const add = (body: { orderId?: string; postId?: string }) => {
    if (full) {
      showToast("Portfolio is full", `The website shows up to ${WEBSITE_LIMITS.piecesMax} pieces. Remove one to add another.`);
      return;
    }
    create.mutate(body, { onSuccess: ({ piece }) => setSelectedId(piece.id) });
  };

  const confirmRemove = async (piece: WebsitePiece) => {
    const ok = await confirm({
      title: "Take this off the website?",
      message: piece.orderId || piece.photos.some((p) => p.source !== "upload") ? "The photos stay with the order or post." : "Its uploaded photos are deleted.",
      confirmText: "Remove",
      destructive: true,
    });
    if (ok) remove.mutate(piece.id);
  };

  const uploadNew = async () => {
    if (full || uploading) return;
    setUploading(true);
    try {
      const file = await pickMedia("image", PHOTO_LIMITS);
      if (!file) return;
      const { piece } = await create.mutateAsync({ title: "New piece" });
      try {
        await upload.mutateAsync({ id: piece.id, file });
        setSelectedId(piece.id);
      } catch {
        remove.mutate(piece.id);
      }
    } catch {
      // shown by the mutation
    } finally {
      setUploading(false);
    }
  };

  const tiles: Tile[] = (() => {
    if (source === "orders") {
      return data.candidates.orders.map((o) => ({
        key: `o-${o.orderId}`,
        url: o.photos[o.photos.length - 1]?.url ?? null,
        pieceId: o.pieceId,
        label: o.garment,
        onAdd: () => add({ orderId: o.orderId }),
      }));
    }
    if (source === "posts") {
      return data.candidates.posts.map((p) => ({ key: `p-${p.postId}`, url: p.photoUrl, pieceId: p.pieceId, label: p.title, onAdd: () => add({ postId: p.postId }) }));
    }
    return pieces
      .filter((p) => !p.orderId && !p.photos.some((ph) => ph.source === "post"))
      .map((p) => ({ key: `u-${p.id}`, url: p.photos[0]?.url ?? null, pieceId: p.id, label: p.title }));
  })();

  const uploadsCount = pieces.filter((p) => !p.orderId && !p.photos.some((ph) => ph.source === "post")).length;
  const busy = create.isPending || remove.isPending;

  const onTile = (tile: Tile) => {
    if (tile.pieceId) setSelectedId(tile.pieceId);
    else tile.onAdd?.();
  };
  const onTick = (tile: Tile) => {
    if (busy) return;
    if (tile.pieceId) {
      const piece = pieces.find((p) => p.id === tile.pieceId);
      if (piece) void confirmRemove(piece);
    } else tile.onAdd?.();
  };

  const rows: (Tile | "upload")[][] = [];
  const cells: (Tile | "upload")[] = source === "upload" ? ["upload", ...tiles] : tiles;
  for (let i = 0; i < cells.length; i += COLUMNS) rows.push(cells.slice(i, i + COLUMNS));

  return (
    <>
      <View style={styles.chips}>
        <Chip label={`From orders · ${data.candidates.orders.length}`} selected={source === "orders"} onPress={() => setSource("orders")} testID="portfolio-source-orders" />
        <Chip label={`From posts · ${data.candidates.posts.length}`} selected={source === "posts"} onPress={() => setSource("posts")} testID="portfolio-source-posts" />
        <Chip label={uploadsCount > 0 ? `Upload · ${uploadsCount}` : "Upload"} icon="cloud-upload-outline" selected={source === "upload"} onPress={() => setSource("upload")} testID="portfolio-source-upload" />
      </View>

      {cells.length === 0 ? (
        <EmptyState
          icon={source === "orders" ? "shirt-outline" : "images-outline"}
          title={source === "orders" ? "No order photos yet" : "No posts with a photo yet"}
          body={
            source === "orders"
              ? "Add progress photos to an order (Clients → an order → Progress photos) and it shows up here."
              : "Posts from Content Studio with a photo show up here."
          }
        />
      ) : (
        <View style={styles.grid}>
          {rows.map((row, i) => (
            <View key={i} style={styles.row}>
              {row.map((cell) =>
                cell === "upload" ? (
                  <View key="upload" style={styles.cell}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Upload a photo"
                      onPress={() => void uploadNew()}
                      disabled={uploading || full}
                      style={({ pressed }) => [styles.addTile, pressed && styles.pressed]}
                      testID="portfolio-upload"
                    >
                      {uploading ? <ActivityIndicator color={colors.goldDark} /> : <Ionicons name="camera-outline" size={24} color={colors.goldDark} />}
                      <Text style={styles.addLabel}>{uploading ? "Uploading…" : "Upload photo"}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <PhotoTile
                    key={cell.key}
                    tile={cell}
                    cover={!!cell.pieceId && cell.pieceId === data.coverPieceId}
                    selected={!!cell.pieceId && cell.pieceId === selectedId}
                    onPress={() => onTile(cell)}
                    onTick={() => onTick(cell)}
                  />
                ),
              )}
              {Array.from({ length: COLUMNS - row.length }, (_, k) => (
                <View key={`pad-${k}`} style={styles.cell} />
              ))}
            </View>
          ))}
        </View>
      )}
      <Text style={typography.small}>Tap a photo to add it. Ticked ones are on your website. Client names are never shown.</Text>

      {selected ? (
        <SelectedPiece
          key={selected.id}
          piece={selected}
          index={pieces.findIndex((p) => p.id === selected.id)}
          pieces={pieces}
          order={data.candidates.orders.find((o) => o.orderId === selected.orderId) ?? null}
          isCover={selected.id === data.coverPieceId}
          onRemove={() => void confirmRemove(selected)}
        />
      ) : pieces.length === 0 ? (
        <Card variant="soft">
          <Text style={typography.body}>Nothing on your website yet. Tap a photo above to add your first piece; it becomes the cover.</Text>
        </Card>
      ) : null}
    </>
  );
}

function PhotoTile({ tile, cover, selected, onPress, onTick }: { tile: Tile; cover: boolean; selected: boolean; onPress: () => void; onTick: () => void }) {
  const ticked = !!tile.pieceId;
  return (
    <View style={styles.cell}>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`${tile.label}${ticked ? ", on the website" : ""}${cover ? ", cover" : ""}`}
        onPress={onPress}
        style={({ pressed }) => [styles.thumb, selected && styles.thumbSelected, pressed && styles.pressed]}
      >
        {tile.url ? <Image source={{ uri: tile.url }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors /> : <Ionicons name="image-outline" size={22} color={colors.muted} />}
        {cover ? (
          <View style={styles.coverBadge}>
            <Text style={styles.coverText}>COVER</Text>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: ticked }}
          accessibilityLabel={ticked ? "Remove from website" : "Add to website"}
          hitSlop={8}
          onPress={onTick}
          style={[styles.tick, ticked ? styles.tickOn : styles.tickOff]}
        >
          {ticked ? <Ionicons name="checkmark" size={14} color={colors.navy} /> : null}
        </Pressable>
      </Pressable>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {tile.label}
      </Text>
    </View>
  );
}

interface SelectedPieceProps {
  piece: WebsitePiece;
  index: number;
  pieces: WebsitePiece[];
  order: PortfolioOrderCandidate | null;
  isCover: boolean;
  onRemove: () => void;
}

/** The selected piece: thumbnail, title, the read-only order line, a line about it, and its actions. */
function SelectedPiece({ piece, index, pieces, order, isCover, onRemove }: SelectedPieceProps) {
  const ensureAiConsent = useAiConsent();
  const updateWebsite = useUpdateWebsite();
  const [title, setTitle] = useState(piece.title);
  const [line, setLine] = useState(piece.line ?? "");
  const [cloth, setCloth] = useState(piece.cloth ?? "");
  const [style, setStyle] = useState(piece.style ?? "");
  const [category, setCategory] = useState<WebsitePieceCategory>(piece.category);
  const [adding, setAdding] = useState(false);

  const save = useWebsiteAction((api, body: Parameters<typeof api.updateWebsitePiece>[1]) => api.updateWebsitePiece(piece.id, body), "Couldn't save the piece");
  const reorder = useWebsiteAction((api, ids: string[]) => api.reorderWebsitePieces(ids), "Couldn't move it");
  const addPhoto = useWebsiteAction((api, file: Parameters<typeof api.uploadWebsitePiecePhoto>[1]) => api.uploadWebsitePiecePhoto(piece.id, file), "Couldn't add the photo");
  const removePhoto = useWebsiteAction((api, photoId: string) => api.deleteWebsitePiecePhoto(piece.id, photoId), "Couldn't remove the photo");
  const ai = useWebsiteAction((api, id: string) => api.aiWebsitePieceLine(id), "Couldn't write a line");

  const changes = {
    ...(title.trim() !== piece.title ? { title: title.trim() } : {}),
    ...(line.trim() !== (piece.line ?? "") ? { line: line.trim() } : {}),
    ...(cloth.trim() !== (piece.cloth ?? "") ? { cloth: cloth.trim() } : {}),
    ...(style.trim() !== (piece.style ?? "") ? { style: style.trim() } : {}),
    ...(category !== piece.category ? { category } : {}),
  };
  const changed = Object.keys(changes).length > 0;
  const titleError = title.trim() ? null : "Give it a title.";

  const onSave = () => save.mutate(changes, { onSuccess: () => showToast("Saved", "Your website shows it within a few minutes.") });

  const writeWithAi = async () => {
    if (!(await ensureAiConsent())) return;
    try {
      if (changed && !titleError) await save.mutateAsync(changes);
      const res = await ai.mutateAsync(piece.id);
      setLine(res.line);
      showToast("Line written", "Read it, change anything you like, then Save.");
    } catch (err) {
      if (isApiClientError(err) && err.isConsentRequired) showError(err, "AI isn't switched on");
    }
  };

  const move = (direction: -1 | 1) => reorder.mutate(moveItem(pieces, index, direction).map((p) => p.id));

  const pickPhoto = async () => {
    if (adding || piece.photos.length >= WEBSITE_LIMITS.photosPerPiece) return;
    setAdding(true);
    try {
      const file = await pickMedia("image", PHOTO_LIMITS);
      if (file) await addPhoto.mutateAsync(file).catch(() => undefined);
    } finally {
      setAdding(false);
    }
  };

  const sourceLine = order
    ? orderSourceLine(order)
    : piece.photos.some((p) => p.source === "post")
      ? "From a post in Content Studio"
      : "Your own upload";

  return (
    <Card style={styles.selected} testID="portfolio-selected">
      <Eyebrow tone="muted">Selected piece · {index + 1} of {pieces.length}</Eyebrow>
      <View style={styles.selectedTop}>
        <View style={styles.selectedThumb}>
          {piece.photos[0] ? <Image source={{ uri: piece.photos[0].url }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
        </View>
        <View style={styles.flex}>
          <Text style={typography.h3} numberOfLines={2}>
            {piece.title}
          </Text>
          <Text style={typography.small}>{sourceLine}</Text>
          {isCover ? <Text style={styles.coverLine}>Cover photo of your website</Text> : null}
        </View>
      </View>

      <Field label="Title" value={title} onChangeText={setTitle} maxLength={WEBSITE_LIMITS.pieceTitleMax} error={titleError} testID="piece-title" />
      <View style={styles.categoryRow}>
        {WEBSITE_PIECE_CATEGORIES.map((c) => (
          <Chip key={c} label={CATEGORY_LABELS[c]} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </View>
      <Field label="Cloth" value={cloth} onChangeText={setCloth} maxLength={WEBSITE_LIMITS.clothMax} placeholder="Super 130s navy wool" />
      <Field label="Style" value={style} onChangeText={setStyle} maxLength={WEBSITE_LIMITS.styleMax} placeholder="Single-breasted, two buttons, notch lapel" />
      <Field
        label="A line about it"
        value={line}
        onChangeText={setLine}
        multiline
        maxLength={WEBSITE_LIMITS.pieceLineMax}
        placeholder="A navy suit for the office, soft shoulders and a slim trouser."
        hint="Shown under the title. Never write the client's name."
        testID="piece-line"
      />
      <View style={styles.actions}>
        <Button size="sm" title="Save" onPress={onSave} disabled={!changed || !!titleError} loading={save.isPending} testID="piece-save" />
        <Button size="sm" variant="secondary" icon="sparkles-outline" title="Write with AI" onPress={() => void writeWithAi()} loading={ai.isPending} testID="piece-ai" />
      </View>
      <View style={styles.actions}>
        <Button
          size="sm"
          variant="gold"
          icon="image-outline"
          title={isCover ? "This is the cover" : "Use as cover photo"}
          disabled={isCover || piece.photos.length === 0}
          loading={updateWebsite.isPending}
          onPress={() =>
            updateWebsite.mutate({ coverPieceId: piece.id }, { onSuccess: () => showToast("Cover photo set"), onError: (err) => showError(err, "Couldn't set the cover") })
          }
          testID="piece-cover"
        />
      </View>

      <Eyebrow tone="muted">Photos · {piece.photos.length} of {WEBSITE_LIMITS.photosPerPiece}</Eyebrow>
      <View style={styles.photoRow}>
        {piece.photos.map((photo) => (
          <View key={photo.id} style={styles.smallThumb}>
            <Image source={{ uri: photo.url }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
            {piece.photos.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove this photo"
                hitSlop={6}
                onPress={() => removePhoto.mutate(photo.id)}
                style={styles.removePhoto}
              >
                <Ionicons name="close" size={12} color={colors.ivory} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {piece.photos.length < WEBSITE_LIMITS.photosPerPiece ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Add a photo" onPress={() => void pickPhoto()} style={[styles.smallThumb, styles.smallAdd]}>
            {adding ? <ActivityIndicator color={colors.goldDark} /> : <Ionicons name="add" size={20} color={colors.goldDark} />}
          </Pressable>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Button size="sm" variant="secondary" icon="arrow-up" title="Move up" onPress={() => move(-1)} disabled={index <= 0 || reorder.isPending} />
        <Button size="sm" variant="secondary" icon="arrow-down" title="Move down" onPress={() => move(1)} disabled={index >= pieces.length - 1 || reorder.isPending} />
      </View>
      <Button size="sm" variant="danger" icon="trash-outline" title="Remove from website" onPress={onRemove} style={styles.start} testID="piece-remove" />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 4 },
  pressed: { opacity: 0.8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  grid: { gap: 10 },
  row: { flexDirection: "row", gap: 10 },
  cell: { flex: 1, minWidth: 0, gap: 4 },
  thumb: {
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.sand,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbSelected: { borderWidth: 2, borderColor: colors.gold },
  image: { width: "100%", height: "100%" },
  tick: { position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tickOn: { backgroundColor: colors.gold },
  tickOff: { borderWidth: 2, borderColor: colors.card, backgroundColor: "rgba(20, 33, 58, 0.35)" },
  coverBadge: { position: "absolute", left: 6, bottom: 6, backgroundColor: colors.navy, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  coverText: { fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1, color: colors.gold },
  tileLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16, color: colors.ink },
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
  addLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.goldDark, textAlign: "center" },
  selected: { gap: 12 },
  selectedTop: { flexDirection: "row", gap: 12, alignItems: "center" },
  selectedThumb: { width: 72, height: 90, borderRadius: radii.field, overflow: "hidden", backgroundColor: colors.sand },
  coverLine: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.goldDark },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  smallThumb: { width: 56, height: 56, borderRadius: 10, overflow: "hidden", backgroundColor: colors.sand },
  smallAdd: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.gold, alignItems: "center", justifyContent: "center", backgroundColor: colors.cardSoft },
  removePhoto: { position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(20, 33, 58, 0.75)", alignItems: "center", justifyContent: "center" },
  start: { alignSelf: "flex-start" },
});
