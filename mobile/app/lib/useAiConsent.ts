// One-time permission before the first AI feature is used (App Store guideline 5.1.2(i): disclose sharing
// personal data with a third-party AI and get explicit permission first). The AI routes send client details
// to Google Gemini, so the app asks once per shop and the API records the answer (POST /shop/ai-consent);
// /ai/* answers 403 consent_required until then.
import { useCallback } from "react";

import { useApi } from "./api";
import { confirm, showError } from "./toast";
import { useSetShop, useShop } from "./useShop";

export const AI_CONSENT_TITLE = "Use AI with Google Gemini?";

export const AI_CONSENT_MESSAGE =
  "Magick TLS writes fitting notes, posts and emails with Google Gemini. To do that it sends Google the details " +
  "involved: the client's first name, measurements, style, fabric and posture note for a fitting; the client's " +
  "first name, last order and your offer for a win-back email; your shop's name, district, tone and topic for a " +
  "post. Google processes them under the Gemini API terms and does not get your clients' contact details.\n\n" +
  "Nothing is sent until you tap Continue. You can read more under Settings → Privacy.";

/**
 * Returns `ensureAiConsent()`: resolves true when the owner has agreed (now or earlier), false if they tapped
 * "Not now". Call it before every AI request: `if (await ensureAiConsent()) mutation.mutate(...)`.
 */
export function useAiConsent() {
  const api = useApi();
  const shop = useShop().data ?? null;
  const setShop = useSetShop();
  const consented = !!shop?.aiConsentAt;

  return useCallback(async (): Promise<boolean> => {
    if (consented) return true;
    const ok = await confirm({
      title: AI_CONSENT_TITLE,
      message: AI_CONSENT_MESSAGE,
      confirmText: "Continue",
      cancelText: "Not now",
    });
    if (!ok) return false;
    try {
      setShop(await api.recordAiConsent());
      return true;
    } catch (err) {
      showError(err, "Couldn't save your choice");
      return false;
    }
  }, [api, consented, setShop]);
}
