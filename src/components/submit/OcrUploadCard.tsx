import React, { useRef } from 'react';
import { Upload, X, AlertTriangle, Check, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Uploaded {
  id: string;
  file: File;
  name: string;
  size: number;
  previewUrl: string;
}

type OcrState =
  | { status: 'idle' }
  | { status: 'uploading'; progress01: number }
  | { status: 'ocr_running'; step: string; progress01: number }
  | { status: 'done'; rawText: string; teamStats: Record<string, number>; playerLines: string[] }
  | { status: 'timeout'; error: string }
  | { status: 'error'; message: string };

interface OcrUploadCardProps {
  uploaded: Uploaded[];
  ocr: OcrState;
  ocrConfirm: boolean;
  onPickFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (id: string) => void;
  onRunOcr: () => void;
  onOcrConfirmChange: (confirmed: boolean) => void;
  canRunOcr: boolean;
  onRetryOcr: () => void;
}

function bytesToKb(n: number) {
  return Math.max(1, Math.round((n || 0) / 1024));
}

export function OcrUploadCard({
  uploaded,
  ocr,
  ocrConfirm,
  onPickFiles,
  onRemoveFile,
  onRunOcr,
  onOcrConfirmChange,
  canRunOcr,
  onRetryOcr,
}: OcrUploadCardProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="ocrCard">
      <div className="ocrCard__header">
        <h3 className="ocrCard__title">Match Evidence (Optional)</h3>
        <p className="ocrCard__subtitle">Upload screenshots for automated stat extraction</p>
      </div>

      {/* Upload section */}
      <div className="ocrCard__uploadArea">
        <label className="ocrCard__uploadBtn">
          <Upload size={24} />
          <span className="ocrCard__uploadText">Upload Screenshots</span>
          <span className="ocrCard__uploadSub">JPG, PNG (score + stats pages)</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onPickFiles}
            className="ocrCard__uploadInput"
          />
        </label>
      </div>

      {/* Uploaded files list */}
      {uploaded.length > 0 && (
        <div className="ocrCard__files">
          {uploaded.map((file) => (
            <div key={file.id} className="ocrCard__file">
              <div className="ocrCard__fileInfo">
                <div className="ocrCard__fileName">{file.name}</div>
                <div className="ocrCard__fileSize">{bytesToKb(file.size)} KB</div>
              </div>
              <button
                type="button"
                className="ocrCard__fileRemove"
                onClick={() => onRemoveFile(file.id)}
              >
                <X size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* OCR controls */}
      {uploaded.length > 0 && (
        <button
          type="button"
          className="ocrCard__runBtn"
          onClick={onRunOcr}
          disabled={!canRunOcr}
        >
          {ocr.status === 'ocr_running' ? (
            <>
              <span className="ocrCard__spinner" />
              Running OCR…
            </>
          ) : ocr.status === 'done' ? (
            <>
              <Check size={18} /> OCR Complete
            </>
          ) : (
            <>
              <Upload size={18} /> Extract Stats
            </>
          )}
        </button>
      )}

      {/* OCR progress */}
      <AnimatePresence>
        {ocr.status === 'ocr_running' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="ocrCard__progress"
          >
            <div className="ocrCard__progressStep">{(ocr as any).step}</div>
            <div className="ocrCard__progressBar">
              <div
                className="ocrCard__progressFill"
                style={{ width: `${Math.round((ocr as any).progress01 * 100)}%` }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OCR error / timeout */}
      <AnimatePresence>
        {ocr.status === 'timeout' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="ocrCard__alert ocrCard__alert--warning"
          >
            <AlertTriangle size={18} />
            <div>
              <div className="ocrCard__alertTitle">OCR took too long</div>
              <div className="ocrCard__alertMsg">{(ocr as any).error}</div>
              <div className="ocrCard__alertActions">
                <button onClick={onRetryOcr} className="ocrCard__alertBtn">
                  Retry
                </button>
                <button onClick={() => onRunOcr} className="ocrCard__alertBtn ocrCard__alertBtn--secondary">
                  Skip
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {ocr.status === 'error' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="ocrCard__alert ocrCard__alert--error"
        >
          <AlertTriangle size={18} />
          <div>
            <div className="ocrCard__alertTitle">Error reading image</div>
            <div className="ocrCard__alertMsg">{(ocr as any).message}</div>
          </div>
        </motion.div>
      )}

      {/* OCR results review */}
      <AnimatePresence>
        {ocr.status === 'done' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="ocrCard__results"
          >
            <div className="ocrCard__resultsTitle">Extracted Stats Preview</div>

            {Object.keys((ocr as any).teamStats).length > 0 && (
              <div className="ocrCard__resultsList">
                <div className="ocrCard__resultsLabel">Team Stats</div>
                {Object.entries((ocr as any).teamStats)
                  .slice(0, 6)
                  .map(([k, v]) => (
                    <div key={k} className="ocrCard__resultsStat">
                      <span>{k}</span>
                      <span className="ocrCard__resultsValue">{String(v ?? '')}</span>
                    </div>
                  ))}
              </div>
            )}

            {(ocr as any).playerLines.length > 0 && (
              <div className="ocrCard__resultsList">
                <div className="ocrCard__resultsLabel">Player Lines</div>
                {(ocr as any).playerLines.slice(0, 5).map((line: string, i: number) => (
                  <div key={i} className="ocrCard__resultsLine">
                    {line}
                  </div>
                ))}
              </div>
            )}

            <label className="ocrCard__confirm">
              <input
                type="checkbox"
                checked={ocrConfirm}
                onChange={(e) => onOcrConfirmChange(e.target.checked)}
              />
              <span>I've reviewed and the results look correct</span>
            </label>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="ocrCard__hint">
        <span>💡</span> OCR is optional. You can manually enter scores above.
      </div>
    </div>
  );
}
