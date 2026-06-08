export type PdfPipelineTool = "pdf-to-markdown" | "flatten-pdf" | "resize-pdf" | "pdf-to-word" | "word-to-pdf";

export type PdfPipelinePhase = "reading" | "loading" | "analyzing" | "processing" | "saving" | "validating";

export type PdfPipelineErrorCode =
  | "cancelled"
  | "unsupported"
  | "encrypted"
  | "corrupted"
  | "empty-output"
  | "no-extractable-content"
  | "no-flattenable-fields"
  | "memory-risk"
  | "unknown";

export type PdfToMarkdownOptions = {
  headings: boolean;
  separators: boolean;
  lists: boolean;
  cleanWhitespace: boolean;
  startPage: number;
  endPage: number;
};

export type PdfResizeOptions = {
  mode: "all" | "single" | "range";
  singlePage: number;
  rangeStart: number;
  rangeEnd: number;
  pageSize: "A4" | "A3" | "A5" | "Letter" | "Legal" | "Tabloid" | "Custom";
  orientation: "portrait" | "landscape";
  customWidthMm?: number;
  customHeightMm?: number;
  scaleContent: boolean;
};

export type WordToPdfOptions = {
  pageSize: "A4" | "Letter" | "Legal";
  fontScale: "small" | "medium" | "large";
  marginSize: "narrow" | "normal" | "wide";
};

export type PdfPipelineTask =
  | {
      tool: "pdf-to-markdown";
      operation: "analyze";
      options: PdfToMarkdownOptions;
    }
  | {
      tool: "pdf-to-markdown";
      operation: "convert";
      options: PdfToMarkdownOptions;
    }
  | {
      tool: "flatten-pdf";
      operation: "analyze";
    }
  | {
      tool: "flatten-pdf";
      operation: "convert";
    }
  | {
      tool: "resize-pdf";
      operation: "convert";
      options: PdfResizeOptions;
    }
  | {
      tool: "pdf-to-word";
      operation: "analyze";
    }
  | {
      tool: "pdf-to-word";
      operation: "convert";
    }
  | {
      tool: "word-to-pdf";
      operation: "convert";
      options: WordToPdfOptions;
    };

export type PdfPipelineInput = {
  fileBytes: ArrayBuffer;
  fileName: string;
  fileSize: number;
};

export type PdfPipelineStartRequest = {
  type: "START";
  jobId: number;
  input: PdfPipelineInput;
  task: PdfPipelineTask;
};

export type PdfPipelineCancelRequest = {
  type: "CANCEL";
  jobId: number;
};

export type PdfPipelineRequest = PdfPipelineStartRequest | PdfPipelineCancelRequest;

export type PdfPipelineProgress = {
  type: "PROGRESS";
  jobId: number;
  phase: PdfPipelinePhase;
  percent: number;
  message: string;
  page?: {
    current: number;
    total: number;
  };
  unitsDone?: number;
  totalUnits?: number;
};

export type PdfPipelineMemoryWarning = {
  type: "MEMORY_WARNING";
  jobId: number;
  estimatedBytes: number;
  availableBytes: number | null;
  severity: "notice" | "warning";
};

export type PdfPipelineValidation = {
  minBytes: number;
  requireContent: boolean;
  contentUnits: number;
  contentDescription: "pages" | "text" | "cells" | "document-blocks" | "fields";
};

export type PdfPipelineTextOutput = {
  kind: "text";
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  byteLength: number;
  validation: PdfPipelineValidation;
};

export type PdfPipelineFileOutput = {
  kind: "file";
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  byteLength: number;
  validation: PdfPipelineValidation;
};

export type PdfToMarkdownAnalysisOutput = {
  kind: "pdf-to-markdown-analysis";
  filename: string;
  pageCount: number;
  textBased: boolean;
};

export type FlattenPdfAnalysisOutput = {
  kind: "flatten-pdf-analysis";
  filename: string;
  pageCount: number;
  fieldCount: number;
};

export type PdfToWordAnalysisOutput = {
  kind: "pdf-to-word-analysis";
  filename: string;
  pageCount: number;
};

export type PdfPipelineOutput =
  | PdfPipelineTextOutput
  | PdfPipelineFileOutput
  | PdfToMarkdownAnalysisOutput
  | FlattenPdfAnalysisOutput
  | PdfToWordAnalysisOutput;

export type PdfPipelineComplete = {
  type: "COMPLETE";
  jobId: number;
  output: PdfPipelineOutput;
};

export type PdfPipelineError = {
  type: "ERROR";
  jobId: number;
  code: PdfPipelineErrorCode;
  message: string;
  recoverable: boolean;
};

export type PdfPipelineCancelled = {
  type: "CANCELLED";
  jobId: number;
};

export type PdfPipelineResponse =
  | PdfPipelineProgress
  | PdfPipelineMemoryWarning
  | PdfPipelineComplete
  | PdfPipelineError
  | PdfPipelineCancelled;
