'use client';
/**
 * Settings → Send feedback, and the admin's triage list.
 *
 * ## Why both live in one file
 *
 * They are the two halves of one loop, and separating them is how a feature
 * ends up write-only — the defect this project shipped four times
 * (`docs/ENGINEERING.md` §1). P10 deliberately removed a Feedback tile because
 * it opened a "coming soon" for a form with no backend; this ships the form and
 * the place the reports are read in the same change.
 *
 * ## Shape of the form
 *
 * Only the message is required. The topic picker and the screenshots are both
 * optional, because the most useful report is the one someone actually sends,
 * and every required field is a reason not to.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Send, Trash2, X } from 'lucide-react';
import { feedbackApi } from '@/lib/api';
import { compressImage, fmtBytes } from '@/lib/image-compress';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/controls';
import { EmptyState } from '@/components/ui/display';
import { Panel } from './panel';

/** Mirrors `FEEDBACK_TOPICS` in `backend/src/feedback/feedback.entity.ts`. */
const TOPIC_LABEL: Record<string, string> = {
  bug: 'Something broken',
  idea: 'An idea',
  workout: 'Workouts',
  ranks: 'Ranks',
  social: 'Friends & feed',
  design: 'Look & feel',
  performance: 'Speed',
  account: 'My account',
  other: 'Something else',
};

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  read: 'Read',
  planned: 'Planned',
  done: 'Done',
  declined: 'Not planned',
};

interface Report {
  id: number;
  topic: string | null;
  message: string;
  status: string;
  context: string | null;
  createdAt: string;
  images: string[];
  author?: { name: string; username: string | null } | null;
}

/** A picked-but-not-yet-sent attachment. `dataUrl` doubles as its own preview. */
interface Draft {
  dataUrl: string;
  bytes: number;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });

/**
 * What the client knows about itself, captured so the user does not have to
 * describe their own browser — a question people answer wrongly, if at all.
 * Display-only on the server; never parsed.
 */
function clientContext(): string {
  if (typeof window === 'undefined') return '';
  const { userAgent, language } = navigator;
  const size = `${window.innerWidth}×${window.innerHeight}`;
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches ? ' · installed' : '';
  return `${size} · ${language} · ${userAgent}${standalone}`.slice(0, 300);
}

// ── the form ────────────────────────────────────────────────────────

export function FeedbackPanel({ onBack }: { onBack: () => void }) {
  const [topics, setTopics] = useState<string[]>([]);
  const [maxImages, setMaxImages] = useState(6);
  const [topic, setTopic] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [mine, setMine] = useState<Report[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The topic list comes from the server so the two cannot drift — the same
  // call `GET /profile/meta` makes for cards and health metrics.
  useEffect(() => {
    feedbackApi
      .meta()
      .then((r) => {
        setTopics(r.data.topics ?? []);
        setMaxImages(r.data.maxImages ?? 6);
      })
      .catch(() => setTopics(Object.keys(TOPIC_LABEL)));
  }, []);

  const loadMine = useCallback(() => {
    feedbackApi
      .mine()
      .then((r) => setMine(r.data))
      .catch(() => setMine([]));
  }, []);
  useEffect(loadMine, [loadMine]);

  /**
   * Compress each pick before it reaches state.
   *
   * Sequential, not `Promise.all`: six canvas decodes at once will stall a
   * mid-range phone's main thread long enough to look like a freeze, and the
   * user is watching an empty list while it happens.
   */
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    const room = maxImages - drafts.length;
    if (room <= 0) {
      setError(`Up to ${maxImages} images per report`);
      return;
    }
    setBusy(true);
    try {
      const picked = Array.from(files).slice(0, room);
      for (const file of picked) {
        try {
          const out = await compressImage(file);
          setDrafts((d) => [...d, out]);
        } catch (e: any) {
          setError(e?.message ?? 'One of those images could not be read');
        }
      }
      if (files.length > room) setError(`Only the first ${room} were added — ${maxImages} is the limit.`);
    } finally {
      setBusy(false);
      // Reset the input, or picking the same file twice in a row fires no event.
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const submit = async () => {
    if (!message.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await feedbackApi.create({
        message: message.trim(),
        topic,
        images: drafts.map((d) => d.dataUrl),
        context: clientContext(),
      });
      setSent(true);
      setMessage('');
      setTopic(null);
      setDrafts([]);
      loadMine();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not send that. Your text is still here.');
    } finally {
      setBusy(false);
    }
  };

  const totalBytes = drafts.reduce((n, d) => n + d.bytes, 0);

  return (
    <Panel title="Send feedback" onBack={onBack}>
      <div className="space-y-4 pb-6">
        {sent ? (
          <div className="surface flex items-start gap-3 border-success p-4">
            <Check size={20} className="mt-0.5 shrink-0 text-success" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">Sent — thank you.</p>
              <p className="text-sm text-muted-foreground">
                It is in the list below, and you can follow its status there.
              </p>
            </div>
            <button onClick={() => setSent(false)} className="press text-sm font-bold text-primary">
              Send another
            </button>
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="feedback-message" className="mb-1.5 block font-extrabold">
                What would you like to tell us?
              </label>
              <textarea
                id="feedback-message"
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={4000}
                placeholder="What happened, what you expected, anything that helps us find it."
                className="w-full resize-y rounded-2xl border-2 border-border bg-card px-4 py-3 outline-none focus:border-primary"
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">{message.length}/4000</p>
            </div>

            <div>
              <p className="mb-1.5 font-extrabold">
                What is it about? <span className="font-semibold text-muted-foreground">(optional)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {topics.map((t) => (
                  <Chip key={t} active={topic === t} onClick={() => setTopic(topic === t ? null : t)}>
                    {TOPIC_LABEL[t] ?? t}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 font-extrabold">
                Screenshots <span className="font-semibold text-muted-foreground">(optional)</span>
              </p>

              {drafts.length > 0 && (
                <ul className="mb-2 grid grid-cols-3 gap-2">
                  {drafts.map((d, i) => (
                    <li key={i} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={d.dataUrl}
                        alt={`Attachment ${i + 1}`}
                        className="aspect-square w-full rounded-xl border border-border object-cover"
                      />
                      <button
                        onClick={() => setDrafts((list) => list.filter((_, j) => j !== i))}
                        aria-label={`Remove attachment ${i + 1}`}
                        className="press absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-destructive text-destructive-foreground"
                      >
                        <X size={13} />
                      </button>
                      <span className="nums absolute bottom-1 left-1 rounded bg-background/80 px-1 text-[10px] font-bold">
                        {fmtBytes(d.bytes)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => void addFiles(e.target.files)}
                className="sr-only"
                id="feedback-images"
              />
              <label
                htmlFor="feedback-images"
                className={cn(
                  'press flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border py-3.5 font-bold text-muted-foreground',
                  drafts.length >= maxImages && 'pointer-events-none opacity-40',
                )}
              >
                <ImagePlus size={18} />
                {drafts.length ? `Add another (${drafts.length}/${maxImages})` : 'Add screenshots'}
              </label>
              {drafts.length > 0 && (
                <p className="nums mt-1 text-xs text-muted-foreground">
                  {drafts.length} image{drafts.length === 1 ? '' : 's'} · {fmtBytes(totalBytes)} after
                  compression
                </p>
              )}
            </div>

            {error && <p className="text-sm font-bold text-destructive">{error}</p>}

            <Button
              variant="chunky"
              size="cta"
              className="w-full"
              disabled={!message.trim() || busy}
              onClick={submit}
            >
              <Send size={18} /> {busy ? 'Sending…' : 'Send feedback'}
            </Button>
          </>
        )}

        <section>
          <h2 className="mb-2 font-extrabold">Your reports</h2>
          {mine === null && <div className="surface h-24 animate-pulse opacity-60" />}
          {mine?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing sent yet. Anything you send shows up here with its status.
            </p>
          )}
          <ul className="space-y-2">
            {mine?.map((r) => (
              <li key={r.id} className="surface p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  {r.topic && (
                    <span className="text-xs font-bold text-muted-foreground">
                      {TOPIC_LABEL[r.topic] ?? r.topic}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">{fmtDate(r.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{r.message}</p>
                {r.images.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.images.length} screenshot{r.images.length === 1 ? '' : 's'}
                  </p>
                )}
                <button
                  onClick={async () => {
                    await feedbackApi.remove(r.id).catch(() => {});
                    loadMine();
                  }}
                  className="press mt-2 flex items-center gap-1 text-xs font-bold text-muted-foreground"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Panel>
  );
}

// ── the admin's side ────────────────────────────────────────────────

/**
 * Every report, for an admin.
 *
 * This is the reader that stops feedback being a write-only feature. It is
 * intentionally plain — a list, an image, and a status control — because the
 * job here is to *read* reports, and the full admin rebuild is a separate piece
 * of work (`PROGRESS.md` → still open).
 */
export function FeedbackAdminPanel({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Report[] | null>(null);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    feedbackApi
      .all()
      .then((r) => setRows(r.data))
      .catch((e) => {
        setRows([]);
        setError(e?.response?.data?.message ?? 'Could not load reports');
      });
  }, []);

  useEffect(() => {
    load();
    feedbackApi
      .meta()
      .then((r) => setStatuses(r.data.statuses ?? []))
      .catch(() => setStatuses(Object.keys(STATUS_LABEL)));
  }, [load]);

  const shown = rows?.filter((r) => !filter || r.status === filter) ?? [];

  return (
    <Panel title="Feedback" onBack={onBack}>
      <div className="space-y-3 pb-6">
        {error && <p className="text-sm font-bold text-destructive">{error}</p>}

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <Chip active={!filter} onClick={() => setFilter(null)}>
            All ({rows?.length ?? 0})
          </Chip>
          {statuses.map((s) => (
            <Chip key={s} active={filter === s} onClick={() => setFilter(s)}>
              {STATUS_LABEL[s] ?? s} ({rows?.filter((r) => r.status === s).length ?? 0})
            </Chip>
          ))}
        </div>

        {rows === null && <div className="surface h-40 animate-pulse opacity-60" />}
        {rows?.length === 0 && !error && (
          <EmptyState pose="idle" title="No feedback yet" description="Reports land here as they arrive." />
        )}

        <ul className="space-y-2.5">
          {shown.map((r) => (
            <li key={r.id} className="surface p-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="font-bold">{r.author?.name ?? `User ${r.id}`}</span>
                {r.author?.username && (
                  <span className="text-xs text-muted-foreground">@{r.author.username}</span>
                )}
                {r.topic && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
                    {TOPIC_LABEL[r.topic] ?? r.topic}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">{fmtDate(r.createdAt)}</span>
              </div>

              <p className="whitespace-pre-wrap text-sm">{r.message}</p>

              {r.images.length > 0 && (
                <div className="mt-2 flex gap-2 overflow-x-auto">
                  {r.images.map((src) => (
                    // Opens in a new tab rather than a lightbox: the endpoint is
                    // authenticated by the same cookie the app already holds, so
                    // the browser's own image viewer works and needs no code.
                    <a key={src} href={src} target="_blank" rel="noreferrer" className="press shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt="Attachment"
                        className="h-24 w-24 rounded-xl border border-border object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}

              {r.context && (
                <p className="mt-2 break-all text-[11px] text-muted-foreground">{r.context}</p>
              )}

              <div className="mt-2.5 flex items-center gap-2">
                <select
                  value={r.status}
                  aria-label={`Status of report ${r.id}`}
                  onChange={async (e) => {
                    await feedbackApi.setStatus(r.id, e.target.value).catch(() => {});
                    load();
                  }}
                  className="rounded-lg border-2 border-border bg-card px-2 py-1 text-sm font-bold outline-none"
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s] ?? s}
                    </option>
                  ))}
                </select>
                <button
                  onClick={async () => {
                    await feedbackApi.remove(r.id).catch(() => {});
                    load();
                  }}
                  className="press ml-auto flex items-center gap-1 text-xs font-bold text-muted-foreground"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
