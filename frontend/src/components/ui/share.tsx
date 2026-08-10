'use client';
/**
 * One way to hand somebody a link.
 *
 * Every share in the app used to be a button that fired `navigator.share` and
 * showed nothing — fine when you are sending a link to a phone that is not in
 * the room, useless when the person is standing next to you. A QR is the
 * shortest path between two phones on a gym floor, so the link now *appears*:
 * code on top, the URL and the share icon under it, one tap to send.
 *
 * The QR panel is white in both themes on purpose. Inverted codes scan badly on
 * a fair number of cheap camera apps, and a share that sometimes fails to scan
 * is worse than one that never looked like the rest of the card.
 */
import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { Check, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet } from '@/components/ui/sheet';

/** The code itself — one `<path>` of dark modules, drawn in module units. */
function Qr({ value, className }: { value: string; className?: string }) {
  const { d, count } = useMemo(() => {
    // Type 0 = smallest version the data fits in; 'M' recovers ~15%, which is
    // what every wallet/ticket QR uses and survives a smudged phone screen.
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
    return { d, count };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${count} ${count}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code for ${value}`}
      className={cn('h-full w-full', className)}
    >
      <path d={d} fill="#0A0E1A" />
    </svg>
  );
}

export interface ShareBlockProps {
  link: string;
  /** Payload for the OS share sheet. */
  title?: string;
  text?: string;
  className?: string;
}

/** QR, then the link with a share icon. Drop into any sheet, card or panel. */
export function ShareBlock({ link, title = 'RepRush', text, className }: ShareBlockProps) {
  const [copied, setCopied] = useState(false);

  const send = async () => {
    // Web Share where it exists, clipboard everywhere else — the pair every
    // share in this app already used, now in one place.
    if (navigator.share) {
      await navigator.share({ title, text, url: link }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div className="h-44 w-44 rounded-2xl bg-white p-3 shadow-sm ring-2 ring-border">
        <Qr value={link} />
      </div>

      <button
        onClick={send}
        aria-label={copied ? 'Link copied' : `Share ${link}`}
        className="press flex w-full items-center gap-2 rounded-2xl border-2 border-border bg-card py-2 pl-4 pr-2 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {link.replace(/^https?:\/\//, '')}
        </span>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-fill text-primary-foreground">
          {copied ? <Check size={18} /> : <Share2 size={18} />}
        </span>
      </button>

      <p className="text-xs text-muted-foreground">
        {copied ? 'Link copied' : 'Scan the code, or tap to send the link'}
      </p>
    </div>
  );
}

/** The same block in a bottom sheet, for callers that have no panel of their own. */
export function ShareSheet({
  open,
  onOpenChange,
  heading,
  description,
  ...share
}: ShareBlockProps & {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  heading: React.ReactNode;
  description?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={heading} description={description}>
      <ShareBlock {...share} className="pb-2 pt-1" />
    </Sheet>
  );
}
