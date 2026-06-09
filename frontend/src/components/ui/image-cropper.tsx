'use client';
import { useState, useCallback } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { motion, AnimatePresence } from 'framer-motion';
import { ZoomIn, Check, X } from 'lucide-react';
import { Button } from './button';
import { spring } from '@/lib/motion';

interface Props {
  src: string | null;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
  /** output square size in px */
  size?: number;
  busy?: boolean;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function cropToDataUrl(src: string, area: Area, size = 512): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Square crop + zoom modal. Returns a compressed JPEG data URL. */
export function ImageCropper({ src, onCancel, onConfirm, size = 512, busy }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, px: Area) => setAreaPixels(px), []);

  const confirm = async () => {
    if (!src || !areaPixels) return;
    onConfirm(await cropToDataUrl(src, areaPixels, size));
  };

  return (
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0 }}
            transition={spring.soft}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md glass rounded-2xl overflow-hidden shadow-lift"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h3 className="font-display font-semibold text-sm">Adjust your photo</h3>
              <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18} /></button>
            </div>

            <div className="relative w-full h-72 bg-black">
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="rect"
                showGrid
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="flex items-center gap-3">
                <ZoomIn size={16} className="text-muted-foreground flex-shrink-0" />
                <input
                  type="range" min={1} max={3} step={0.01} value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-brand-500"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
                <Button className="flex-1" onClick={confirm} disabled={busy || !areaPixels}>
                  <Check size={16} /> {busy ? 'Saving…' : 'Use photo'}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
