/**
 * workers/compressPdf.worker.ts
 *
 * Web Worker that owns the full lifecycle of a PDF compression job:
 * 1. Lazily initialises the pdfcpu and Ghostscript WASM modules (cached)
 * 2. Executes a Preflight analysis check to catch encryption and decompression bombs
 * 3. Enforces safety downgrades or routes to the core Ghostscript compression engine
 * 4. Applies the "Do No Harm" size guard before replying
 * 5. Transfers the result buffer back without copying
 *
 * ─── WHY THIS RUNS IN A WORKER ───────────────────────────────────────────────
 *
 * Ghostscript and pdfcpu processing is entirely synchronous from JavaScript's
 * perspective — blocking the event loop for the full duration of execution.
 * Running it on the main thread would freeze the entire UI. The worker's 
 * isolated thread ensures the UI remains responsive throughout.
 */

/// <reference lib="webworker" />

// ---------------------------------------------------------------------------
// Webpack 5 scope shim
//
// Webpack (and Turbopack) bundle Workers in a closed module scope. Some
// Emscripten builds reference a global `createModule` symbol at startup.
// If Webpack tree-shakes or renames it, the runtime crashes with
// "createModule is not defined" before our config object is even inspected.
// This no-op fallback ensures the symbol exists so Emscripten's lookup
// succeeds; our explicit moduleConfig object then overrides the real
// behaviour immediately after.
// ---------------------------------------------------------------------------
if (typeof (globalThis as any).createModule === "undefined") {
  (globalThis as any).createModule = function(m: any) { return m || {}; };
}

// Lazy imports pointing directly to ESM entries
import gsModuleFactory from "@jspawn/ghostscript-wasm/gs.mjs";
import { executeWasmCompression } from "../app/lib/wasm-compress-executor";
import {
  analyzePdfPreflight,
  PREFLIGHT_PIXEL_CAP,
  type PdfPreflightMetadata,
} from "../app/lib/wasm-pdfcpu-executor";
import type {
  MainToCompressWorkerMessage,
  CompressWorkerToMainMessage,
  CompressErrorCode,
} from "../app/lib/compress-worker-protocol";
import { TIER_CONFIG_MAP } from "../app/lib/compress-worker-protocol";

// To be replaced with your actual pdfcpu ESM wrapper asset path when ready
// e.g., import pdfcpuModuleFactory from "@vendor/pdfcpu-wasm/pdfcpu.mjs";
const pdfcpuModuleFactory: any = null; 

// ---------------------------------------------------------------------------
// Module-level WASM instance caches
// ---------------------------------------------------------------------------

let gsModuleCache: any | null = null;
let pdfcpuModuleCache: any | null = null;

// ---------------------------------------------------------------------------
// WASM initialisation wrappers
// ---------------------------------------------------------------------------

async function getOrInitGsModule(): Promise<any> {
  if (gsModuleCache !== null) return gsModuleCache;

  return new Promise<any>((resolve, reject) => {
    // Standard Emscripten builds look for a module declaration context.
    // We explicitly define a self-contained environment configuration object.
    const moduleConfig: any = {
      locateFile: (filename: string) => {
        const primaryUrl = new URL(`../node_modules/@jspawn/ghostscript-wasm/${filename}`, import.meta.url).href;
        if (primaryUrl.includes("blob:") || !primaryUrl.startsWith("http")) {
          return `/assets/wasm/${filename}`;
        }
        return primaryUrl;
      },
      onRuntimeInitialized: function(this: any) {
        // Cache the fully initialized Emscripten WASM instance context
        gsModuleCache = moduleConfig;
        resolve(moduleConfig);
      },
      onAbort(what: string) {
        // Force immediate memory leak prevention by dropping stale references
        gsModuleCache = null;
        
        // Bubble up a typed systemic failure notice to the React main thread layout
        (self as any).postMessage({
          type: "COMPRESS_ERROR",
          jobId: 0, // Master broadcast ID or global error capture hook
          code: "ERR_OUT_OF_MEMORY",
          detail: `WASM Memory Execution Aborted: ${what}. The browser linear heap allocation limit was exceeded.`
        });
      }
    };

    // Invoke the factory factory passing our configuration.
    // If gsModuleFactory returns a module-bound function directly, passing moduleConfig
    // ensures it mutates our local instance object rather than looking for a global 'createModule'.
    try {
      const result = gsModuleFactory(moduleConfig);
      
      // If the specific jspawn wrapper returns a Promise that yields the module instance instead:
      if (result && typeof result.then === 'function') {
        result.then((initializedModule: any) => {
          gsModuleCache = initializedModule;
          resolve(initializedModule);
        }).catch((err: unknown) => {
          reject(err);
        });
      }
    } catch (err: unknown) {
      reject(
        new WasmInitError(
          `Ghostscript WASM factory initialization crashed: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      );
    }
  });
}

async function getOrInitPdfcpuModule(): Promise<any> {
  if (pdfcpuModuleCache !== null) return pdfcpuModuleCache;
  if (!pdfcpuModuleFactory) {
    return null;
  }

  return new Promise<any>((resolve, reject) => {
    try {
      const result = pdfcpuModuleFactory({
        onRuntimeInitialized(this: any) {
          pdfcpuModuleCache = this;
          resolve(this);
        },
      });
      // Guard against factories that return a Promise rather than
      // resolving via onRuntimeInitialized.
      if (result && typeof result.then === "function") {
        result
          .then((initializedModule: any) => {
            pdfcpuModuleCache = initializedModule;
            resolve(initializedModule);
          })
          .catch((err: unknown) => {
            reject(new WasmInitError(`pdfcpu WASM initialization failed: ${err instanceof Error ? err.message : String(err)}`));
          });
      }
    } catch (err: unknown) {
      reject(new WasmInitError(`pdfcpu WASM factory initialization crashed: ${err instanceof Error ? err.message : String(err)}`));
    }
  });
}

class WasmInitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WasmInitError";
  }
}

// ---------------------------------------------------------------------------
// Error Classification
// ---------------------------------------------------------------------------

function classifyError(err: unknown): CompressErrorCode {
  if (err instanceof WasmInitError) return "ERR_WASM_INIT_FAILED";
  
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

  if (message.includes("out of memory") || message.includes("cannot enlarge memory") || message.includes("allocation failed")) {
    return "ERR_OUT_OF_MEMORY";
  }
  if (message.includes("encrypted") || message.includes("password") || message.includes("access denied")) {
    return "ERR_ENCRYPTED_PDF";
  }
  if (message.includes("invalid pdf") || message.includes("syntax error") || message.includes("can't open input file")) {
    return "ERR_INVALID_PDF";
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "ERR_PIPELINE_TIMEOUT";
  }
  return "ERR_UNKNOWN";
}

// ---------------------------------------------------------------------------
// Messaging Utilities
// ---------------------------------------------------------------------------

function postTyped(message: CompressWorkerToMainMessage, transfer?: Transferable[]): void {
  if (transfer !== undefined) {
    (self as DedicatedWorkerGlobalScope).postMessage(message, transfer);
  } else {
    (self as DedicatedWorkerGlobalScope).postMessage(message);
  }
}

// ---------------------------------------------------------------------------
// Core Execution Handoff
// ---------------------------------------------------------------------------

async function handleStartCompress(
  jobId: number,
  fileBytes: ArrayBuffer,
  options: import("../app/lib/compress-worker-protocol").CompressOptions,
): Promise<void> {
  const originalByteCount = fileBytes.byteLength;

  try {
    // ── STAGE 1: BOOT ENGINES ───────────────────────────────────────────────
    postTyped({
      type: "COMPRESS_PROGRESS",
      jobId,
      percent: 0,
      message: "Initialising engines…",
    });

    const gsModule = await getOrInitGsModule();
    const pdfcpuModule = await getOrInitPdfcpuModule();

    // ── STAGE 2: PREFLIGHT RISK ANALYSIS ────────────────────────────────────
    let preflight: PdfPreflightMetadata = {
      pageCount: 0,
      maxPixels: 0,
      isEncrypted: false,
      isVectorHeavy: false,
      originalBytes: originalByteCount,
    };

    if (pdfcpuModule) {
      postTyped({
        type: "COMPRESS_PROGRESS",
        jobId,
        percent: 10,
        message: "Running preflight structural audit…",
      });

      preflight = await analyzePdfPreflight(pdfcpuModule, fileBytes);
    } else {
      postTyped({
        type: "COMPRESS_PROGRESS",
        jobId,
        percent: 10,
        message: "Preflight checks unavailable in this build. Continuing with core compression only…",
      });
      console.warn("[compress-worker] pdfcpu preflight unavailable; continuing without structural audit");
    }

    // ── STAGE 3: HEURISTICS EVALUATION & DOWNGRADE RULES ────────────────────
    let targetTier = options.tier;
    let tierConfig = { ...TIER_CONFIG_MAP[targetTier] };

    if (preflight.maxPixels > PREFLIGHT_PIXEL_CAP) {
      postTyped({
        type: "COMPRESS_PROGRESS",
        jobId,
        percent: 15,
        message: "Oversized image streams flagged (Decompression Bomb Protection). Forcing Print-Safe mode to save memory...",
      });
      targetTier = "printSafe";
      tierConfig = { ...TIER_CONFIG_MAP.printSafe };
    } else if (preflight.isVectorHeavy || options.forceBypassVector) {
      postTyped({
        type: "COMPRESS_PROGRESS",
        jobId,
        percent: 15,
        message: "Vector-heavy asset detected. Bypassing aggressive image re-encoding…",
      });
      // Safety rule modification: keep vector crispness intact
      tierConfig = {
        ...tierConfig,
        colorDpi: Math.max(tierConfig.colorDpi, 300),
        garbageCollectionLevel: 1
      };
    }

    // ── STAGE 4: MAIN PIPELINE PASS ─────────────────────────────────────────
    const wasmResult = await executeWasmCompression(
      gsModule,
      fileBytes,
      tierConfig,
      (message: string, percent?: number) => {
        postTyped({
          type: "COMPRESS_PROGRESS",
          jobId,
          percent: percent ? Math.min(percent, 90) : 50,
          message,
        });
      }
    );

    // ── STAGE 5: DO NO HARM SIZE GUARD ──────────────────────────────────────
    let finalResult = wasmResult;
    if (wasmResult.byteLength >= originalByteCount) {
      // Fall back to original bytes if compression increased the size
      finalResult = new Uint8Array(fileBytes);
    }

    postTyped(
      {
        type: "COMPRESS_COMPLETE",
        jobId,
        result: finalResult,
        originalBytes: originalByteCount,
        compressedBytes: finalResult.byteLength,
      },
      [finalResult.buffer]
    );

  } catch (err: unknown) {
    postTyped({
      type: "COMPRESS_ERROR",
      jobId,
      code: classifyError(err),
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Message Event Dispatcher
// ---------------------------------------------------------------------------

self.onmessage = async (event: MessageEvent<MainToCompressWorkerMessage>) => {
  const { type, jobId, fileBytes, options } = event.data;
  if (type === "START_COMPRESS") {
    await handleStartCompress(jobId, fileBytes, options);
  }
};
