import type { Metadata, Viewport } from 'next';
import { Inter, Sora } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider, themeBootScript } from '@/lib/theme-context';
import { Toaster } from '@/components/ui/toaster';
import OutboxSync from '@/components/layout/outbox-sync';
import { ClerkGate } from '@/components/auth/clerk-gate';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const sora = Sora({ subsets: ['latin'], variable: '--font-display', display: 'swap', weight: ['500', '600', '700', '800'] });

export const metadata: Metadata = {
  title: 'RepRush — Train. Track. Rush.',
  description: 'Track your gym sessions, progress, and compete with your crew.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'RepRush',
  },
};

export const viewport: Viewport = {
  themeColor: '#0462b2',
  width: 'device-width',
  initialScale: 1,
  // No `maximumScale` / `userScalable: false`. They were there to stop
  // double-tap zoom on controls, which `touch-action: manipulation` in
  // globals.css now does properly — blocking pinch zoom outright fails
  // WCAG 1.4.4 and is exactly the person who most needs it.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${sora.variable}`} suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        {/* Sets the theme before first paint so a light theme never flashes dark. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <AuthProvider>
            {/* Clerk sits inside AuthProvider: the bridge that trades a Clerk
                session for a RepRush one needs `useAuth`. Renders nothing at all
                when no publishable key is configured. */}
            <ClerkGate>
              <OutboxSync />
              {children}
              <Toaster />
            </ClerkGate>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
