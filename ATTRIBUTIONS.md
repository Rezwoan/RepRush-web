# Third-party assets

Everything shipped in the app that we did not author, and what its licence asks of us.

| Asset | Where | Licence | Obligation |
|---|---|---|---|
| [game-icons.net](https://game-icons.net/) — badge/medal emblems by **lorc**, **delapouite**, **caro-asercion** | `frontend/src/components/art/game-icons.ts` (path data vendored, background rect stripped) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Visible credit — rendered by `components/art/attribution.tsx` |
| [`body-muscles`](https://www.npmjs.com/package/body-muscles) — anatomical regions | `frontend/src/components/art/bodygraph.tsx` (npm dependency) | Apache-2.0 | Preserve notice |
| [`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db) — exercise catalog | `backend/data/exercises.json` (873 exercises, built by `scripts/build-exercise-catalog.js`); photos hot-linked from jsDelivr at the pinned commit | Unlicense (public domain) | None — credited anyway |

Regenerate the vendored glyphs with `scripts/fetch-game-icons.js`, and the exercise catalog with
`scripts/build-exercise-catalog.js`, if either set ever changes.

Nothing in `inspiration/` and `more_inspiration/` are licensed to us — they are reference only, never copied.
