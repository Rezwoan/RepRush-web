'use client';
import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Should idle decoration (SMIL sheens, orbiting sparks, ray halos) run?
 *
 * The mount gate is not optional. `useReducedMotion` reads a media query, which
 * the server cannot see: it renders `false` there, so on a machine that *does*
 * prefer reduced motion the client's first render disagrees with the server's
 * HTML — React then throws the whole root away and re-renders on the client.
 * That is a real hydration failure, not a warning; it appeared the moment the
 * badges started emitting `<animate>` conditionally.
 *
 * So: no motion until after mount, then whatever the user actually asked for.
 * Anything that only affects a framer `transition` can read `useReducedMotion`
 * directly — transitions never appear in the server HTML.
 */
export function useIdleMotion(enabled = true) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return enabled && mounted && !reduced;
}
