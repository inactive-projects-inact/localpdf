// ---------------------------------------------------------------------------
// Canvas Render Protocol
// Shared protocol for all canvas-producing worker paths in this project.
// Extends thumbnail-worker-protocol.ts with an optional source tag.
// thumbnailRenderer.worker.ts requires ZERO changes — it speaks this protocol
// because ThumbnailRenderRequest is structurally identical to CanvasRenderRequest
// (source is optional and ignored by the worker).
// ---------------------------------------------------------------------------

export type {
  ThumbnailCancelRequest,
  ThumbnailCancelAllRequest,
  ThumbnailInboundMessage,
  ThumbnailResult,
  ThumbnailError,
  ThumbnailOutboundMessage,
} from "./thumbnail-worker-protocol";

export type { ThumbnailRenderRequest } from "./thumbnail-worker-protocol";

/**
 * Extended render request with an optional source tag for debugging.
 * Structurally compatible with ThumbnailRenderRequest — the worker ignores `source`.
 */
export type CanvasRenderRequest = {
  type: "THUMBNAIL_RENDER";
  jobId: number;
  /** Unique ID for this specific page request. Use crypto.randomUUID(). */
  requestId: string;
  /** Transferred ArrayBuffer of the PDF. Caller must slice before passing. */
  fileBytes: ArrayBuffer;
  /** 0-based page index. */
  pageIndex: number;
  /** Target width in px (hook computes scale from this). */
  targetWidth: number;
  /** Optional rotation in degrees added on top of the page's own rotation. */
  extraRotation?: number;
  /** Optional tag for debugging only — not sent to or used by the worker. */
  source?: "preview" | "thumbnail";
};
