/**
 * Feature switches for the current release. Flip one to `true` to bring a screen back; the code
 * behind it stays in place either way (the route still exists, it is just not linked from the UI).
 */
export const FEATURES = {
  /** Local SEO (district keyword ideas + nearby tailor lookup). Hidden for v1; switch on later. */
  localSeo: false,
  /**
   * Photo / video attached to a post. Hidden for v1 because the API has no R2 bucket yet (see the
   * `[[r2_buckets]]` note in mobile/api/wrangler.toml). Switch on together with the bucket, and at the
   * same time: re-add the `expo-image-picker` plugin (with its `photosPermission` text) to app.json
   * `plugins`, and remove the READ_EXTERNAL_STORAGE / WRITE_EXTERNAL_STORAGE / READ_MEDIA_IMAGES /
   * READ_MEDIA_VIDEO entries from `android.blockedPermissions`. Both were taken out so v1 ships without
   * a photo-library permission for a feature users can't reach.
   */
  postMedia: false,
} as const;
