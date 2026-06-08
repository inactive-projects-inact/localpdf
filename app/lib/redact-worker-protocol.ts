// ---------------------------------------------------------------------------
// Redact PDF Worker Protocol
// ---------------------------------------------------------------------------
// This protocol is ONLY for the redact-pdf rendering pipeline.
// It does NOT redesign or extend the existing framework.
// ---------------------------------------------------------------------------

export type RedactBoxData = {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
};

export type RedactPageTask = {
  /** 0-based page index in the source PDF */
  pageIndex: number;
  boxes: RedactBoxData[];
};

// ─── Inbound ───────────────────────────────────────────────────────────────

export type RedactStartMessage = {
  type: "REDACT_START";
  jobId: number;
  /** Transferred ArrayBuffer of the original PDF bytes */
  fileBytes: ArrayBuffer;
  fileName: string;
  /** Only pages that need redaction. Pages absent from this list are copied. */
  pageTasks: RedactPageTask[];
  totalPages: number;
  redactionStyle: "black" | "white";
  showLabel: boolean;
};

export type RedactInboundMessage = RedactStartMessage;

// ─── Outbound ──────────────────────────────────────────────────────────────

export type RedactProgressMessage = {
  type: "REDACT_PROGRESS";
  jobId: number;
  /** 0–100 */
  percent: number;
  message: string;
  /** 0-based index of the page currently being processed */
  processingPage: number;
  pageStatus: "copying" | "redacting";
};

export type RedactPageDoneMessage = {
  type: "REDACT_PAGE_DONE";
  jobId: number;
  pageIndex: number;
  status: "copied" | "redacted";
};

export type RedactCompleteMessage = {
  type: "REDACT_COMPLETE";
  jobId: number;
  bytes: Uint8Array;
  byteLength: number;
  redactedPageCount: number;
  totalPageCount: number;
};

export type RedactErrorMessage = {
  type: "REDACT_ERROR";
  jobId: number;
  message: string;
};

export type RedactOutboundMessage =
  | RedactProgressMessage
  | RedactPageDoneMessage
  | RedactCompleteMessage
  | RedactErrorMessage;
