"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { applyPerspective, Point } from "@/lib/perspective";

interface Props {
  open: boolean;
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

// Cheque argentino: ~16cm x 7cm → aspect ~2.28. Usamos 2.35 para margen visual.
const CHEQUE_ASPECT = 2.35;
// Resolucion de salida del recibo enderezado (ancho × alto en px).
const OUT_W = 1280;
const OUT_H = Math.round(OUT_W / CHEQUE_ASPECT);

type Stage = "live" | "review";

export default function ChequeCameraCapture({ open, onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stillCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const reviewImgRef = useRef<HTMLImageElement>(null);
  const reviewContainerRef = useRef<HTMLDivElement>(null);

  const [error, setError] = useState<string>("");
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState<Stage>("live");
  const [stillDataUrl, setStillDataUrl] = useState<string>("");
  const [stillW, setStillW] = useState(0);
  const [stillH, setStillH] = useState(0);
  // Corner positions in source-image (still) pixel coordinates
  const [corners, setCorners] = useState<Point[]>([]);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setReady(false);
  }, []);

  const resetAll = useCallback(() => {
    setStage("live");
    setStillDataUrl("");
    setStillW(0);
    setStillH(0);
    setCorners([]);
    setDraggingIdx(null);
    setProcessing(false);
    setError("");
  }, []);

  useEffect(() => {
    if (!open) return;
    resetAll();

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("La camara no esta disponible en este navegador");
      return;
    }

    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(() => {});
            setReady(true);
          };
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(`No se pudo acceder a la camara: ${e?.message || e}. Pode usar la galeria.`);
      });

    return () => {
      cancelled = true;
      stop();
    };
  }, [open, stop, resetAll]);

  // Snapshot the current video frame and move to review
  function captureStill() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, vw, vh);

    stillCanvasRef.current = canvas;
    setStillDataUrl(canvas.toDataURL("image/jpeg", 0.92));
    setStillW(vw);
    setStillH(vh);

    // Initialize corners inside the guide rectangle (same proportions as the overlay)
    const guideWidth = vw * 0.88;
    let guideHeight = guideWidth / CHEQUE_ASPECT;
    if (guideHeight > vh * 0.85) guideHeight = vh * 0.85;
    const x0 = (vw - guideWidth) / 2;
    const y0 = (vh - guideHeight) / 2;
    setCorners([
      { x: x0, y: y0 },
      { x: x0 + guideWidth, y: y0 },
      { x: x0 + guideWidth, y: y0 + guideHeight },
      { x: x0, y: y0 + guideHeight },
    ]);
    stop();
    setStage("review");
  }

  // Image picked from gallery → directly go to review (no live camera needed)
  function onFileSelected(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        const canvas = document.createElement("canvas");
        canvas.width = iw;
        canvas.height = ih;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, iw, ih);
        stillCanvasRef.current = canvas;
        setStillDataUrl(canvas.toDataURL("image/jpeg", 0.92));
        setStillW(iw);
        setStillH(ih);
        const guideWidth = iw * 0.88;
        let guideHeight = guideWidth / CHEQUE_ASPECT;
        if (guideHeight > ih * 0.85) guideHeight = ih * 0.85;
        const x0 = (iw - guideWidth) / 2;
        const y0 = (ih - guideHeight) / 2;
        setCorners([
          { x: x0, y: y0 },
          { x: x0 + guideWidth, y: y0 },
          { x: x0 + guideWidth, y: y0 + guideHeight },
          { x: x0, y: y0 + guideHeight },
        ]);
        stop();
        setStage("review");
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  // Convert client coords (touch/mouse on the displayed image) to source image coords
  function clientToImage(clientX: number, clientY: number): Point | null {
    const img = reviewImgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const scaleX = stillW / rect.width;
    const scaleY = stillH / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    return { x: Math.max(0, Math.min(stillW, x)), y: Math.max(0, Math.min(stillH, y)) };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>, idx: number) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDraggingIdx(idx);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (draggingIdx === null) return;
    const p = clientToImage(e.clientX, e.clientY);
    if (!p) return;
    setCorners((prev) => prev.map((c, i) => (i === draggingIdx ? p : c)));
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    setDraggingIdx(null);
  }

  function applyAndReturn() {
    const srcCanvas = stillCanvasRef.current;
    if (!srcCanvas) return;
    setProcessing(true);
    // Defer to next frame so the spinner can render
    setTimeout(() => {
      try {
        const out = applyPerspective(srcCanvas, corners, OUT_W, OUT_H);
        const dataUrl = out.toDataURL("image/jpeg", 0.88);
        onCapture(dataUrl);
      } catch (e) {
        setError(`Error procesando: ${(e as Error).message}`);
        setProcessing(false);
      }
    }, 30);
  }

  // Fallback: skip deskew, return a simple crop matching the current corner bbox
  function skipDeskew() {
    const srcCanvas = stillCanvasRef.current;
    if (!srcCanvas) return;
    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxY = Math.max(...corners.map((c) => c.y));
    const cw = Math.max(1, maxX - minX);
    const ch = Math.max(1, maxY - minY);
    const out = document.createElement("canvas");
    out.width = Math.round(cw);
    out.height = Math.round(ch);
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(srcCanvas, minX, minY, cw, ch, 0, 0, cw, ch);
    onCapture(out.toDataURL("image/jpeg", 0.88));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-black/70 text-white">
        <span className="text-sm font-medium">
          {stage === "live" ? "Capturar cheque" : "Ajustar esquinas del cheque"}
        </span>
        <button
          onClick={() => { stop(); resetAll(); onClose(); }}
          className="text-sm px-3 py-1 bg-white/10 rounded hover:bg-white/20"
        >
          Cancelar
        </button>
      </div>

      {stage === "live" ? (
        <>
          <div className="relative flex-1 flex items-center justify-center overflow-hidden">
            {!error && (
              <video
                ref={videoRef}
                playsInline
                muted
                className="max-w-full max-h-full object-contain"
              />
            )}
            {error && (
              <div className="text-white text-center px-6">
                <p className="text-sm mb-4">{error}</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-brand-500 text-white rounded-xl text-sm"
                >
                  Elegir foto de la galeria
                </button>
              </div>
            )}
            {ready && !error && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className="border-2 border-brand-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                  style={{
                    width: "88%",
                    aspectRatio: String(CHEQUE_ASPECT),
                    maxHeight: "85%",
                    borderRadius: 6,
                  }}
                >
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-brand-500 text-white text-xs rounded-full">
                    Alinea el cheque dentro del recuadro
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-4 px-4 py-3 bg-black/70">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 text-sm text-white bg-white/10 rounded-xl hover:bg-white/20"
            >
              Galeria
            </button>
            <button
              onClick={captureStill}
              disabled={!ready || !!error}
              className="px-8 py-3 text-sm font-medium text-white bg-brand-500 rounded-full disabled:opacity-40 hover:bg-brand-600"
            >
              Capturar
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onFileSelected(e.target.files?.[0])}
            />
          </div>
        </>
      ) : (
        <>
          <div
            className="relative flex-1 flex items-center justify-center overflow-hidden touch-none select-none"
            ref={reviewContainerRef}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {stillDataUrl && (
              <>
                <img
                  ref={reviewImgRef}
                  src={stillDataUrl}
                  alt="captura"
                  className="max-w-full max-h-full object-contain"
                  draggable={false}
                />
                {/* Overlay SVG with quad lines + corner dots */}
                {corners.length === 4 && reviewImgRef.current && (() => {
                  const img = reviewImgRef.current;
                  const rect = img.getBoundingClientRect();
                  const container = reviewContainerRef.current?.getBoundingClientRect();
                  if (!container) return null;
                  const offsetX = rect.left - container.left;
                  const offsetY = rect.top - container.top;
                  const scaleX = rect.width / stillW;
                  const scaleY = rect.height / stillH;
                  const px = (p: Point) => ({ x: offsetX + p.x * scaleX, y: offsetY + p.y * scaleY });
                  const screen = corners.map(px);
                  const pathD = `M ${screen[0].x} ${screen[0].y} L ${screen[1].x} ${screen[1].y} L ${screen[2].x} ${screen[2].y} L ${screen[3].x} ${screen[3].y} Z`;
                  return (
                    <svg
                      className="absolute inset-0 pointer-events-none w-full h-full"
                      style={{ pointerEvents: "none" }}
                    >
                      <path d={pathD} fill="rgba(251,154,71,0.18)" stroke="rgb(251,154,71)" strokeWidth={2} />
                      {screen.map((s, i) => (
                        <g key={i}>
                          <circle cx={s.x} cy={s.y} r={22} fill="transparent" />
                          <circle cx={s.x} cy={s.y} r={9} fill="white" stroke="rgb(251,100,40)" strokeWidth={3} />
                        </g>
                      ))}
                    </svg>
                  );
                })()}
                {/* Invisible touch targets per corner — react to pointer down */}
                {corners.length === 4 && reviewImgRef.current && (() => {
                  const img = reviewImgRef.current;
                  const rect = img.getBoundingClientRect();
                  const container = reviewContainerRef.current?.getBoundingClientRect();
                  if (!container) return null;
                  const offsetX = rect.left - container.left;
                  const offsetY = rect.top - container.top;
                  const scaleX = rect.width / stillW;
                  const scaleY = rect.height / stillH;
                  return corners.map((c, i) => {
                    const sx = offsetX + c.x * scaleX;
                    const sy = offsetY + c.y * scaleY;
                    return (
                      <div
                        key={`hit-${i}`}
                        onPointerDown={(e) => onPointerDown(e, i)}
                        className="absolute touch-none cursor-grab active:cursor-grabbing"
                        style={{
                          left: sx - 24,
                          top: sy - 24,
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                        }}
                      />
                    );
                  });
                })()}
              </>
            )}
            {processing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <span className="text-white text-sm">Procesando...</span>
              </div>
            )}
          </div>

          {error && (
            <div className="px-4 py-2 bg-red-900/60 text-white text-sm">{error}</div>
          )}

          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-black/70">
            <button
              onClick={resetAll}
              disabled={processing}
              className="px-3 py-2 text-xs text-white bg-white/10 rounded-xl hover:bg-white/20 disabled:opacity-50"
            >
              Volver
            </button>
            <button
              onClick={skipDeskew}
              disabled={processing}
              className="px-3 py-2 text-xs text-white bg-white/10 rounded-xl hover:bg-white/20 disabled:opacity-50"
            >
              Solo recortar
            </button>
            <button
              onClick={applyAndReturn}
              disabled={processing}
              className="px-6 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-full disabled:opacity-40 hover:bg-brand-600"
            >
              {processing ? "Procesando..." : "Aplicar"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
