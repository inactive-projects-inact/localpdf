/**
 * Google AdSense publisher client ID (format: ca-pub-XXXXXXXXXXXXXXXX).
 * Override via NEXT_PUBLIC_ADSENSE_CLIENT_ID in production deployments.
 */
export const ADSENSE_CLIENT_ID =
  process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? "ca-pub-XXXXXXXXXXXXXXXX";

/** Numeric publisher ID used by Google Privacy & Messaging (Funding Choices). */
export const ADSENSE_PUBLISHER_NUM = ADSENSE_CLIENT_ID.replace(/^ca-pub-/, "");
