import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  value: string;
  onChange: (typed: string) => void;
  required?: boolean;
}

export default function SignaturePad({ value, onChange, required }: Props) {
  const { t } = useTranslation();
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    setDrawing(true);
    const ctx = (e.target as HTMLCanvasElement).getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const ctx = (e.target as HTMLCanvasElement).getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#0F172A";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    ctx.stroke();
    setHasDrawn(true);
  }

  function handlePointerUp() {
    setDrawing(false);
  }

  function clearCanvas(e: React.MouseEvent) {
    e.stopPropagation();
    const canvas = document.querySelector<HTMLCanvasElement>("#sig-canvas");
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasDrawn(false);
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">
        {t("signature.typed_label", "Type your full name as your signature")}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
        placeholder={t("signature.placeholder", "Type your full name")}
      />
      <div className="text-xs text-slate-500">
        {t("signature.draw_label", "Or draw your signature below:")}
      </div>
      <div className="relative">
        <canvas
          id="sig-canvas"
          width={400}
          height={120}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="w-full cursor-crosshair touch-none rounded-lg border border-slate-300 bg-white"
        />
        {hasDrawn && (
          <button
            type="button"
            onClick={clearCanvas}
            className="absolute right-2 top-2 rounded bg-white px-2 py-1 text-xs text-slate-500 shadow hover:text-rose-600"
          >
            {t("signature.clear", "Clear")}
          </button>
        )}
      </div>
    </div>
  );
}
