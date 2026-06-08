// ---------------------------------------------------------------------------
// Thumbnail Worker Protocol
// Used by Organize PDF and Rotate PDF thumbnail generation ONLY.
// Does NOT redesign or extend the existing framework protocols.
// ---------------------------------------------------------------------------

// ─── Inbound ───────────────────────────────────────────────────────────────

/**
 * Request to render a single page thumbnail.
 * `fileBytes` must be transferred (zero-copy) by the caller.
 */
export type ThumbnailRenderRequest = {
  type: "THUMBNAIL_RENDER";
  jobId: number;
  /** Unique ID for this specific page request within a job. */
  requestId: string;
  /** Transferred ArrayBuffer of the PDF. */
  fileBytes: ArrayBuffer;
  /** 0-based page index. */
  pageIndex: number;
  /** Render scale for thumbnail (e.g. 150 / pageWidth). */
  targetWidth: number;
  /** Optional rotation to apply (degrees, in addition to page's own rotation). */
  extraRotation?: number;
};

export type ThumbnailCancelRequest = {
  type: "THUMBNAIL_CANCEL";
  /** Cancel all pending requests for this jobId. */
  jobId: number;
};

export type ThumbnailCancelAllRequest = {
  type: "THUMBNAIL_CANCEL_ALL";
};

export type ThumbnailInboundMessage =
  | ThumbnailRenderRequest
  | ThumbnailCancelRequest
  | ThumbnailCancelAllRequest;

// ─── Outbound ──────────────────────────────────────────────────────────────

/**
 * Successful thumbnail result. `bitmap` is transferred.
 * If OffscreenCanvas is not supported, `bitmap` will be null and
 * the main thread must fall back to its own rendering.
 */
export type ThumbnailResult = {
  type: "THUMBNAIL_RESULT";
  jobId: number;
  requestId: string;
  pageIndex: number;
  /** Transferred ImageBitmap. Null only when OffscreenCanvas is unsupported. */
  bitmap: ImageBitmap | null;
  /** Width of the rendered bitmap in px. */
  width: number;
  /** Height of the rendered bitmap in px. */
  height: number;
};

export type ThumbnailError = {
  type: "THUMBNAIL_ERROR";
  jobId: number;
  requestId: string;
  pageIndex: number;
  message: string;
};

export type ThumbnailOutboundMessage = ThumbnailResult | ThumbnailError;
