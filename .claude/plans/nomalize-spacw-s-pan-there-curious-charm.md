# Normalize span/i/b/u/a nesting order (todo.txt item 31)

## Context

Throughout `clean/baseline/*.htm` and `clean/proposals/*.htm`, `<span>`
sometimes wraps `<i>`/`<b>`/`<u>`/`<a>` (the desired convention - span
outermost) and sometimes is wrapped BY them, inconsistently. This is
[todo.txt:177](../../todo.txt#L177) (item 31). The user wants `<span>` to
always end up outermost relative to these four tags.

A full corpus audit (grep survey of the generated `clean/` output) is
written up in
[.claude/reports/span-nesting-order-audit.md](../reports/span-nesting-order-audit.md)
with concrete file:line examples for every case category below. Key
scope numbers: 12 `<i><span>` cases in baseline, 3 in proposals; 12
`<b><span>` cases in proposals (10 in one file, `SACCHybridList.htm`); 4
`<u><span>` cases; 11 `<a><span>` cases (all in `SACCBaseline.htm`).

Two scoping decisions already made with the user:

1. **Only reorder "coincident-boundary" pairs** - where the wrapping tag's
   entire content is exactly one `<span>` (a clean, meaning-preserving
   swap). Cases where a `<span>` covers only *part* of the wrapper's
   content, or the wrapper has other siblings alongside the span (e.g.
   `<i>Larus belcheri, ... <span class="speciesname">Leucophaeu</span>s
   modestus,</i>` - span mid-word inside a three-species-list `<i>`) are
   **skipped and reported**, not restructured - reordering those would
   change what text is italicized/bolded/underlined, not just tag order.
2. **`<a>` is included** in the same rule, alongside `i`/`b`/`u`.

## The algorithm

### Detection

A wrapper element `F` (`i`/`b`/`u`/`a`) qualifies for auto-swap iff its
entire substantive content (ignoring whitespace-only text-node children)
is exactly one element, and that element is a `<span>`:

```js
const isWhitespaceOnlyTextNode = (node, Node) =>
  node.nodeType === Node.TEXT_NODE && !(node.nodeValue ?? "").trim();

const getSoleSpanChild = (formatter, Node) => {
  const substantive = [...formatter.childNodes].filter((n) => !isWhitespaceOnlyTextNode(n, Node));
  if (substantive.length !== 1) return null;
  const [only] = substantive;
  return only.nodeType === Node.ELEMENT_NODE && only.tagName === "SPAN" ? only : null;
};
```

(Verified against every real example in the audit: by the time this step
runs - after `trimFormattingTagWhitespace` etc. - no whitespace-only
text-node siblings actually separate a wrapper from its span in the
current corpus, so this filter is a defensive no-op today, not something
actively exercised. Costs nothing to keep.)

### The swap (real DOM node moves)

```js
const swapFormatterAndSpan = (formatter, span) => {
  const innerNodes = [...span.childNodes];
  span.replaceWith(...innerNodes);   // span's content now lives directly in formatter
  formatter.replaceWith(span);        // the now-empty span takes formatter's place in the tree
  span.appendChild(formatter);        // formatter (still carrying its content) goes inside span
};
```

Traced by hand: `<i><span class="X">TEXT</span></i>` -> after the three
lines -> `<span class="X"><i>TEXT</i></span>`. Attributes on both
elements are preserved (neither is recreated, only relocated).

### Reaching a fixed point for multi-level nesting - single pass, no loop needed

```js
const formatters = [...document.querySelectorAll("i, b, u, a")].reverse();
for (const formatter of formatters) {
  const span = getSoleSpanChild(formatter, Node);   // re-checked live, not from a snapshot
  if (span) { swapFormatterAndSpan(formatter, span); swaps++; continue; }
  if (hasUnswappableSpanChild(formatter)) skipped.push(describe(formatter));
}
```

`querySelectorAll` returns matches in document order (parents before
descendants); reversing gives a valid post-order traversal for any tree
shape, so every element is visited only after all its descendants.
Combined with re-evaluating `getSoleSpanChild` live at visit time (never
from a precomputed snapshot), this correctly cascades through nesting
that needs more than one swap to fully resolve:

- `SACCBaseline06.htm:1237` (`<span class="SC1650"><i><span class="info">Akletos</span></i></span>`):
  only `<i>` is in the formatters list (outer `<span>` isn't a formatter
  tag). One swap gives `<span class="SC1650"><span class="info"><i>Akletos</i></span></span>` -
  the already-correct outer span is untouched.
- `SACCBaseline.htm:561-562` (`<a href="..."><i><span class="info">idoneus</span></i></a>`):
  reversed order visits `i` before `a`. Swapping `i`/span first leaves
  `a`'s only child now a `<span>` - so when `a` is visited next,
  `getSoleSpanChild(a)` (checked live) finds it and swaps again, landing
  on `<span class="info"><a href="..."><i>idoneus</i></a></span>` in the
  same pass.

### Skip-and-report

```js
const hasUnswappableSpanChild = (formatter) =>
  [...formatter.childNodes].some((n) => n.nodeType === n.ELEMENT_NODE && n.tagName === "SPAN");
```

Verified this flags exactly the confirmed non-coincident cases (span
mid-word in a multi-species `<i>`; a `<b>` spanning several sentences
with only its tail matching a span; an `<i>` wrapping both an `<a>` and a
`<span>` as separate siblings) without over-flagging the already-correct
"span is ancestor of two separate `<i>` runs" shape (from the `<i>`'s own
perspective its direct child is plain text, not a span - correctly not
flagged).

Return shape, matching this file's existing `{ message, ...counts }`
convention:

```js
{
  message: `Reordered ${swaps} <span> nestings to be outermost; ${skipped.length} case(s) need manual review.`,
  swaps,
  skipped,   // [{ tag, outerHTML }, ...]
}
```

## Implementation

### 1. New function in `src/cleanup/inlineTagCleanup.js`

Add `normalizeSpanNestingOrder` (plus the private helpers above) at the
end of the file, after `combineAbbreviatedItalicNames` - this module's
existing style (plain jsdom mutation, `document`/`Node` passed in, no
external deps) is followed directly; no new file needed.

### 2. Wire into both pipelines, after `combineAbbreviatedItalicNames`

`src/index.js` (import list + steps array) and `src/proposals.js`
(import list + cleanupSteps array): add `normalizeSpanNestingOrder`
immediately after `combineAbbreviatedItalicNames` in both the import and
the steps array.

**Why exactly this position:**

- Must run after `unwrapAttributelessSpans`/`removeEmptySpans` (already
  earlier in both arrays) so degenerate spans never become candidates -
  already satisfied by any position in the "post clean-up steps" block.
- Must run after `combineAbbreviatedItalicNames` specifically:
  `combineAbbreviatedItalicNames` detects mergeable adjacent italics via
  `italic.nextSibling` - a sibling-chain check
  ([inlineTagCleanup.js:210](../../src/cleanup/inlineTagCleanup.js#L210)).
  If our swap ran first and nested an `<i>` one level deeper inside a new
  `<span>` wrapper, that `<i>`'s `nextSibling` would become `null`
  (it's now `span`'s only child, not a direct sibling anymore), silently
  breaking that merge. Running after avoids this.
- Must run before `convertPartHeaders`/`convertSaccFooter`/etc. - none of
  those depend on span/i/b/u/a nesting shape, confirmed by checking every
  combinator-sensitive selector in `src/sacc/*.js` (only
  `saccFooter.js`'s `p > a[href]`, unaffected since footer links are
  never span-wrapped in the source).

### 3. Surface skipped cases in the console output

In both files' per-file result loop, alongside the existing
`if (result?.message) console.log(result.message);`, add:

```js
if (result?.value?.skipped?.length) {
  for (const item of result.value.skipped) console.log(`  - needs manual review: <${ item.tag }> ${ item.outerHTML }`);
}
```

## CSS cascade risk - checked, none found

Grepped all four stylesheets for any bare `i`/`b`/`u` selector or the
specific classes on the swap candidates (`.info`, `.red`, `.SC1650`,
`.speciesname`, `.A7`, `.breeder`/`.endemic`/`.endemicBreeder`,
`.resolvedProposal`, `.citedProposal`):

- No bare `i`/`b`/`u` element selector sets `color` anywhere in the
  project's CSS - so wrapping a colored span with any of these is always
  safe (the wrapper has no color of its own to conflict with).
- `<a>` does set its own color (`a:link`/`a:visited` in
  [css/styles.css:13-14](../../css/styles.css#L13)), the one wrapper with
  real cascade potential - but this is already pre-empted:
  `.info a`/`.resolvedProposal a`/`.pendingProposal a` rules
  ([styles.css:17-28](../../css/styles.css#L17)) are defined after
  `a:visited` and tie on specificity, so they already win regardless of
  whether `<a>` ends up inside or outside the span - confirmed these
  rules predate this task (they already handle the many pre-existing
  "span outer, `<a>` inner" cases elsewhere).
- `.A7`, `.SC1650`, `.speciesname`, `.citedProposal` have zero CSS rules
  at all - no cascade interaction possible.

One non-corruption edge case worth a spot-check rather than pre-solving:
`stripFormatterSpaces` pattern 3 in
[writeClean.js](../../src/pipeline/writeClean.js) assumes `<u>` stays
outer for a punctuation-only `<u><span>*</span></u>` shape - no real
corpus example of this exact shape was found, so worst case is a stray
space surviving near punctuation, not data corruption.

## Verification

1. Implement the function, wire it in, add the console logging.
2. Regenerate:

   ```bash
   node src/index.js
   node src/index.js SACCCountryLists
   node src/proposals.js
   ```

3. Manual spot-checks against the concrete examples in the audit report:
   - `clean/baseline/SACCBaseline06.htm:1237` (and the `Percnostola` case
     a few lines below) - inner pair swapped, outer untouched.
   - `clean/baseline/SACCBaseline.htm:561-562` - double-swap cascade
     landed correctly (`<span class="info"><a ...><i>idoneus</i></a></span>`).
   - `clean/proposals/SACCHybridList.htm` lines 42/56/60/64/68/76/299/758/772/780 -
     all 10 become span-outer.
   - `clean/SACCCountryLists.htm:146-148` - the three `<u><span>` header
     cells swap, and `#speciesListTable` still renders correctly.
   - `clean/baseline/SACCBaseline04.htm:1636` and
     `clean/proposals/SACCHybridList.htm:778-779` - confirm **unchanged**
     (still wrapper-outer) and listed in the run's console output as
     needing manual review.
   - `clean/proposals/roster_charts/SACCproproster.htm:2269-2270` - the
     correctly-outer `class="A7"` span untouched; the wrongly-inner one
     reported, not silently swapped (its `<i>` has two substantive
     children, not a sole span).
4. Run tests, using the same `git stash` differential technique proven in
   the prior whitespace-normalization task (there is still no
   `tests/known-differences/proposals/` allowlist, so proposal-stem
   failures must be compared against a HEAD-baseline regen, not assumed
   to be regressions):

   ```bash
   TEST_FILE=SACC1,SACC2,SACC3,SACC4,SACC5,SACC6,SACC7,SACC8,SACC9,SACC10,SACC11,SACCCountryLists npx playwright test visual-compare --reporter=list
   TEST_FILE=SACCHybridList,SACCprop175,SACCprop24,ACCprop857 npx playwright test visual-compare --reporter=list
   ```

   A pure nesting-order swap should be invisible to both checks (same
   text, same color per the CSS analysis above) - confirm this by running
   clean rather than assuming it, and diff against a `git stash`-based
   HEAD rerun for any failure that does show up.

## Critical files

- [src/cleanup/inlineTagCleanup.js](../../src/cleanup/inlineTagCleanup.js) - new `normalizeSpanNestingOrder` function
- [src/index.js](../../src/index.js) - baseline + country-lists wiring
- [src/proposals.js](../../src/proposals.js) - proposals wiring
- [tests/visual-compare.spec.js](../../tests/visual-compare.spec.js) - verification
- [.claude/reports/span-nesting-order-audit.md](../reports/span-nesting-order-audit.md) - full corpus audit with file:line examples
- [todo.txt:177](../../todo.txt#L177) - originating task item (mark done once verified)
