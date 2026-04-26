import { createWorker } from 'tesseract.js';

export type EgOcrProgress = {
  status: string;
  progress: number; // 0..1
};

export type EgOcrResult = {
  text: string;
};

const WORKER_PATH = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js';
const CORE_PATH = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js';
const LANG_PATH = 'https://tessdata.projectnaptha.com/4.0.0';

function withTimeout<T>(p: Promise<T>, ms: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Runs OCR on one image at a time (File/Blob). Uses CDN worker/core/lang so Vite path issues won't hang.
 */
export async function egRunOcrOnImage(
  image: File | Blob,
  onProgress?: (p: EgOcrProgress) => void,
  timeoutMs = 90_000,
): Promise<EgOcrResult> {
  const workerFactory = createWorker as any;
  let worker: any = null;
  const logger = (message: any) => {
    if (!onProgress) return;
    const progress = typeof message?.progress === 'number' ? message.progress : 0;
    onProgress({
      status: String(message?.status || 'working'),
      progress: Math.max(0, Math.min(1, progress)),
    });
  };

  try {
    if (onProgress) onProgress({ status: 'initializing', progress: 0.1 });
    try {
      worker = await withTimeout(
        workerFactory('eng', 1, {
          workerPath: WORKER_PATH,
          corePath: CORE_PATH,
          langPath: LANG_PATH,
          logger,
        }),
        timeoutMs,
        'createWorker',
      );
    } catch {
      // Fall back to the package defaults if the CDN worker paths fail.
      worker = await withTimeout(workerFactory('eng', 1, { logger }), timeoutMs, 'createWorker');
    }
    if (onProgress) onProgress({ status: 'recognizing', progress: 0.2 });

    const res = (await withTimeout(worker.recognize(image), timeoutMs, 'recognize')) as any;
    const data = res?.data;
    return { text: String(data?.text || '') };
  } finally {
    // Always terminate, otherwise future runs can hang / leak workers
    try {
      await worker?.terminate?.();
    } catch {
      // ignore
    }
  }
}
