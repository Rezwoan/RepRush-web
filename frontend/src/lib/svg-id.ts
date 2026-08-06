import { useId } from 'react';

/**
 * A `useId()` value that is safe inside `url(#…)`.
 *
 * React's `useId` returns strings like `:r3:`. Those are legal HTML ids but the
 * colons are CSS selector syntax, so `url(#:r3:-grad)` is a landmine — it works
 * in some engines and silently drops the fill in others. Stripping the colons
 * keeps the uniqueness guarantee without the ambiguity.
 */
export function useSvgId(prefix = 'rr') {
  return `${prefix}${useId().replace(/:/g, '')}`;
}
