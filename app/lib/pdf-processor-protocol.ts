import type { TextAlignment, TextFontFamily, TextMarginPreset, TextPageSize } from "./text-to-pdf";
import type { NumberColorKey, NumberFormat, NumberPosition } from "./pdf-page-numbers";

export type ProcessorTool = "split" | "rotate" | "crop" | "organize" | "text-to-pdf" | "page-numbers";

export interface SplitOptions {
  mode: "range" | "all";
  startPage?: number;
  endPage?: number;
  filename: string;
}

export interface RotateOptions {
  mode: "single" | "all";
  page?: number;
  angle: number;
}

export interface CropOptions {
  mode: "single" | "range" | "all";
  singlePage?: number;
  rangeStart?: number;
  rangeEnd?: number;
  margins: { top: number; bottom: number; left: number; right: number };
}

export interface OrganizePageEntry {
  originalIndex: number | null; // null means blank page
  rotation: number;
}

export interface OrganizeOptions {
  pages: OrganizePageEntry[];
}

export interface TextToPdfOptions {
  text: string;
  fontFamily: TextFontFamily;
  fontSize: number;
  pageSize: TextPageSize;
  margin: TextMarginPreset;
  alignment: TextAlignment;
  colorKey: string;
}

export interface PageNumbersOptions {
  position: NumberPosition;
  format: NumberFormat;
  startNumber: number;
  fontSize: number;
  colorKey: NumberColorKey;
  marginPreset: "small" | "medium" | "large";
  skipFirstPage: boolean;
  useCustomRange: boolean;
  rangeStart: number;
  rangeEnd: number;
}

export type ProcessorTaskOptions =
  | { tool: "split"; options: SplitOptions }
  | { tool: "rotate"; options: RotateOptions }
  | { tool: "crop"; options: CropOptions }
  | { tool: "organize"; options: OrganizeOptions }
  | { tool: "text-to-pdf"; options: TextToPdfOptions }
  | { tool: "page-numbers"; options: PageNumbersOptions };

export interface StartProcessorMessage {
  type: "START_PROCESS";
  /** Monotonically increasing ID so the hook can discard stale COMPLETE messages. */
  jobId: number;
  fileBytes: ArrayBuffer;
  task: ProcessorTaskOptions;
}

export interface CancelProcessorMessage {
  type: "CANCEL_PROCESS";
}

export type ProcessorInboundMessage = StartProcessorMessage | CancelProcessorMessage;

export interface ProcessorProgressMessage {
  type: "PROGRESS";
  jobId: number;
  percent: number;
  message?: string;
}

export interface ProcessorErrorMessage {
  type: "ERROR";
  jobId: number;
  error: string;
}

export interface ProcessorCompleteMessage {
  type: "COMPLETE";
  jobId: number;
  result: Uint8Array; // Could be PDF bytes or ZIP bytes (for split all)
  isZip: boolean;
}

export type ProcessorOutboundMessage =
  | ProcessorProgressMessage
  | ProcessorErrorMessage
  | ProcessorCompleteMessage;
