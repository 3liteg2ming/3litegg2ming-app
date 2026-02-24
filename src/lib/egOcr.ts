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
  const worker = await createWorker({
    logger: (m: any) => {
      if (!onProgress) return;
      const status = String(m?.status || 'working');
      const progress = typeof m?.progress === 'number' ? m.progress : 0;
      onProgress({ status, progress });
    },
    workerPath: WORKER_PATH,
    corePath: CORE_PATH,
    langPath: LANG_PATH,
  });

  try {
    // load+init is where "Starting..." usually hangs if paths are wrong
    await withTimeout(worker.loadLanguage('eng'), timeoutMs, 'loadLanguage');
    await withTimeout(worker.initialize('eng'), timeoutMs, 'initialize');

    const { data } = await withTimeout(worker.recognize(image), timeoutMs, 'recognize');
    return { text: String(data?.text || '') };
  } finally {
    // Always terminate, otherwise future runs can hang / leak workers
    try {
      await worker.terminate();
    } catch {
      // ignore
    }
  }
}
