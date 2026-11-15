# `<head>` security and metadata audit

Date: 2026-11-14

Scope: the `<head>` emitted for cleaned output pages, using
[clean/baseline/SACCBaseline.htm](../../clean/baseline/SACCBaseline.htm) as the
sample. Every page's head comes from one builder,
[replaceHeadElement](../../src/cleanup/wordCleanup.js#L367) in
`src/cleanup/wordCleanup.js`, so any change made there reaches every baseline
and proposal page.

## Current state

[SACCBaseline.htm:4-9](../../clean/baseline/SACCBaseline.htm#L4-L9):

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="../../css/styles.css">
  <title>A classification of the bird species of South America. Part 1</title>
</head>
```

Survey of the body (this determines what a security policy must allow):

| Feature | Count | Notes |
|---|---|---|
| `<script>` | 0 | No JavaScript anywhere |
| Inline `style=""` / `<style>` | 0 | All styling comes from `styles.css` |
| Inline event handlers (`onclick=` etc.) | 0 | |
| `<form>` | 0 | |
| `<img>` | 4 | All point at `SACCBaseline.fld/`, which is not copied to `clean/` (broken) |
| External links | ~23 | LSU museum, AviList, WorldBirdNames, IOC, BirdLife, CBRO, Bravenet, OmniUpdate |
| `target="_new"` | 2 | Bravenet links, no `rel` attribute |

The page is static and loads nothing from third parties, so it can use a very
strict policy.

## Recommended

### 1. Add a Content-Security-Policy `<meta>` (head)

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'">
```

- **Why:** The policy blocks everything by default and then allows only the
  same-origin stylesheet and same-origin images. If a later Word export brings
  in a `<script>`, an inline handler or a third-party image, the browser
  refuses to run or load it.
- **Placement:** Put it immediately after `<meta charset>` and before
  `<link rel="stylesheet">`. A meta CSP covers only elements parsed after it.
  Charset must stay first because browsers expect it within the first 1024
  bytes.
- **Where:** Insert a new element into the `head.replaceChildren(...)` call in
  [wordCleanup.js:385](../../src/cleanup/wordCleanup.js#L385).
- **Caveat:** Test by opening the output locally over `file://`. Browsers treat
  `'self'` inconsistently for file URLs. If the CSS stops loading in local
  preview, either preview over a local HTTP server or leave the CSP out until
  the files are deployed.

### 2. Remove the Bravenet hit-counter block (body)

This is the most significant finding. It is in the body, not the head.

[SACCBaseline.htm:1543-1550](../../clean/baseline/SACCBaseline.htm#L1543-L1550):

```html
<td class="saccFooter-counter"><img border="0" width="94" height="22" src="SACCBaseline.fld/image002.png"
    alt="ravenet Counter Stats"><a href="http://www.bravenet.com/" target="_new"><img border="0" width="113"
      height="16" src="SACCBaseline.fld/image003.gif" alt="owered by Bravenet"></a><a
    href="http://counter40.bravenet.com/index.php?id=363423&amp;type=overview&amp;usernum=3391039029"
    target="_new"><img border="0" width="113" height="17" src="SACCBaseline.fld/image004.gif"
      alt="iew Statistics"></a></td>
```

Problems:

- **Reverse tabnabbing:** Modern browsers add `noopener` automatically only for
  `target="_blank"`. `_new` is treated as a named window, so the page that
  opens gets a `window.opener` handle back to this page and can redirect it.
- **Account identifier leak:** The counter URL contains the original site's
  Bravenet `id` and `usernum`. Every click sends them to a third party.
- **Already broken:** The `SACCBaseline.fld/` images are not shipped with the
  clean output, so the row shows three broken images.
- **Word export glitch:** All three alt texts are missing their first letter
  ("ravenet", "owered", "iew").

Recommendation: add a cleanup step that removes the whole
`saccFooter-counter` row. As a minimum fallback, add
`rel="noopener noreferrer"` to both links.

## Optional, not security-related

| Element | Purpose | When to add |
|---|---|---|
| `<meta name="description" content="...">` | Search snippets and link previews. Without it, these come from whatever text appears first on the page | If the clean output will be indexed or shared as links |
| `<link rel="canonical" href="http://www.museum.lsu.edu/~Remsen/SACCBaseline.htm">` | Tells search engines that the LSU page is the original, so the copy is not treated as duplicate content | Only if the clean copy is published on a different host. Could be passed in per file like the existing `cssHref` option |
| `<meta name="color-scheme" content="light">` | Stops browsers that darken pages automatically from inverting the tables | Only if `styles.css` does not handle dark mode itself |
| `<link rel="icon" href="data:,">` | Stops the 404 request for `/favicon.ico` | Cosmetic |

A related body cleanup: about 10 links use `http://www.museum.lsu.edu`. One
link already uses `https://www.museum.lsu.edu`, so the HTTPS host works and
those links could be rewritten to use it.

## Not recommended

| Element | Reason |
|---|---|
| `<meta http-equiv="X-UA-Compatible">` | Only affected old Internet Explorer; modern browsers ignore it |
| `X-XSS-Protection` | Deprecated and removed from browsers |
| `<meta name="referrer">` | The browser default (`strict-origin-when-cross-origin`) is already fine for the outbound reference links |
| HSTS, `X-Frame-Options`, CSP `frame-ancestors`, `X-Content-Type-Options`, `Permissions-Policy` | Browsers ignore these in a `<meta>` tag. They only work as HTTP response headers, so they belong in the configuration of whatever server hosts the files |

## Suggested next steps

1. Add the CSP meta to `replaceHeadElement`, between charset and the
   stylesheet link.
2. Add a cleanup step that removes the `saccFooter-counter` row (or at least
   adds `rel="noopener noreferrer"` to its links).
3. Regenerate the outputs and open one page locally to confirm that the CSS
   still loads under the CSP.
4. Decide whether `description` and `canonical` are wanted, based on where the
   clean copy will be hosted.
