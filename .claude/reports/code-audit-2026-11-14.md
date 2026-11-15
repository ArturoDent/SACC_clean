# Code audit: bugs and optimizations (14 Nov 2026)

Scope: `src/`, `scripts/`, `tests/`, `spreadsheets/scripts/`, `package.json`, git setup.
Method: read every module, rebuilt all 12 baseline outputs and all 109 proposals
(both match the committed files byte for byte after line-ending normalization),
profiled the pipeline per step on the smallest and largest parts, and ran the
Playwright suite for part 2.

## Bugs

### 1. Broken regex character class in `stripFormatterSpaces` (pattern 5b)

[writeClean.js:140](../../src/pipeline/writeClean.js#L140)

The class is literally `["$1$2"<right double quote><right single quote>]`. The
`$1$2` is a template-string slip, so the class matches `"`, `$`, `1`, `2` and the
two RIGHT-hand curly quotes. Two consequences:

- The case the comment documents (a span ending in a LEFT curly quote followed
  by wrapped text) can never match, because only the right-hand quotes are in the class.
- Any span whose text ends in `1`, `2` or `$` followed by whitespace and a letter
  gets the space deleted (`Part 2</span> Species` becomes `Part 2</span>Species`).
  No instance exists in the current output, but it is one source edit away.

Fix: `["\u201c\u2018]` (straight quote plus left curly double and single quotes).

### 2. Duplicate color mapping makes the `infraclass` branch unreachable

[wordCleanup.js:891](../../src/cleanup/wordCleanup.js#L891) and
[wordCleanup.js:897](../../src/cleanup/wordCleanup.js#L897)

`#92CDDC` maps to `vagrant` first, so the later `infraclass` branch is dead code.
The source data agrees with `vagrant` (81 occurrences are the literal "V" plus
vagrant common names). Delete the second branch; if infraclass text has its own
color it is not `#92CDDC` (no other candidate color was found in `dirty/`).

### 3. CLI fallback path uses `.html` but every dirty file is `.htm`

[index.js:76](../../src/index.js#L76)

`node src/index.js SACCHybridList` resolves to `dirty/SACCHybridList.html`,
which does not exist, and the run dies with a raw `ENOENT` stack trace because
[createCleanHtml.js:45](../../src/pipeline/createCleanHtml.js#L45) does not
catch read errors. Use `.htm` and report a missing source file per stem instead
of aborting the whole batch.

### 4. Stem matching is case-insensitive in one place and case-sensitive in another

[index.js:65](../../src/index.js#L65) accepts `sacc1` or `SACC01` via `/^SACC(\d+)$/i`,
but [index.js:142-144](../../src/index.js#L142-L144) compares `stem === "SACC1"`,
so `node src/index.js sacc1` cleans part 1 but silently skips
`convertMembershipSection`. Canonicalize the stem to `SACC${n}` inside `resolveStem`.

### 5. Proposal-link harvester still scans the old baseline location

[harvestProposalLinks.js:71](../../scripts/harvestProposalLinks.js#L71)

It reads `dirty/SACC*.html`; the baseline parts now live in
`dirty/baseline/SACCBaseline*.htm`. The script prints
`After dirty/SACC*.html: 0 unique links` and only the roster/chart pages
contribute, so proposals cited only in the baseline are no longer harvested.

### 6. No `<!DOCTYPE html>` in any clean file (quirks mode)

[wordCleanup.js:413](../../src/cleanup/wordCleanup.js#L413)

Word's export has no doctype and `replaceHtmlElement` does not add one, so every
clean page (baseline, proposals, country lists) renders in quirks mode in every
browser, including the Playwright comparison runs. Insert
`document.implementation.createDocumentType("html", "", "")` before
`documentElement`; `dom.serialize()` then emits `<!DOCTYPE html>`.

### 7. Every pipeline run marks all clean files as modified in git

The pipeline writes LF, `core.autocrlf` is `true`, and there is no
`.gitattributes`. After a rebuild `git status` lists all 12 baseline outputs as
modified and prints "LF will be replaced by CRLF" warnings, even though
`git diff` is empty and `git ls-files --eol` shows `i/lf w/lf`. Real changes are
hidden in that noise. Add a `.gitattributes`:

```gitattributes
* text=auto eol=lf
```

then run `git add --renormalize .` once.

## Performance

Measured on `SACCBaseline06.htm` (842 KB). The whole baseline run takes 1m51s;
`SACC4` (1.2 MB) alone takes 9.2s.

| Step | Current | Alternative |
| --- | --- | --- |
| `replaceHtmlElement` (new `<html>`, move head and body) | 2298 ms | mutate attributes of the existing `<html>` in place: 1 ms |
| `replaceHeadElement` (`replaceChild` with new `<head>`) | 1155 ms | `head.replaceChildren(...)`: 1 ms |
| jsdom parse | 1519 ms | inherent |
| `collapseBlankLinesInHtml` | 370 ms | see item 11 |
| `stripWordFormatting` | 254 ms | fine |
| `collapseInlineParagraphs` | 232 ms | fine |

### 8. `replaceHtmlElement` re-inserts the entire document

[wordCleanup.js:413-441](../../src/cleanup/wordCleanup.js#L413-L441)

Moving `<body>` into a new `<html>` makes jsdom run insertion steps on every
descendant (hundreds of thousands of nodes). Removing the old attributes from
`document.documentElement` and setting `lang` achieves the same output.

### 9. `replaceHeadElement` detaches and re-attaches `<head>`

[wordCleanup.js:463-497](../../src/cleanup/wordCleanup.js#L463-L497)

Same cause. `document.head.replaceChildren(meta, meta, link, title)` keeps the
element and costs about a millisecond.

Together, items 8 and 9 are roughly 35 to 40 percent of the wall time on large parts.

### 10. Files are processed one at a time in one process

[index.js:96](../../src/index.js#L96)

The work is CPU-bound and the parts are independent. Spawning one worker per
part (`worker_threads`, or `child_process` with a concurrency limit equal to the
core count) should bring the full run from about two minutes to well under 30s,
especially combined with items 8 and 9.

### 11. Overlapping whitespace classes in the blank-line regexes

[writeClean.js:180-191](../../src/pipeline/writeClean.js#L180-L191)

`\s*\n+\s*` lets the engine try many splits on long whitespace runs. Low
priority (370 ms on the largest file); `[ \t]*\n(?:[ \t]*\n)*[ \t]*` is linear.

## Dead and duplicate code

### 12. Unused or unreachable code

- [wordCleanup.js:363](../../src/cleanup/wordCleanup.js#L363) `stripEmptyLines` is a byte-for-byte copy of `stripComments` and is never called.
- [wordCleanup.js:1003](../../src/cleanup/wordCleanup.js#L1003) `removeWhitespaceBetweenBlocks` is never called.
- [getNode.js](../../src/helpers/getNode.js) is never imported.
- [createCleanHtml.js:11](../../src/pipeline/createCleanHtml.js#L11) `ensureStylesheet` is never called; the `writeFile` import is unused.
- [saccPageLinks.js:2](../../src/sacc/saccPageLinks.js#L2) imports `pageLinkHTML` but never uses it.
- [inlineParagraphs.js:325](../../src/formatting/inlineParagraphs.js#L325) `normalizePunctuationSpacing` requires two or more spaces, but runs right after `collapseTextNodeWhitespace` has reduced every run to one space, so it can never match.
- [orderPhylogeny.js:32](../../src/sacc/orderPhylogeny.js#L32) the `suborder` branch is unreachable per the comment a few lines below.
- [wordCleanup.js:867](../../src/cleanup/wordCleanup.js#L867) `colorClass` is assigned and never read.
- [saccPartHeaders.js:23](../../src/sacc/saccPartHeaders.js#L23) emits class `part`, which no stylesheet references; conversely `.saccFooter-nextPart` in `css/styles.css` is never emitted.

### 13. Copy-pasted helpers

- `normalizeText` is defined separately in `wordCleanup.js`, `saccPageLinks.js`, `saccFooter.js`, `familySpeciesList.js`, `citedText.js` and `proposalHeader.js` (two of them differ in how they treat U+00A0).
- `unwrapSpellCheckSpans`, `unwrapGramESpans`, `unwrapSpeciesnameSpans`, `unwrapAttributelessSpans` and `removeDivWrapper` are the same loop with a different selector. One `unwrapAll(document, selector, label)` would replace about 80 lines.
- `removeEmptySpans` and `removeEmptyBoldTags` differ only in tag name.

### 14. Invisible non-ASCII character in a regex

[saccPartHeaders.js:4](../../src/sacc/saccPartHeaders.js#L4)

`.replace(/ /g, " ")` contains a literal U+00A0 that looks like a space. It works
today, but the comment at the top of
[verifySpeciesOrder.js:25](../../spreadsheets/scripts/verifySpeciesOrder.js#L25)
describes exactly this class of bug. Use `\u00a0`.

### 15. `package.json`

[package.json](../../package.json)

- `path` and `url` in `devDependencies` are npm packages that do nothing here: a bare `import path from "path"` always resolves to the Node builtin, so they are dead weight.
- There are npm scripts for the download and verify helpers but none for the two main pipelines or the tests (`clean:baseline`, `clean:proposals`, `test`).

### 16. Root clutter

`_audit_info_spans.mjs`, `_tmp_find.mjs`, `test.html` (41 bytes), `test.md`
(empty), `designMode.html` (200 KB), `.htaccess1`, `various.txt` and
`various changes.txt` sit at the repo root. `experiments/` already exists for this.

### 17. Step failures are reported but not surfaced

[createCleanHtml.js:63-74](../../src/pipeline/createCleanHtml.js#L63-L74) and
[index.js:148-153](../../src/index.js#L148-L153)

A step that throws is logged as one line among about 30 "succeeded" lines and the
process exits 0. Writing failures to stderr and exiting non-zero would make them
visible in a long run. Across the 109 proposals the run also prints 315
"needs manual review" lines to the console; a file would be easier to work from.

## Test run (part 2)

5 of 6 tests pass. The failing color test reports four items:

- Three are near-fuchsia variants (`#FF00FB`) that the pipeline deliberately normalizes to `.pendingProposal`; the test could accept the class color as a match for any color `isFuchsiaVariant` accepts.
- "track down" is colored `#BFBFBF` (light gray) in the source: an editorial aside inside angle brackets, which `todo.txt` item 15 already tracks. The gray is unmapped so it comes out black.

## Checked and found correct

- Output is deterministic and current: all 12 baseline files, `SACCCountryLists.htm` and all 109 proposals rebuild identical to the committed versions.
- The jsdom `error.type !== "css-parsing"` check in `createDom` matches jsdom 28's actual type string.
- `combineAbbreviatedItalicNames` assigns `textContent`, which would flatten nested markup, but across all baseline files and 40 proposals every one of its 1016 merges involves plain-text italics only.
- No lowercase hex colors exist in `dirty/`, so the case-sensitive color comparisons are safe for the current data.

## Applied (branch `optimize`, 14 Nov 2026)

Everything above except the test tweak and the unmapped gray aside was applied.
After the changes, all 122 outputs (11 baseline parts, the country list, 110
proposals) differ from the previously committed files by exactly one line each:
the new `<!DOCTYPE html>`.

| Run | Before | After |
| --- | --- | --- |
| `node src/index.js` (11 parts) | 1m51s | 10.7s |
| `node src/proposals.js` (110 files) | about 3m | 28s |

One surprise surfaced while verifying: adding the doctype moves jsdom from
quirks mode to standards mode, and in quirks mode class selectors match
case-insensitively. Part 4 has three `class=grame` spans next to the usual
`class=GramE`, which the old `span.GramE` selector only matched by accident.
Every selector for a Word class name now uses the explicit case-insensitive
form, `[class~="GramE" i]`, so the behavior no longer depends on parse mode.

Other notes from applying:

- `scripts/harvestProposalLinks.js` now scans `dirty/baseline/*.htm`.
- Batch runs fan out to one child process per file (`src/pipeline/runParallel.js`); `SACC_SERIAL=1` forces the old single-process path for profiling.
- Step failures and unreadable sources go to stderr and set a non-zero exit code; `node src/index.js SACCNope` now prints one line and exits 1 instead of a stack trace.
- `normalizeText` lives in `src/helpers/text.js`; the five unwrap loops share `unwrapAll`; the root leftovers moved to `experiments/root-leftovers/`.
- `.gitattributes` normalizes to LF so rebuilds no longer dirty `git status`.
