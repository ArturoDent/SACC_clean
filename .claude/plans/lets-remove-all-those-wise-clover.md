# Broaden `.citedProposal` reclassification to accept `.html` typos

## Context

`CITED_PROPOSAL_LINK_RE` in `src/formatting/inlineParagraphs.js:227`
currently requires the link to end in `.htm` exactly. Some proposal links in
the dirty source have a `.html` typo (e.g. `SACCprop509.html` in
`SACCBaseline04.htm`), so those citation spans stay `.info` instead of
`.citedProposal`. 5 such links found across 4 baseline files
(`SACCBaseline04.htm` ×2, `05`, `10`, `11` ×1 each).

## Implementation

**File**: `src/formatting/inlineParagraphs.js:227` — make the extension
optional-`l`, matching the same `\.html?` tolerance already used elsewhere in
this codebase for the same typo (e.g. `CITATION_LINK_RE` two lines above it,
line 127):

```js
const CITED_PROPOSAL_LINK_RE = /(?:^|\/)(SACCprop\d+(?:[-+]\d+)?\.html?)$/i;
```

No other changes needed — `reclassifyCitedProposalSpans` already uses this
regex as-is for both matching and extracting the class-triggering link.

## Verification

1. Regenerate: `node src/index.js`.
2. Confirm the SACCprop509.html example (`SACCBaseline04.htm`, "16e...")
   now shows `class="citedProposal"`.
3. `grep -c 'href="SACCprop[0-9]*\.html"' clean/baseline/*.htm` combined with
   a check that each such link's containing span is now `.citedProposal`,
   not `.info`.
