# Combine adjacent .proposalNeeded / .red spans

## Context

In `css/styles.css`, `.proposalNeeded` and `.red` are both `color: red;` - visually
identical. The user spotted one place where these render back-to-back as two
separate spans with no meaningful boundary between them
([SACCBaseline.htm:756-757](../../clean/baseline/SACCBaseline.htm#L756-L757)):

```html
<span class="proposalNeeded">SACC proposal needed to transfer
    <i>Chloephaga melanoptera</i> to</span> <span class="red"><i>Neochen</i></span>.
```

A codebase-wide search (all 13 files containing `.proposalNeeded`, across
`clean/baseline/` and `clean/proposals/`) confirmed this is the **only** instance
of the pattern anywhere in the generated output, and there are no reverse-order
(`.red` then `.proposalNeeded`) cases either.

`clean/*.htm` is pipeline-generated output, not hand-authored - `how to run.txt`
confirms `clean/baseline/*.htm` is built from `dirty/baseline/*.htm` via
`node src/index.js`. A direct edit to the generated file would be silently lost
the next time SACCBaseline.htm is reprocessed (e.g. a future SACC update), so the
fix belongs in the pipeline, not the output.

**Root cause:** In the dirty source
([dirty/baseline/SACCBaseline.htm:14581-14590](../../dirty/baseline/SACCBaseline.htm#L14581-L14590)),
the two red runs are both `<span style='color:red'>`, but Word wrapped the
second one ("Neochen") one level deeper than the first, in its own fresh
`<b><i>` shell:

```html
<b><span style='color:red'>SACC proposal needed to transfer <i>Chloephaga melanoptera</i> to </span></b><b><i style='mso-bidi-font-style:normal'><span style='color:red'>Neochen</span></i></b>
```

`mergeAdjacentSameColorSpans` in
[src/cleanup/wordCleanup.js:678-711](../../src/cleanup/wordCleanup.js#L678-L711)
already exists specifically to merge Word's artificially-split same-color runs
*before* `classifyRedText` (line 652-659) assigns a semantic class - but it only
checks `element.nextSibling`, so it never finds the "Neochen" span since it isn't
a direct sibling of the first span, only of its enclosing `<b>`. The two runs get
classified separately (`proposalNeeded` vs generic `red`) instead of once, as one
phrase.

## Approach

Extend `mergeAdjacentSameColorSpans` (not a new/parallel mechanism) to see
through pure-formatting wrapper elements (`<b>`, `<i>`, `<u>`) on both sides of
the adjacency check, so it finds the true next same-color run regardless of how
deep Word nested it. Once the merge correctly combines the text first,
`classifyRedText` already does the right thing with no changes needed - it will
see "SACC proposal needed to transfer Chloephaga melanoptera to Neochen" as one
phrase and classify it `proposalNeeded`.

### File to modify: `src/cleanup/wordCleanup.js`

Replace the `isWhitespaceOnlyText` through `mergeAdjacentSameColorSpans` block
(current lines 663-711) with:

```js
const isWhitespaceOnlyText = (node, Node) =>
  node?.nodeType === Node.TEXT_NODE && !(node.nodeValue ?? "").trim();

const MERGEABLE_COLORS = new Set(["red", "blue", "fuchsia"]);

// Pure-formatting wrapper tags Word uses around a run without changing its
// color - safe to "see through" when looking for the true next run of a
// mergeable-color span. Deliberately excludes <a> (a hyperlink boundary
// carries its own meaning) and plain <span> (no evidence in the source docs
// that one is ever used as a transparent wrapper the way b/i/u are here).
const PEELABLE_WRAPPER_TAGS = new Set(["B", "I", "U"]);

// Mirrors getSoleSpanChild's "ignore whitespace-only text, is there exactly
// one node left" idiom (src/cleanup/inlineTagCleanup.js), generalized to any
// node type.
const getSoleMeaningfulChild = (element, Node) => {
  const meaningful = [...element.childNodes].filter((n) => !isWhitespaceOnlyText(n, Node));
  return meaningful.length === 1 ? meaningful[0] : null;
};

const isSoleMeaningfulChild = (node, Node) => {
  const parent = node.parentNode;
  return !!parent && getSoleMeaningfulChild(parent, Node) === node;
};

// Word sometimes re-wraps only part of a same-color run in its own extra
// b/i/u shell (e.g. switching italics mid-run re-opens a fresh <b> too), so
// the true "next run" isn't a sibling of the color span itself but of some
// ancestor of it. Walk upward through a chain of pure-formatting wrapper
// elements for as long as `node` is the sole meaningful child of its parent,
// and return the outermost such ancestor. This naturally stops at the first
// parent that either isn't a peelable wrapper tag (e.g. <p>) or has other
// meaningful content, so it can never escape a paragraph or a genuinely
// different run.
const getMergeAnchor = (node, Node) => {
  let anchor = node;
  while (isSoleMeaningfulChild(anchor, Node) && PEELABLE_WRAPPER_TAGS.has(anchor.parentNode.tagName)) {
    anchor = anchor.parentNode;
  }
  return anchor;
};

// Descends from `node` through a chain of pure-formatting wrapper elements
// (mirroring getMergeAnchor's ascent) looking for a single styled span of
// `color` that is the sole meaningful content all the way down. Bails (returns
// null) on any other sibling content, a non-peelable tag, or a span/wrapper
// styled with a different color.
const findWrappedColorSpan = (node, color, Node) => {
  let cursor = node;
  while (true) {
    if (cursor.nodeType !== Node.ELEMENT_NODE) return null;
    const cursorColor = getOriginalColor(cursor);
    if (cursorColor === color) return cursor;
    if (cursorColor || !PEELABLE_WRAPPER_TAGS.has(cursor.tagName)) return null;

    const child = getSoleMeaningfulChild(cursor, Node);
    if (!child) return null;
    cursor = child;
  }
};

// Word occasionally splits one visually-styled run into separate sibling
// <span style="color:..."> elements with only whitespace (or a chain of pure
// -formatting wrapper elements, see PEELABLE_WRAPPER_TAGS) between them - e.g.
// a line-wrap artifact in the source: "SACC proposal" / "badly needed" as two
// spans instead of one. Merge these back together *before* classifying by
// color, so content-dependent rules (like classifyRedText) see the whole
// phrase rather than each fragment in isolation.
const mergeAdjacentSameColorSpans = (document) => {
  const Node = document.defaultView.Node;
  let merges = 0;

  for (const element of [...document.querySelectorAll("[style]")]) {
    if (!element.isConnected) continue; // already absorbed into an earlier merge
    const color = getOriginalColor(element);
    if (!color || !MERGEABLE_COLORS.has(color)) continue;

    while (true) {
      const anchor = getMergeAnchor(element, Node);

      let separator = anchor.nextSibling;
      let next = separator;

      if (isWhitespaceOnlyText(separator, Node)) {
        next = separator.nextSibling;
      } else {
        separator = null;
      }

      if (!next) break;

      const matched = findWrappedColorSpan(next, color, Node);
      if (!matched) break;

      // The matched span may be nested several pure-formatting wrappers deep
      // inside `next` - unwrap only the span itself in place so its
      // now-redundant style/color is discarded, while any structural wrapper
      // around it (e.g. the <i> around a taxon name) is preserved.
      if (matched !== next) matched.replaceWith(...matched.childNodes);

      if (separator) element.appendChild(document.createTextNode(" "));
      while (next.firstChild) element.appendChild(next.firstChild);
      separator?.remove();
      next.remove();
      merges++;
    }
  }

  return {
    message: `Merged ${ merges } adjacent same-color span run${ merges === 1 ? "" : "s" }.`,
    merges,
  };
};
```

Nothing else in `wordCleanup.js` changes - `stripWordFormatting`'s call site and
everything after it (including `classifyRedText` and the classification loop)
stays as-is; the fix works entirely by making the merge step see the adjacency
that was already there.

### Why this is safe (not just for this one case)

- **Can't escape a paragraph**: `getMergeAnchor` only ascends while the parent
  tag is in `PEELABLE_WRAPPER_TAGS` (`B`/`I`/`U`) - `<p>`, `<div>`, `<td>`, etc.
  are never in that set.
- **Can't merge across meaningfully different content**: both the ascent and
  the descent require the node to be the *sole* meaningful child at every
  level (whitespace-only text is ignored, anything else blocks the walk).
- **Can't merge across a differently-colored wrapper**: `findWrappedColorSpan`
  bails if it meets a `color:` that doesn't match the target.
- **Can't merge across a hyperlink**: `<a>` is deliberately excluded from
  `PEELABLE_WRAPPER_TAGS`.
- **Backward-compatible**: when the next run has no wrapper at all (today's
  only working case, e.g. "SACC proposal" / "badly needed"), `findWrappedColorSpan`
  matches immediately and the merge behaves exactly as it does today.

## Verification

1. **Targeted regen + diff** (the working tree already has ~138 unrelated
   pending line changes in this file, so a plain `git diff` would be noisy):
   ```
   cp clean/baseline/SACCBaseline.htm /tmp/before.htm
   node src/index.js SACC1
   git diff --no-index -- /tmp/before.htm clean/baseline/SACCBaseline.htm
   ```
   Confirm the diff shows only the Chloephaga melanoptera / Neochen span
   merging into `<span class="proposalNeeded">...to <i>Neochen</i></span>.`
   and nothing else changes. The console output's
   `Merged N adjacent same-color span run(s).` count should go up by 1.

2. **Full-corpus regression check** (required - this touches shared merge
   logic used for every `MERGEABLE_COLORS` entry across both baseline and
   proposal pipelines):
   ```
   node src/index.js
   node src/proposals.js
   git diff --stat -- clean/
   ```
   Review for any file *other than* `clean/baseline/SACCBaseline.htm` changing,
   and spot-check any that do.

3. **Playwright visual-compare** for at least SACC1, ideally the full set per
   `how to run.txt`:
   ```
   TEST_FILE=SACC1 npx playwright test visual-compare --reporter=list
   ```
   This is the authoritative check that the shared-logic change (affecting
   red/blue/fuchsia merging everywhere, not just this one paragraph) hasn't
   regressed anything elsewhere in the corpus.
