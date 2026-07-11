# Rename `class="MsoHyperlink"` to `class="info"` (with automatic run-merging)

## Context

Word tags hyperlink-styled text with `class="MsoHyperlink"`, which the
pipeline currently leaves untouched — there's no CSS rule for it, so it
renders as plain unstyled (black) text today. The user wants these spans
reclassified as `.info` (existing blue-link styling), and — since a single
logical phrase is sometimes split across 2+ separate `MsoHyperlink` spans
around a real `<a>` link — wants the class to span the *whole* run, not just
each fragment individually. Example (`clean/baseline/SACCBaseline07.htm`):

```html
<span class="MsoHyperlink">SACC proposal to change to </span><a href="SACCprop767.htm"><i>desmurii</i></a><span class="MsoHyperlink"> did not pass</span>.
```
should become:
```html
<span class="info">SACC proposal to change to <a href="SACCprop767.htm"><i>desmurii</i></a> did not pass</span>.
```

Scope is small: 16 occurrences across 6 files (both baseline and proposals),
always a bare `class="MsoHyperlink"` with no other attributes — confirmed via
`grep -roh '<span[^>]*MsoHyperlink[^>]*>' clean/` (no variant attribute shapes
exist).

## Key finding: the run-merging is already implemented

`consolidateInfoRuns` (`src/formatting/inlineParagraphs.js:46-113`), which
already runs unconditionally on every paragraph via `collapseInlineParagraphs`
(called for every output file in both pipelines, at final serialization in
`src/pipeline/writeClean.js`), already merges exactly this shape: a run of
`span.info` elements bridged by whitespace or a **bare `<a>` regardless of
its contents** (the "Bare `<a>` bridge" branch, lines 72-78, extends through
*any* `<a>` element speculatively — it doesn't matter that our `<a>` contains
an `<i>`). So simply renaming `MsoHyperlink` → `info` is sufficient; no new
merging logic is needed — the existing mechanism was built generically enough
to already cover this case.

## Approach

Add one small exported function to `src/cleanup/wordCleanup.js`, next to the
other single-purpose span-cleanup functions added this session
(`unwrapSpellCheckSpans`, `stripLangAttribute`, etc.):

```js
export const reclassifyHyperlinkSpans = (document) => {
  const spans = [...document.querySelectorAll("span.MsoHyperlink")];
  for (const span of spans) span.className = "info";
  return { message: `Reclassified ${spans.length} MsoHyperlink span${spans.length === 1 ? "" : "s"} as .info.`, count: spans.length };
};
```

**Wiring**: add to the `cleanupSteps`/`steps` arrays in *both*
`src/proposals.js` and `src/index.js`, anywhere before the final
serialization (any position works since `consolidateInfoRuns` runs last,
unconditionally, in `writeClean.js`) — natural slot is alongside the other
span-cleanup steps added earlier this session (`stripLangAttribute`,
`unwrapAttributelessSpans`, `removeEmptySpans`).

No CSS change needed — `.info { color: blue; }` already exists in
`css/styles.css` and is already inherited by proposals via its `@import`.

## Verification

1. Regenerate `SACCBaseline07.htm` and confirm the exact selected paragraph
   collapses to one `<span class="info">...</span>` wrapping the `<a>`,
   with no stray `MsoHyperlink` or split spans remaining.
2. Run the full corpus (`node src/index.js` + `node src/index.js
   SACCCountryLists` + `node src/proposals.js`) and grep for
   `MsoHyperlink` across `clean/**` — expect zero matches (down from 16).
3. Spot-check one of the other 5 affected files to confirm the merge behaves
   correctly there too (not just the one example shown).

## Status

Implemented and verified in the same session — see
[.claude/reports/missing-href-anchors.md](../reports/missing-href-anchors.md)
for an unrelated follow-up audit done afterward.
