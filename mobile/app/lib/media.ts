// Picking a photo or video from the device library for a raw-body upload (PUT /posts/:id/media,
// PUT /clients/:id/orders/:orderId/photos): the permission check, the picker, and the MIME-type / size / length
// checks against the limits the API enforces. Every refusal is explained with a toast; the caller just gets null.
import * as ImagePicker from "expo-image-picker";
import { Alert, Linking, Platform } from "react-native";
import type { MediaKind } from "@shared/types";

import type { MediaFile } from "./api";
import { formatBytes, formatDuration } from "./format";
import { showError, showToast } from "./toast";

export interface MediaLimits {
  /** MIME types the API accepts for this kind, e.g. MEDIA_LIMITS.imageTypes or ORDER_PHOTO_LIMITS.types. */
  types: readonly string[];
  /** Largest file accepted, in bytes. */
  bytes: number;
  /** Videos only: the longest clip accepted, in seconds. */
  seconds?: number;
}

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
function resolveMimeType(asset: ImagePicker.ImagePickerAsset, kind: MediaKind, allowed: readonly string[]): string | null {
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

/**
 * Opens the camera roll for one photo (`kind: "image"`) or video and checks it against `limits`.
 * Resolves to the file ready for upload, or null when the user cancelled, access was refused, or the file was
 * rejected (the reason has already been shown).
 */
export async function pickMedia(kind: MediaKind, limits: MediaLimits): Promise<MediaFile | null> {
  if (!(await ensureLibraryAccess())) return null;

  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === "image" ? ["images"] : ["videos"],
      allowsEditing: false,
      quality: 0.85,
      exif: false,
      videoMaxDuration: kind === "video" ? limits.seconds : undefined,
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

  const mimeType = resolveMimeType(asset, kind, limits.types);
  if (!mimeType) {
    showToast(
      kind === "video" ? "That video format isn't supported" : "That photo format isn't supported",
      kind === "video" ? "Use an MP4 or MOV video." : "Use a JPEG, PNG or WebP photo.",
    );
    return null;
  }

  const durationSec = kind === "video" && typeof asset.duration === "number" ? asset.duration / 1000 : null;
  if (durationSec !== null && limits.seconds && durationSec > limits.seconds) {
    showToast(`Videos up to ${limits.seconds} seconds`, `This one is ${formatDuration(durationSec)}. Trim it in Photos and try again.`);
    return null;
  }

  const size = await fileSize(asset);
  if (size !== null && size > limits.bytes) {
    showToast(`${kind === "video" ? "Videos" : "Photos"} up to ${formatBytes(limits.bytes)}`, `This one is ${formatBytes(size)}.`);
    return null;
  }

  return {
    uri: asset.uri,
    mimeType,
    width: asset.width || null,
    height: asset.height || null,
    duration: durationSec,
    size,
  };
}
