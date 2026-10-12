/**
 * Feature switches for the current release, shared by the app and the API. Flip one to `true` to
 * bring a feature back; the code behind it stays in place either way (the screen is just not linked
 * from the UI, and the API route answers 404 while it is off).
 */
export const FEATURES = {
  /**
   * Local SEO (district keyword ideas + nearby tailor lookup via Gemini's Google Maps grounding).
   * Hidden for v1, coming back in a later release. Off: the Grow hub and Home don't link to it, the
   * screen redirects to Grow if deep-linked, and POST /ai/seo returns 404.
   */
  localSeo: false,
  /**
   * Photo / video attached to a post, stored by the API in the company's Amazon S3 bucket (the S3_* settings
   * in mobile/api). If it ever has to be hidden again, also take the `expo-image-picker` plugin (and its
   * `photosPermission` text) out of app.json `plugins` and put READ_EXTERNAL_STORAGE / WRITE_EXTERNAL_STORAGE /
   * READ_MEDIA_IMAGES / READ_MEDIA_VIDEO back into `android.blockedPermissions`, so the app doesn't ask for a
   * photo-library permission it can't use.
   */
  postMedia: true,
} as const;
