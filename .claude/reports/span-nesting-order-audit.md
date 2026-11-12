# Audit: span/i/b/u nesting order (todo.txt item 31)

Survey of `clean/baseline/*.htm` and `clean/proposals/*.htm` (the generated
output, not raw `dirty/` source) for cases where `<span>` is nested inside
`<i>`/`<b>`/`<u>` instead of the target convention (span always outermost).

## Counts

| Pattern | baseline (11 files) | proposals (110 files) |
|---|---|---|
| `<span...><i>` (span outer, correct) | 4 | 3 |
| `<i><span` (span inner, needs fixing) | 12 | 3 |
| `<span...><b>` (span outer, correct) | 0 | 2 |
| `<b><span` (span inner, needs fixing) | 0 | 12 (10 of these in [SACCHybridList.htm](../../clean/proposals/SACCHybridList.htm)) |
| `<span...><u>` (span outer, correct) | 0 | 0 |
| `<u><span` (span inner, needs fixing) | 1 | 3 |

`clean/SACCCountryLists.htm`: 3 more `<u><span` cases (table header cells).

## Confirmed-correct examples (span already outermost)

- [SACCBaseline06.htm:1224](../../clean/baseline/SACCBaseline06.htm#L1224) - `<span class="SC1650"><i>Akletos</i></span>`
- [SACCproproster.htm:1894](../../clean/proposals/roster_charts/SACCproproster.htm#L1894) - `<span class="info"><i>Ichthyaetus audouinii</i></span>`

## Simple-swap candidates (span inner, boundaries coincide - safe to reorder)

- [SACCprop175.htm:127](../../clean/proposals/SACCprop175.htm#L127) - `<i><span class="red">Phaetusa simplex</span></i>`
- [SACCHybridList.htm:42](../../clean/proposals/SACCHybridList.htm#L42) - `<b><span class="info">"Troublesome Curassow"</span></b>` (same idiom repeats at lines 56, 60, 64, 68, 76, 299, 758, 772, 780 - 10 total in this one file)
- [SACCCountryLists.htm:146-148](../../clean/SACCCountryLists.htm#L146) - `<u><span class="breeder">Breeding</span></u>`, `<u><span class="endemic">Endemics</span></u>`, `<u><span class="endemicBreeder">Endemic Breeders</span></u>`
- [SACCprop24.htm:23-24](../../clean/proposals/SACCprop24.htm#L23) - `<u><span class="info"><a href="...">http://...</a></span></u>`

## Complication: span wraps MORE than one i/b/u (not a 1:1 wrap)

- [SACCBaseline07.htm:1022](../../clean/baseline/SACCBaseline07.htm#L1022) - `<span class="info">SACC proposal passed to treat <i>baroni</i> as conspecific with <i>antisiensis</i>.</span>` - span is already outer here (fine), but is the ancestor of two separate `<i>` runs, not a paired wrap.
- [SACCprop175.htm:123-125](../../clean/proposals/SACCprop175.htm#L123) - `<span class="red"><i>forsteri</i> Forster's Tern <br> <i>Sterna trudeaui</i> Snowy-crowned Tern <br></span>`

## Complication: PARTIAL overlap - span and i/b/u boundaries don't coincide

These cannot be safely "swapped" - the span covers only part of the other
tag's content (or vice versa), so reordering would change what text is
italicized/bolded/underlined, not just which tag is outermost.

- [SACCBaseline04.htm:1636](../../clean/baseline/SACCBaseline04.htm#L1636) - `<i>Larus belcheri, Larus atlanticus, <span class="speciesname">Leucophaeu</span>s modestus,</i>` - span covers only "Leucophaeu" **mid-word**, inside an `<i>` spanning a three-species list.
- [SACCHybridList.htm:778-779](../../clean/proposals/SACCHybridList.htm#L778) - `<b>...support species rank for <i>zelichi</i>. <span class="info">SACC</span></b>` - the `<b>` wraps several sentences and a separate nested `<i>`; only the tail coincides with a `<span class="info">`.

## Complication: multi-level nesting

- [SACCBaseline06.htm:1237-1238](../../clean/baseline/SACCBaseline06.htm#L1237) - `<span class="SC1650"><i><span class="info">Akletos</span></i></span>` - outer relationship already correct, but the `<i>` still wraps a `<span>` directly beneath it (wrong order one level down).
- [SACCprop111.htm:123](../../clean/proposals/SACCprop111.htm#L123) - `<i><u><span class="red">Reminder -- ...</span></u></i>` - triple nesting, span innermost (fully reversed).
- [SACCBaseline.htm:561-562](../../clean/baseline/SACCBaseline.htm#L561) - `<a href="SACCprop209-211.htm"><i><span class="info">idoneus</span></i></a>` - triple nesting `a > i > span`; `<a>` must stay outermost regardless of how i/span get reordered.
- [SACCproproster.htm:2269-2270](../../clean/proposals/roster_charts/SACCproproster.htm#L2269) - the *same* `class="A7"` span appears twice in one sentence: once correctly outer, once wrongly inner (`<i>` wraps both an `<a>` and a `<span class="A7">`).

## Other wrapping elements found (not i/b/u)

- **`<a>` wrapping `<span>`: 11 occurrences, all in [SACCBaseline.htm](../../clean/baseline/SACCBaseline.htm)** (lines 47, 50, 103, 128, 146, 197, 244, 536, 720, 1259, 1267), all with coincident boundaries (span exactly covers the link text). Example: [SACCBaseline.htm:128](../../clean/baseline/SACCBaseline.htm#L128) - `<a href="SACCHypoList.htm"><span class="info">Hypothetical List</span></a>`.
- `<sup>`, `<sub>`, `<em>`, `<strong>` wrapping `<span>`: **zero occurrences** anywhere in `clean/`.

## Existing reorder logic in the codebase

None. `src/cleanup/inlineTagCleanup.js` and `src/formatting/inlineParagraphs.js`
have merge/flatten/split helpers (`mergeFragmentedItalicParagraphs`,
`consolidateInfoRuns`, `splitMultiCitationInfoSpans`, etc.) but nothing that
reorders nesting - this will be new logic.
