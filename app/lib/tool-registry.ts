export type ToolId =
  | "compress"
  | "merge"
  | "split"
  | "rotate"
  | "textToPdf"
  | "resize"
  | "pageNumbers"
  | "crop"
  | "jpg2pdf"
  | "pdf2jpg"
  | "watermark"
  | "redact"
  | "signature"
  | "pdfToWord"
  | "wordToPdf"
  | "pdfToExcel"
  | "excelToPdf"
  | "protect"
  | "unlock"
  | "ocr"
  | "organize";

export type AcceptMap = Record<string, string[]>;

export interface ToolDefinition {
  id: ToolId;
  label: string;
  shortLabel: string;
  route: string;
  homeDescription: string;
  homeGroup: "quick" | "everyday" | "power";
  accentClass: string;
  input: {
    kind: "pdf" | "image";
    accept: AcceptMap;
    acceptAttribute: string;
    label: string;
    browseLabel: string;
    emptyTitle: string;
    dragActiveTitle: string;
    readySingular: string;
    readyPlural: string;
    helperText: string;
    invalidMessage: string;
    maxSizeBytes: number;
    multiple: boolean;
    maxFiles?: number;
  };
}

const MB = 1024 * 1024;

export const PDF_ACCEPT: AcceptMap = {
  "application/pdf": [".pdf"],
};

export const IMAGE_ACCEPT: AcceptMap = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

const PDF_INPUT = {
  kind: "pdf",
  accept: PDF_ACCEPT,
  acceptAttribute: "application/pdf,.pdf",
  emptyTitle: "Drag & drop a PDF file",
  dragActiveTitle: "Drop your PDF here",
  readySingular: "PDF ready",
  readyPlural: "PDFs ready",
  helperText: "PDF only, processed locally",
  invalidMessage: "Please select a valid PDF file.",
  maxSizeBytes: 500 * MB,
} as const;

export const toolRegistry = {
  compress: {
    id: "compress",
    label: "Compress PDF",
    shortLabel: "Compress",
    route: "/compress",
    homeDescription: "Reduce PDF file size while preserving visual quality — all processed locally in your browser.",
    homeGroup: "everyday",
    accentClass: "text-compress-color",
    input: {
      kind: "pdf",
      accept: { "application/pdf": [".pdf"] },
      acceptAttribute: "application/pdf,.pdf",
      maxSizeBytes: 100 * 1024 * 1024,
      multiple: false,
      label: "Select a PDF to compress",
      browseLabel: "Browse files",
      emptyTitle: "Drop a PDF here",
      dragActiveTitle: "Drop to compress",
      readySingular: "1 file ready",
      readyPlural: "{count} files selected",
      helperText: "Up to 100MB · Processed entirely in your browser",
      invalidMessage: "Please select a valid PDF file",
    },
  },
  merge: {
    id: "merge",
    label: "Merge",
    shortLabel: "Merge",
    route: "/merge",
    homeDescription: "Combine PDFs into one",
    homeGroup: "quick",
    accentClass: "tile-lp__icon-wrap--purple",
    input: {
      ...PDF_INPUT,
      label: "PDF files",
      browseLabel: "Browse files",
      emptyTitle: "Drag & drop PDF files",
      dragActiveTitle: "Drop your PDFs here",
      readySingular: "PDF ready",
      readyPlural: "PDFs ready",
      helperText: "Add at least 2 PDFs to merge. Files stay on your device.",
      multiple: true,
    },
  },
  split: {
    id: "split",
    label: "Split",
    shortLabel: "Split",
    route: "/split",
    homeDescription: "Extract or divide pages",
    homeGroup: "quick",
    accentClass: "tile-lp__icon-wrap--blue",
    input: {
      ...PDF_INPUT,
      label: "PDF file",
      browseLabel: "Browse file",
      helperText: "One PDF at a time. Files stay on your device.",
      multiple: false,
      maxFiles: 1,
    },
  },
  rotate: {
    id: "rotate",
    label: "Rotate",
    shortLabel: "Turn",
    route: "/rotate",
    homeDescription: "Rotate pages 90°, 180°, or 270°",
    homeGroup: "quick",
    accentClass: "tile-lp__icon-wrap--emerald",
    input: {
      ...PDF_INPUT,
      label: "PDF file",
      browseLabel: "Browse file",
      emptyTitle: "Drag & drop a PDF to rotate",
      dragActiveTitle: "Drop your PDF to rotate",
      readySingular: "PDF ready to rotate",
      readyPlural: "PDFs ready to rotate",
      helperText: "One PDF at a time. Files stay on your device.",
      multiple: false,
      maxFiles: 1,
    },
  },
  textToPdf: {
    id: "textToPdf",
    label: "Text->PDF",
    shortLabel: "Txt",
    route: "/text-to-pdf",
    homeDescription: "Turn text into a PDF document",
    homeGroup: "everyday",
    accentClass: "tile-lp__icon-wrap--indigo",
    input: {
      ...PDF_INPUT,
      label: "Text",
      browseLabel: "Open tool",
      emptyTitle: "Open Text to PDF to type or paste",
      dragActiveTitle: "Text to PDF",
      readySingular: "Ready to convert",
      readyPlural: "Ready to convert",
      helperText: "No file upload — type text in the tool.",
      invalidMessage: "Use the Text to PDF tool directly.",
      multiple: false,
      maxFiles: 1,
    },
  },
  resize: {
    id: "resize",
    label: "Resize",
    shortLabel: "Size",
    route: "/resize",
    homeDescription: "Change PDF page dimensions",
    homeGroup: "power",
    accentClass: "tile-lp__icon-wrap--sky",
    input: {
      ...PDF_INPUT,
      label: "PDF file",
      browseLabel: "Browse file",
      emptyTitle: "Drag & drop a PDF to resize",
      dragActiveTitle: "Drop your PDF to resize",
      readySingular: "PDF ready to resize",
      readyPlural: "PDFs ready to resize",
      helperText: "One PDF at a time. Files stay on your device.",
      multiple: false,
      maxFiles: 1,
    },
  },
  pageNumbers: {
    id: "pageNumbers",
    label: "Page Numbers",
    shortLabel: "#",
    route: "/page-numbers",
    homeDescription: "Add page numbers to your PDF",
    homeGroup: "power",
    accentClass: "tile-lp__icon-wrap--red",
    input: {
      ...PDF_INPUT,
      label: "PDF file",
      browseLabel: "Browse file",
      emptyTitle: "Drag & drop a PDF for page numbers",
      dragActiveTitle: "Drop your PDF here",
      readySingular: "PDF ready",
      readyPlural: "PDFs ready",
      helperText: "One PDF at a time. Files stay on your device.",
      multiple: false,
      maxFiles: 1,
    },
  },
  crop: {
    id: "crop",
    label: "Crop",
    shortLabel: "Crop",
    route: "/crop",
    homeDescription: "Crop margins from PDF pages",
    homeGroup: "power",
    accentClass: "tile-lp__icon-wrap--amber",
    input: {
      ...PDF_INPUT,
      label: "PDF file",
      browseLabel: "Browse file",
      emptyTitle: "Drag & drop a PDF to crop",
      dragActiveTitle: "Drop your PDF to crop",
      readySingular: "PDF ready to crop",
      readyPlural: "PDFs ready to crop",
      helperText: "One PDF at a time. Files stay on your device.",
      multiple: false,
      maxFiles: 1,
    },
  },
  jpg2pdf: {
    id: "jpg2pdf",
    label: "JPG->PDF",
    shortLabel: "J->P",
    route: "/jpg-to-pdf",
    homeDescription: "Images to PDF document",
    homeGroup: "everyday",
    accentClass: "tile-lp__icon-wrap--orange",
    input: {
      kind: "image",
      accept: IMAGE_ACCEPT,
      acceptAttribute: "image/jpeg,image/png,.jpg,.jpeg,.png",
      label: "Image files",
      browseLabel: "Browse files",
      emptyTitle: "Drag & drop JPG or PNG files",
      dragActiveTitle: "Drop your images here",
      readySingular: "Image ready",
      readyPlural: "Images ready",
      helperText: "JPEG and PNG only",
      invalidMessage: "Only JPEG and PNG images are accepted.",
      maxSizeBytes: 50 * MB,
      multiple: true,
    },
  },
  pdf2jpg: {
    id: "pdf2jpg",
    label: "PDF->JPG",
    shortLabel: "P->J",
    route: "/pdf-to-jpg",
    homeDescription: "Export pages as images",
    homeGroup: "everyday",
    accentClass: "tile-lp__icon-wrap--teal",
    input: {
      ...PDF_INPUT,
      label: "PDF file",
      browseLabel: "Browse file",
      multiple: false,
      maxFiles: 1,
    },
  },
  watermark: {
    id: "watermark",
    label: "Watermark",
    shortLabel: "Mark",
    route: "/watermark",
    homeDescription: "Stamp text or logos",
    homeGroup: "power",
    accentClass: "tile-lp__icon-wrap--blue",
    input: {
      ...PDF_INPUT,
      label: "PDF file",
      browseLabel: "Browse file",
      emptyTitle: "Drag & drop a PDF to watermark",
      dragActiveTitle: "Drop your PDF to watermark",
      readySingular: "PDF ready for watermarking",
      readyPlural: "PDFs ready for watermarking",
      helperText: "Choose a PDF first, then add text or image watermark options.",
      multiple: false,
      maxFiles: 1,
    },
  },
  redact: {
    id: "redact",
    label: "Redact",
    shortLabel: "Redact",
    route: "/redact",
    homeDescription: "Permanently remove sensitive information",
    homeGroup: "power",
    accentClass: "tile-lp__icon-wrap--red",
    input: {
      ...PDF_INPUT,
      label: "PDF file",
      browseLabel: "Browse file",
      emptyTitle: "Drag & drop a PDF to redact",
      dragActiveTitle: "Drop your PDF here",
      readySingular: "PDF ready to redact",
      readyPlural: "PDFs ready to redact",
      helperText: "Redactions are permanent. Files stay on your device.",
      multiple: false,
      maxFiles: 1,
    },
  },
  signature: {
    id: "signature",
    label: "Signature",
    shortLabel: "Sign",
    route: "/signature",
    homeDescription: "Sign documents digitally",
    homeGroup: "power",
    accentClass: "tile-lp__icon-wrap--amber",
    input: {
      ...PDF_INPUT,
      label: "PDF file",
      browseLabel: "Browse file",
      emptyTitle: "Drag & drop a PDF to sign",
      dragActiveTitle: "Drop your PDF to sign",
      readySingular: "PDF ready for signing",
      readyPlural: "PDFs ready for signing",
      helperText: "Choose a PDF first, then draw, type, or upload a signature.",
      multiple: false,
      maxFiles: 1,
    },
  },
  pdfToWord: {
    id: "pdfToWord",
    label: "PDF to Word",
    shortLabel: "→Doc",
    route: "/pdf-to-word",
    homeDescription: "Convert PDF to editable Word document",
    homeGroup: "everyday",
    accentClass: "tile-lp__icon-wrap--sky",
    input: {
      ...PDF_INPUT,
      label: "PDF file",
      browseLabel: "Browse PDF",
      emptyTitle: "Drag & drop a PDF to convert",
      dragActiveTitle: "Drop your PDF here",
      readySingular: "PDF ready to convert",
      readyPlural: "PDFs ready to convert",
      helperText: "PDF only, processed locally in the browser.",
      multiple: false,
      maxFiles: 1,
    },
  },
  wordToPdf: {
    id: "wordToPdf",
    label: "Word to PDF",
    shortLabel: "→PDF",
    route: "/word-to-pdf",
    homeDescription: "Convert Word documents to PDF",
    homeGroup: "everyday",
    accentClass: "tile-lp__icon-wrap--indigo",
    input: {
      kind: "pdf",
      accept: { "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"] },
      acceptAttribute: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      label: "Word file",
      browseLabel: "Browse .docx",
      emptyTitle: "Drag & drop a .docx file",
      dragActiveTitle: "Drop your Word file here",
      readySingular: "Word file ready",
      readyPlural: "Word files ready",
      helperText: ".docx only, processed locally in the browser.",
      invalidMessage: "Please select a valid .docx file.",
      maxSizeBytes: 50 * MB,
      multiple: false,
      maxFiles: 1,
    },
  },
  pdfToExcel: {
    id: "pdfToExcel",
    label: "PDF to Excel",
    shortLabel: "→XLS",
    route: "/pdf-to-excel",
    homeDescription: "Extract tables from PDF to spreadsheet",
    homeGroup: "everyday",
    accentClass: "tile-lp__icon-wrap--emerald",
    input: {
      ...PDF_INPUT,
      label: "PDF file",
      browseLabel: "Browse PDF",
      emptyTitle: "Drag & drop a PDF to extract data",
      dragActiveTitle: "Drop your PDF here",
      readySingular: "PDF ready to extract",
      readyPlural: "PDFs ready to extract",
      helperText: "PDF only, processed locally in the browser.",
      multiple: false,
      maxFiles: 1,
    },
  },
  excelToPdf: {
    id: "excelToPdf",
    label: "Excel to PDF",
    shortLabel: "→PDF",
    route: "/excel-to-pdf",
    homeDescription: "Convert spreadsheets to formatted PDF",
    homeGroup: "everyday",
    accentClass: "tile-lp__icon-wrap--amber",
    input: {
      kind: "pdf",
      accept: {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
        "application/vnd.ms-excel": [".xls"],
      },
      acceptAttribute: ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel",
      label: "Excel file",
      browseLabel: "Browse .xlsx/.xls",
      emptyTitle: "Drag & drop an Excel file",
      dragActiveTitle: "Drop your Excel file here",
      readySingular: "Spreadsheet ready",
      readyPlural: "Spreadsheets ready",
      helperText: ".xlsx and .xls supported, processed locally.",
      invalidMessage: "Please select a valid .xlsx or .xls file.",
      maxSizeBytes: 50 * MB,
      multiple: false,
      maxFiles: 1,
    },
  },
  protect: {
    id: "protect",
    label: "Protect PDF",
    shortLabel: "Lock",
    route: "/protect",
    homeDescription: "Password-protect your PDF instantly",
    homeGroup: "power",
    accentClass: "tile-lp__icon-wrap--red",
    input: {
      ...PDF_INPUT,
      label: "PDF file",
      browseLabel: "Browse PDF",
      emptyTitle: "Drag & drop a PDF to protect",
      dragActiveTitle: "Drop your PDF here",
      readySingular: "PDF ready to protect",
      readyPlural: "PDFs ready to protect",
      helperText: "PDF only, encryption happens locally.",
      multiple: false,
      maxFiles: 1,
    },
  },
  unlock: {
    id: "unlock",
    label: "Unlock PDF",
    shortLabel: "Unlock",
    route: "/unlock",
    homeDescription: "Remove password protection from your PDF",
    homeGroup: "power",
    accentClass: "tile-lp__icon-wrap--emerald",
    input: {
      ...PDF_INPUT,
      label: "PDF file",
      browseLabel: "Browse PDF",
      emptyTitle: "Drag & drop a protected PDF",
      dragActiveTitle: "Drop your PDF here",
      readySingular: "PDF ready to unlock",
      readyPlural: "PDFs ready to unlock",
      helperText: "PDF only, decryption happens locally.",
      multiple: false,
      maxFiles: 1,
    },
  },
  ocr: {
    id: "ocr",
    label: "OCR PDF",
    shortLabel: "OCR",
    route: "/ocr",
    homeDescription: "Make scanned PDFs searchable",
    homeGroup: "power",
    accentClass: "tile-lp__icon-wrap--indigo",
    input: {
      ...PDF_INPUT,
      label: "PDF file",
      browseLabel: "Browse PDF",
      emptyTitle: "Drag & drop a scanned PDF",
      dragActiveTitle: "Drop your PDF here",
      readySingular: "PDF ready for OCR",
      readyPlural: "PDFs ready for OCR",
      helperText: "PDF only, OCR runs locally in the browser.",
      multiple: false,
      maxFiles: 1,
    },
  },
  organize: {
    id: "organize",
    label: "Organize PDF",
    shortLabel: "Org",
    route: "/organize",
    homeDescription: "Reorder, delete and rotate pages visually",
    homeGroup: "power",
    accentClass: "tile-lp__icon-wrap--sky",
    input: {
      ...PDF_INPUT,
      label: "PDF file",
      browseLabel: "Browse PDF",
      emptyTitle: "Drag & drop a PDF to organize",
      dragActiveTitle: "Drop your PDF here",
      readySingular: "PDF ready to organize",
      readyPlural: "PDFs ready to organize",
      helperText: "PDF only, all editing happens locally.",
      multiple: false,
      maxFiles: 1,
    },
  },
} as const satisfies Record<ToolId, ToolDefinition>;

export const orderedHomeTools = [
  toolRegistry.compress,
  toolRegistry.merge,
  toolRegistry.split,
  toolRegistry.rotate,
  toolRegistry.jpg2pdf,
  toolRegistry.pdf2jpg,
  toolRegistry.watermark,
  toolRegistry.signature,
] as const;

export const homeToolRoutes = Object.fromEntries(
  orderedHomeTools.map((tool) => [tool.id, tool.route]),
) as Record<ToolId, string>;

export function getToolDefinition(toolId: ToolId): ToolDefinition {
  return toolRegistry[toolId];
}

function fileExtension(fileName: string) {
  const match = /\.[^.]+$/.exec(fileName.toLowerCase());
  return match?.[0] ?? "";
}

export function isFileAcceptedByTool(file: File | null | undefined, toolId: ToolId): boolean {
  if (typeof File === "undefined" || !(file instanceof File) || file.size <= 0) {
    return false;
  }

  const { accept } = getToolDefinition(toolId).input;
  const type = file.type.toLowerCase();
  const extension = fileExtension(file.name);

  return Object.entries(accept).some(([mimeType, extensions]) => {
    const mimeMatches = type !== "" && type === mimeType.toLowerCase();
    const extensionMatches = extensions.map((ext) => ext.toLowerCase()).includes(extension);
    return mimeMatches || extensionMatches;
  });
}

export async function hasPdfHeader(file: File): Promise<boolean> {
  try {
    const header = await file.slice(0, 5).text();
    return header.startsWith("%PDF-");
  } catch {
    return false;
  }
}

export async function validateFilesForTool(files: File[], toolId: ToolId): Promise<File[]> {
  const tool = getToolDefinition(toolId);
  const limitedFiles = tool.input.multiple ? files : files.slice(0, 1);
  const maxFiles = tool.input.maxFiles ? limitedFiles.slice(0, tool.input.maxFiles) : limitedFiles;
  const validFiles: File[] = [];

  for (const file of maxFiles) {
    if (file.size > tool.input.maxSizeBytes) continue;
    if (!isFileAcceptedByTool(file, toolId)) continue;
    if (tool.input.kind === "pdf" && !(await hasPdfHeader(file))) continue;
    validFiles.push(file);
  }

  return validFiles;
}
