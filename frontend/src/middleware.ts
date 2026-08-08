import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Clerk's middleware.
 *
 * **This file is `middleware.ts`, not `proxy.ts`.** `proxy.ts` is the Next 16
 * name for this hook; on Next 14 (what this app runs) a file called `proxy.ts`
 * is never loaded, so the middleware would silently not run and every Clerk
 * helper would fail with "auth() was called but Clerk can't detect usage of
 * clerkMiddleware" — a broken sign-in with no error at the point of the mistake.
 * Rename it if and when this app moves to Next 16.
 *
 * Nothing here *protects* routes. Authorisation in this app is the RepRush JWT
 * checked by the NestJS guards, and the offline shell has to render for a user
 * whose session can only be confirmed once they are back online. Clerk's job
 * stops at proving who someone is at the sign-in screen.
 *
 * With no publishable key configured, `clerkMiddleware()` would throw on every
 * request, so an unconfigured deployment gets a pass-through instead — the
 * password login keeps working and the app is unaffected.
 */
const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default clerkConfigured ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Clerk's auto-proxy path.
    '/__clerk/:path*',
    '/(api|trpc)(.*)',
  ],
};
