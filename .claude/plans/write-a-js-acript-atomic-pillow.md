# Verify species order: spreadsheet vs. clean baseline

## Context

The SACC species list exists in two independently maintained forms in this repo:

- `spreadsheets/SACCListByCountry 2026-08-18.xlsx` - the country-occurrence
  matrix, one row per species (columns `E` = scientific name, `F` = English
  name), starting at row 4.
- `clean/baseline/SACCBaseline*.htm` - the 11-part cleaned classification,
  where each species is an `<li><i>Scientific name</i> <span
  class="commonName">English name</span> notes</li>` inside a
  `div.familySpeciesList`, produced by
  [familySpeciesList.js](../../src/sacc/familySpeciesList.js).

Both are supposed to be the same list in the same taxonomic order, but nothing
checks that. A drift between them is invisible until someone compares 3500
rows by hand.

A throwaway prototype run during planning confirms the problem is real and
worth a permanent script. Both sides currently hold **exactly 3513 species**,
and scientific names are **unique on both sides**, but they disagree in these
ways:

- Adjacent transpositions - e.g. `Empidonax traillii` / `Empidonax alnorum`
  are swapped between the two sources.
- A multi-species rotation - the `Microspingus` block (spreadsheet rows
  3379-3384) is rotated relative to the HTML.
- One spelling typo - the spreadsheet has `Diglosa melanopis`, the HTML has
  `Diglossa melanopis` (the only set difference between the two name sets).
- An English-name-only swap - `Blue-chested Hummingbird` /
  `Purple-chested Hummingbird` carry each other's common names, which a
  scientific-name-only check would never catch.

The outcome: one command that reports exactly where the two sources disagree,
so the spreadsheet can be reconciled against the classification.

## Approach

Add a single self-contained script plus one small zero-dependency helper. No
new npm packages: the `.xlsx` is unzipped with Node's built-in
`zlib.inflateRawSync`, and the HTML is parsed with `jsdom`, already a
dependency.

### Files to create

| File | Purpose |
| --- | --- |
| `spreadsheets/scripts/readXlsx.js` | Minimal zero-dependency `.xlsx` reader. |
| `spreadsheets/scripts/verifySpeciesOrder.js` | The verification script itself. |

Both follow the existing `scripts/` conventions seen in
[populateKnownDifferences.js](../../scripts/populateKnownDifferences.js):
ESM, a leading `//` usage comment, arrow-function consts.

Add to `package.json` scripts:

```json
"verify-species-order": "node spreadsheets/scripts/verifySpeciesOrder.js"
```

### 1. `spreadsheets/scripts/readXlsx.js` - zero-dependency spreadsheet reader

An `.xlsx` is a ZIP of XML parts. Export `readSheetRows(xlsxPath)` returning
`Map<rowNumber, Record<columnLetter, string>>`.

Steps (all validated against this exact file during planning):

1. Read the file into a Buffer; scan backwards for the End Of Central
   Directory signature `0x06054b50` to get the entry count and central
   directory offset.
2. Walk the central directory entries (signature `0x02014b50`), reading name
   length at `+28`, extra length `+30`, comment length `+32`, compression
   method `+10`, compressed size `+20`, local header offset `+42`.
3. For each entry, jump to its local header and skip `30 + nameLen + extraLen`
   to reach the data; `inflateRawSync` it unless the method is `0` (stored).
4. Parse `xl/sharedStrings.xml` into an array: each `<si>` is the
   concatenation of its `<t>` texts (rich text splits a string across several
   `<t>` runs), with XML entities decoded.
5. Parse `xl/worksheets/sheet1.xml`: for each `<row r="N">`, for each `<c>`,
   take the column letters from `r="A12"` and resolve the value - `t="s"`
   indexes into shared strings, `t="inlineStr"` reads nested `<t>`, otherwise
   use the raw `<v>`.

### 2. `spreadsheets/scripts/verifySpeciesOrder.js` - the check

**Extract the spreadsheet sequence.** From row 4 onward, keep rows where both
`E` and `F` are non-empty, recording `{ row, scientificName, englishName }`.
This cleanly excludes the trailing legend block (rows 3520+, e.g.
`Residents (extant) = X*`), which has an `E` value but no `F`.

**Extract the HTML sequence.** In part order - `SACCBaseline.htm`, then
`SACCBaseline02.htm` through `SACCBaseline11.htm` - parse each with `jsdom`
and take `document.querySelectorAll(".familySpeciesList li")`, keeping those
with a direct-child `<i>` (`li.querySelector(":scope > i")`). Record the `<i>`
text as the scientific name and `span.commonName` text as the English name.
Whitespace is normalized the same way the generator does it (` ` to
space, collapse runs, trim). Also record the 1-based line number of each
species by searching the raw file text for its `<li><i>Name</i>` fragment, so
the report can link to it.

**Normalization for comparison** (per the chosen option, folded silently -
these never appear in the report):

- Curly quotes/apostrophes `U+2018 U+2019 U+02BC U+201C U+201D` to ASCII, and
  `U+2010`-`U+2015` dashes to `-`. The HTML uses `Tschudi's`, the sheet uses
  `Tschudi's`; without folding this alone produces 20 phantom differences.
- Strip a trailing status suffix in parentheses from the HTML common name -
  `(IN)`, `(V)`, `(V?)`, `(NB)`, `(EX)`, `(EX?)`, `(V, IN)`, `(NB, EX?)` -
  since the spreadsheet records status in its own columns, not in the name.
- Compare English names case-insensitively.

**Alignment.** Because scientific names are unique on both sides, use a
longest-increasing-subsequence alignment rather than a quadratic diff:

1. Build `Map<scientificName, xlsxIndex>` from the spreadsheet sequence.
2. Map each HTML entry to its spreadsheet index; unmatched entries are set
   aside.
3. Compute the LIS of that index sequence (patience sorting, O(n log n)).
   Entries on the LIS are in agreeing order; every entry off it is reported as
   **out of order**, with its HTML position and its spreadsheet row.

This is what stops a single insertion from cascading into thousands of bogus
mismatches, which is exactly what a naive index-by-index compare does.

**Classify the leftovers.** For entries that matched no name on the other
side, pair up an HTML-only with a spreadsheet-only entry when their English
names agree after folding, or when their scientific names are within a
Levenshtein distance of 2. Report those as **spelling difference** rather than
as a missing/extra species - this is what turns the `Diglosa`/`Diglossa` case
into one clear finding instead of two misleading ones. Anything still
unpaired is reported as **only in spreadsheet** or **only in baseline**.

**English name check.** For every pair matched by scientific name, compare the
folded English names and report any **name mismatch** - this is the check that
surfaces the `Blue-chested` / `Purple-chested Hummingbird` swap.

### 3. Output

Console: a summary line per category plus the first ~20 findings of each, and
a pointer to the report file.

Report: written to `spreadsheets/species-order-report.md`, regenerated on each
run, with a counts table and one section per category. Links are relative to
the `spreadsheets/` folder, so baseline links need a `../` prefix, e.g.
`[SACCBaseline11.htm:1234](../clean/baseline/SACCBaseline11.htm#L1234)`.
Spreadsheet entries are cited by row number (`row 3379`), since a row in an
`.xlsx` cannot be linked to. Markdown follows the project lint rules - blank
lines around lists and fences, language on every fence.

## Verification

```bash
npm run verify-species-order
```

Expected on the current data, matching the prototype's measurements:

- `3513` species read from each side (the script prints both counts).
- Exactly `1` spelling difference: `Diglosa melanopis` (row 3238) vs
  `Diglossa melanopis`.
- `0` entries only in one source (the only set difference is the pair above).
- Out-of-order findings covering the `Tolmomyias`, `Empidonax`,
  `Piezorina`/`Xenospingus` and `Microspingus` regions.
- English-name mismatches including `Blue-chested` / `Purple-chested
  Hummingbird` and the `Night-Heron` vs `Night Heron` hyphenation pair.

Then confirm the report is trustworthy end-to-end:

1. Open `spreadsheets/species-order-report.md` and click through two or three
   baseline links to confirm each lands on the `<li>` for the named species.
2. Spot-check one finding against the source: `Empidonax traillii` should be
   at spreadsheet row 2664 and after `Empidonax alnorum` in
   `clean/baseline/SACCBaseline08.htm`.
3. Re-run the script - the report must be byte-identical, confirming there is
   no ordering instability in the script's own output.
