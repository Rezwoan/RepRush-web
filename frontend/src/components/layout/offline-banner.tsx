'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useOffline } from '@/lib/use-offline';

/**
 * Thin status strip: tells the user their logging is being kept locally, and
 * that it's on its way once the connection returns. Renders nothing in the
 * normal case (online, nothing queued).
 */
export default function OfflineBanner() {
  const { online, pending } = useOffline();
  const show = !online || pending > 0;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="sticky top-0 z-40 -mx-4 mb-3 px-4"
        >
          <div
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
              online
                ? 'border-brand-500/25 bg-brand-500/10 text-brand-200'
                : 'border-volt-400/25 bg-volt-400/10 text-volt-300'
            }`}
          >
            {online ? (
              <>
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                  className="flex-shrink-0"
                >
                  <RefreshCw size={13} />
                </motion.span>
                <span>
                  Syncing {pending} change{pending !== 1 ? 's' : ''}…
                </span>
              </>
            ) : (
              <>
                <CloudOff size={13} className="flex-shrink-0" />
                <span>
                  Offline — keep logging.{' '}
                  {pending > 0
                    ? `${pending} change${pending !== 1 ? 's' : ''} will sync automatically.`
                    : 'Everything saves on this device.'}
                </span>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
