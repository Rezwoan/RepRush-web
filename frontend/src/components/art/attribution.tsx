/**
 * Credit line for the third-party artwork we ship. CC BY 3.0 requires it, so
 * this renders somewhere visible (Profile → About) rather than living only in
 * a repo file. Keep it in sync with `ATTRIBUTIONS.md`.
 */
import { GLYPH_CREDIT } from './game-icons';

export function ArtAttribution({ className }: { className?: string }) {
  return (
    <p className={className}>
      Badge and medal artwork by {GLYPH_CREDIT.authors.join(', ')} via{' '}
      <a href={GLYPH_CREDIT.source} target="_blank" rel="noreferrer" className="underline">
        game-icons.net
      </a>
      , licensed{' '}
      <a href={GLYPH_CREDIT.licenceUrl} target="_blank" rel="noreferrer" className="underline">
        {GLYPH_CREDIT.licence}
      </a>
      . Anatomy from{' '}
      <a
        href="https://www.npmjs.com/package/body-muscles"
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        body-muscles
      </a>{' '}
      (Apache-2.0).
    </p>
  );
}
