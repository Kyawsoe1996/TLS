// Tiny error/notice helpers. Alerts are the "toast" for now — swap for a banner later without touching callers.
import { isClerkAPIResponseError } from "@clerk/clerk-expo";
import { Alert } from "react-native";

import { isApiClientError } from "./api";

const FALLBACK = "Something went wrong. Please try again.";

/** Human-readable message for any thrown value (API errors, Clerk errors, plain Errors). */
export function errorMessage(err: unknown, fallback: string = FALLBACK): string {
  if (!err) return fallback;
  if (isApiClientError(err)) return err.message || fallback;
  if (isClerkAPIResponseError(err)) {
    const first = err.errors?.[0];
    return first?.longMessage || first?.message || err.message || fallback;
  }
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err;
  return fallback;
}

/** Alert with a friendly message derived from `err`. */
export function showError(err: unknown, title: string = "Something went wrong"): void {
  Alert.alert(title, errorMessage(err));
}

/** Simple notice (e.g. "Saved"). */
export function showToast(title: string, message?: string): void {
  Alert.alert(title, message);
}

/** Confirmation dialog as a promise. Resolves true when the user confirms. */
export function confirm(options: {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const { title, message, confirmText = "Confirm", cancelText = "Cancel", destructive = false } = options;
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: "cancel", onPress: () => resolve(false) },
        { text: confirmText, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
