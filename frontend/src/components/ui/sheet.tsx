'use client';
/**
 * Bottom sheet. Built on the already-installed @radix-ui/react-dialog so focus
 * trapping, scroll locking, escape handling and aria wiring come for free —
 * writing those by hand is exactly the accessibility work that gets skipped.
 */
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { spring } from '@/lib/motion';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  /** Sticky action area pinned to the bottom of the sheet. */
  footer?: React.ReactNode;
  className?: string;
  /** Hide the drag handle + close button for flows that must be completed. */
  dismissible?: boolean;
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  dismissible = true,
}: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
              />
            </Dialog.Overlay>

            <Dialog.Content
              asChild
              onOpenAutoFocus={(e) => e.preventDefault()}
              aria-describedby={description ? undefined : ''}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={spring.gentle}
                className={cn(
                  'fixed inset-x-0 bottom-0 z-[61] flex max-h-[92dvh] flex-col',
                  'rounded-t-3xl border-t border-border bg-popover safe-bottom',
                  className,
                )}
              >
                {dismissible && (
                  <div className="flex justify-center pt-3" aria-hidden>
                    <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
                  </div>
                )}

                {(title || dismissible) && (
                  <div className="flex items-center justify-between px-5 pb-2 pt-3">
                    <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
                    {dismissible && (
                      <Dialog.Close className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                        <X size={20} />
                        <span className="sr-only">Close</span>
                      </Dialog.Close>
                    )}
                  </div>
                )}
                {description && (
                  <Dialog.Description className="px-5 pb-1 text-sm text-muted-foreground">
                    {description}
                  </Dialog.Description>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-1">
                  {children}
                </div>

                {footer && <div className="border-t border-border px-5 py-4">{footer}</div>}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
