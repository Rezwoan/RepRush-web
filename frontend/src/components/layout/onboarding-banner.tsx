'use client';
import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Sparkles } from 'lucide-react';
import { usersApi } from '@/lib/api';
import { Progress } from '@/components/ui/progress';
import { spring } from '@/lib/motion';

export default function OnboardingBanner() {
  const [onboarding, setOnboarding] = useState<{ percent: number; dismissed: boolean } | null>(null);
  const [hidden, setHidden] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === '/onboarding') return;
    usersApi.getOnboarding().then((res) => setOnboarding(res.data)).catch(() => {});
  }, [pathname]);

  const visible =
    onboarding && onboarding.percent < 100 && !onboarding.dismissed && !hidden && pathname !== '/onboarding';

  const handleDismiss = async () => {
    setHidden(true);
    await usersApi.dismissOnboarding().catch(() => {});
  };

  const color: 'destructive' | 'volt' | 'brand' =
    !onboarding ? 'brand' : onboarding.percent < 33 ? 'destructive' : onboarding.percent < 66 ? 'volt' : 'brand';
  const progressColor = color === 'destructive' ? 'current' : color === 'volt' ? 'volt' : 'brand';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -16, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -16, height: 0 }}
          transition={spring.soft}
          className="overflow-hidden"
        >
          <div className="relative flex items-center gap-3 rounded-2xl border border-brand-500/25 bg-brand-500/[0.07] px-4 py-3 text-sm">
            <span className="hidden sm:flex w-9 h-9 rounded-xl bg-brand-500/15 text-brand-400 items-center justify-center flex-shrink-0">
              <Sparkles size={16} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="font-semibold text-foreground">Profile {onboarding!.percent}% complete</span>
                <span className="text-xs text-muted-foreground">— finish it for sharper recommendations</span>
              </div>
              <Progress value={onboarding!.percent} color={progressColor} height="h-1.5" className="max-w-xs" />
            </div>
            <motion.button
              onClick={() => router.push('/onboarding')}
              whileTap={{ scale: 0.95 }}
              whileHover={{ x: 2 }}
              className="flex items-center gap-1 text-xs font-semibold text-brand-300 hover:text-brand-200 whitespace-nowrap"
            >
              Complete <ChevronRight size={14} />
            </motion.button>
            <button onClick={handleDismiss} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
