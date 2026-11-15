// @ts-check
import { normalizeText } from "../helpers/text.js";

export const isBlankElement = (element) => {
  if (!["P", "DIV"].includes(element.tagName)) return false;
  // a[href] (not bare <a>) so Word's nameless bookmark anchors (<a name="...">,
  // used for internal cross-references, no visible text) don't block blank detection.
  if (element.querySelector("hr, img, table, ul, ol, li, a[href]")) return false;

  return normalizeText(element.textContent ?? "") === "";
};

// Word's way of bordering a run of one or more paragraphs: wrap them in a div
// carrying the real CSS border, while each paragraph itself gets border:none
// plus an mso-border-*-alt hint that only Word itself honors.
const isParaBorderDiv = (element) =>
  element.tagName === "DIV" &&
  (element.getAttribute("style") ?? "").toLowerCase().includes("mso-element:para-border-div");

// Which edges of a para-border-div actually draw a rule (e.g. "border-bottom:solid windowtext 1.5pt").
// Word emits "border:none" first and then the one real edge, so only explicit non-none edges count.
const getBorderedEdges = (element) => {
  const style = (element.getAttribute("style") ?? "").toLowerCase();
  const edges = [];

  for (const edge of ["top", "bottom"]) {
    const match = style.match(new RegExp(`border-${ edge }\\s*:\\s*([^;]+)`));
    if (match && !/^\s*none\b/.test(match[1])) edges.push(edge);
  }

  return edges;
};

const isLineSeparator = (element) => {
  if (!["P", "DIV", "HR"].includes(element.tagName)) return false;
  if (element.tagName === "HR") return true;
  if (element.querySelector("hr")) return true;

  // Most para-border-divs wrap a single blank paragraph and are purely a rule. One that
  // wraps real content (text, images, links) is not a separator: simplifyLineSeparators
  // unwraps it instead, so its content survives, and keeps the rule where the border was.
  if (isParaBorderDiv(element)) return isBlankElement(element);

  return /^_+$/.test(normalizeText(element.textContent ?? ""));
};

const isCenteredElement = (element) => {
  const align = element.getAttribute?.("align")?.toLowerCase();
  const style = element.getAttribute?.("style")?.toLowerCase() ?? "";

  return align === "center" || style.includes("text-align:center");
};

// Word leaves stray empty bookmark elements (<a name>, <span style="mso-bookmark:...">)
// between header paragraphs; they carry no visible content and shouldn't end a header run.
export const isIgnorableElement = (element) => {
  if (["P", "DIV"].includes(element.tagName)) return false;
  return normalizeText(element.textContent ?? "") === "";
};

// Collects the leading run of centered (and interleaved blank) elements at the top of
// the body — the title/header block common to both the main SACC banner and proposal headers.
export const collectLeadingCenteredBlock = (document) => {
  const container = document.querySelector("body > div") ?? document.body;
  const elements = [];

  for (const element of [...container.children]) {
    if (isCenteredElement(element) || (elements.length && isBlankElement(element))) {
      elements.push(element);
      continue;
    }
    if (elements.length && isIgnorableElement(element)) continue;
    if (elements.length) break;
  }

  return elements;
};

const replaceWithSimpleElement = (document, element, tagName) => {
  const replacement = document.createElement(tagName);
  element.replaceWith(replacement);
};

const unwrapElement = (element) => {
  element.replaceWith(...element.childNodes);
};

// Unwraps every element matching `selector` (optionally only those passing
// `filter`), keeping its children in place. Returns how many were unwrapped.
const unwrapAll = (document, selector, filter = () => true) => {
  const elements = [...document.querySelectorAll(selector)].filter(filter);
  for (const element of elements) unwrapElement(element);
  return elements.length;
};

// Removes elements of `tagName` that have no element children and no text at
// all; ones holding only whitespace are collapsed to that whitespace as plain
// text, since it may be the sole separator between adjacent inline elements.
const removeEmptyElements = (document, tagName) => {
  const elements = [...document.querySelectorAll(tagName)].filter((element) => element.childElementCount === 0);
  let removed = 0;
  let collapsed = 0;

  for (const element of elements) {
    const text = element.textContent ?? "";
    if (!text) {
      element.remove();
      removed++;
    } else if (!text.trim()) {
      element.replaceWith(document.createTextNode(text));
      collapsed++;
    }
  }

  return { removed, collapsed };
};

const plural = (n, noun) => `${ n } ${ noun }${ n === 1 ? "" : "s" }`;

// Word's class names are not consistently cased in the sources (part 4 has
// class=grame next to class=GramE). The dirty files have no doctype, so jsdom
// used to parse them in quirks mode, where class selectors happen to match
// case-insensitively; now that replaceHtmlElement adds a doctype up front we
// are in standards mode and have to ask for that explicitly.
const wordClass = (tag, className) => `${ tag }[class~="${ className }" i]`;

const removeEmptyTextSiblingsAfter = (node) => {
  let sibling = node.nextSibling;

  while (sibling && sibling.nodeType === sibling.TEXT_NODE && !normalizeText(sibling.nodeValue ?? "")) {
    const nextSibling = sibling.nextSibling;
    sibling.remove();
    sibling = nextSibling;
  }
};


/// <reference types="jsdom" />
/** @param {Document} document */
export const stripSpans = (document) => {
  const spans = [];

  // Get the jsdom window (NodeFilter lives here)
  const w = document.defaultView;
  if (!w || !w.NodeFilter) {
    throw new Error("No DOM window/NodeFilter available on document.defaultView");
  }

  // Walk only elements (use an element root if you can for speed)
  const walker = document.createTreeWalker(
    document,                     // root
    w.NodeFilter.SHOW_ELEMENT,    // whatToShow bitmask
    null                          // filter
  );

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!(node instanceof w.HTMLElement)) continue; // narrow to Element

    // if (node.tagName === "SPAN" && !node.textContent) spans.push(node);

    if (node.tagName === "SPAN") {
      const style = node.style; // JSDOM parses inline CSS automatically

      if (node.classList && node.classList.contains("commonName")) {
        continue;
      }

      else if (style && style.color) {
        const color = style.color.trim().toLowerCase();

        const isBlack =
          color === "black" ||
          color === "#000" ||
          color === "#000000" ||
          color === "rgb(0, 0, 0)" ||
          color === "rgba(0, 0, 0, 1)";

        if (isBlack) {
          spans.push(node);
          continue;
        }
      }
    }

    // tagName is uppercase in DOM; classList is safer than className
    // collect SPANs that do NOT have the "commonName" class
    // if (node.tagName === "SPAN" && !(node.classList && node.classList.contains("commonName"))) {
    //   spans.push(node);
    // }
  }

  for (const span of spans) {
    const parent = span.parentNode;
    if (!parent) continue;

    // Move children out of the span into the parent at the span's position
    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span);
    }
    parent.removeChild(span);
  }

  return {
    message: `Removed ${ spans.length } span node${ spans.length === 1 ? "" : "s" }.`,
    removals: spans.length,
  };
};


// Word wraps whatever its spell-checker flags in <span class="SpellE">, purely as
// an editing aid — it carries no styling or meaning in the cleaned output.
export const unwrapSpellCheckSpans = (document) => {
  const removals = unwrapAll(document, wordClass("span", "SpellE"));
  return { message: `Removed ${ plural(removals, "SpellE span") }.`, removals };
};

export const unwrapGramESpans = (document) => {
  const removals = unwrapAll(document, wordClass("span", "GramE"));
  return { message: `Removed ${ plural(removals, "GramE span") }.`, removals };
};

// Word's own leftover markup around genus/species names, present in the dirty
// source of parts 3 and 4. Carries no CSS rule here or on the live site, and
// sometimes splits a name mid-word across two spans (e.g. "Leucophaeu"/"s"),
// which then survives later formatting-tag cleanup as a visible split. Unwrap
// it unconditionally, same as GramE/SpellE above.
export const unwrapSpeciesnameSpans = (document) => {
  const removals = unwrapAll(document, wordClass("span", "speciesname"));
  return { message: `Removed ${ plural(removals, "speciesname span") }.`, removals };
};

// Word's `lang`/`mso-ansi-language` markup only ever fed its own spell-checker —
// it carries no meaning in the cleaned output. Scoped to <body> so the deliberate
// <html lang="en"> set by replaceHtmlElement is left alone.
export const stripLangAttribute = (document) => {
  const elements = [...document.body.querySelectorAll("[lang]")];

  for (const element of elements) {
    element.removeAttribute("lang");
  }

  return {
    message: `Removed lang attribute from ${ elements.length } element${ elements.length === 1 ? "" : "s" }.`,
    removals: elements.length,
  };
};

// A span that carried only `lang` (or similar) becomes attribute-less once that's
// stripped — unwrap it globally rather than relying on collapseInlineParagraphs's
// per-paragraph pass, which skips paragraphs containing block-level children.
export const unwrapAttributelessSpans = (document) => {
  const removals = unwrapAll(document, "span", (span) => span.attributes.length === 0);
  return { message: `Unwrapped ${ plural(removals, "attribute-less span") }.`, removals };
};

// Word's own hyperlink-styling class carries no CSS rule in this project, so it
// renders unstyled today — reclassify as .info (existing blue link styling).
// consolidateInfoRuns (src/formatting/inlineParagraphs.js) already merges runs
// of adjacent .info spans bridged by a bare <a>, so this alone is enough to
// collapse a phrase split across multiple MsoHyperlink fragments into one span.
// The live site's own absolute URL and the project's relative form both work,
// but are used inconsistently in the source - normalize to the short relative
// form, matching most other SACCprop links already in this document. Scoped
// to "SACCprop<digits>.htm" and combined-citation forms like "214-218" or
// "373+374" (no letter suffix, no ".html") to avoid touching forms this
// pattern can't confirm.
const SACCPROP_ABSOLUTE_LINK_RE = /^https?:\/\/www\.museum\.lsu\.edu\/(?:~|%7E)Remsen\/(SACCprop\d+(?:[-+]\d+)?\.htm)$/i;

export const shortenSaccPropLinks = (document) => {
  const links = [...document.querySelectorAll("a[href]")]
    .filter((a) => SACCPROP_ABSOLUTE_LINK_RE.test(a.getAttribute("href") ?? ""));

  for (const a of links) {
    const shortHref = a.getAttribute("href")?.match(SACCPROP_ABSOLUTE_LINK_RE)?.[1];
    if (shortHref) a.setAttribute("href", shortHref);
  }

  return {
    message: `Shortened ${ links.length } absolute SACCprop link${ links.length === 1 ? "" : "s" } to relative form.`,
    count: links.length,
  };
};

export const reclassifyHyperlinkSpans = (document) => {
  const spans = [...document.querySelectorAll(wordClass("span", "MsoHyperlink"))];

  for (const span of spans) span.className = "info";

  return {
    message: `Reclassified ${ spans.length } MsoHyperlink span${ spans.length === 1 ? "" : "s" } as .info.`,
    count: spans.length,
  };
};

// Global safety net for fully-empty spans (any attributes) left behind after
// other cleanup steps strip their content — e.g. Word's <span class="MsoHyperlink">
// markers. Whitespace-only content is preserved as plain text since it may be the
// sole separator between adjacent inline elements.
export const removeEmptySpans = (document) => {
  const { removed, collapsed } = removeEmptyElements(document, "span");
  return {
    message: `Removed ${ plural(removed, "empty span") } and collapsed ${ plural(collapsed, "whitespace-only span") } to text.`,
    removed,
    collapsed,
  };
};

// Same as removeEmptySpans, but for <b> — only relevant where bold is preserved
// rather than unwrapped (proposals pipeline): a <b> wrapping only Word's <o:p>
// paragraph-mark placeholder ends up with nothing left inside once that's
// stripped, since nothing else targets bold tags specifically.
export const removeEmptyBoldTags = (document) => {
  const { removed, collapsed } = removeEmptyElements(document, "b");
  return {
    message: `Removed ${ plural(removed, "empty <b> tag") } and collapsed ${ plural(collapsed, "whitespace-only <b> tag") } to text.`,
    removed,
    collapsed,
  };
};

export const stripComments = (document) => {
  const comments = [];
  const walker = document.createTreeWalker(document, document.defaultView.NodeFilter.SHOW_COMMENT);

  while (walker.nextNode()) {
    comments.push(walker.currentNode);
  }

  for (const comment of comments) {
    comment.remove();
  }

  return {
    message: `Removed ${ comments.length } comment node${ comments.length === 1 ? "" : "s" }.`,
    removals: comments.length,
  };
};

// Word's export has no doctype, which puts every browser into quirks mode.
// Mutate the existing <html> in place rather than building a new one and moving
// <head>/<body> into it: jsdom runs its insertion steps on every descendant of a
// moved subtree, which cost over two seconds on the largest baseline part.
export const replaceHtmlElement = (document) => {
  const html = document.documentElement;

  const doctype = document.implementation.createDocumentType("html", "", "");
  if (document.doctype) document.doctype.replaceWith(doctype);
  else document.insertBefore(doctype, html);

  // Drop Word's xmlns:* declarations and anything else; lang="en" is all we keep.
  for (const { name } of [...html.attributes]) html.removeAttribute(name);
  html.setAttribute("lang", "en");

  // bgcolor/link/vlink are deprecated presentational attributes (CSS handles
  // background-color and a:link/a:visited instead) and lang is redundant now
  // that <html lang="en"> is set above.
  for (const name of ["bgcolor", "lang", "link", "vlink"]) document.body.removeAttribute(name);

  return {
    message: "Added <!DOCTYPE html>, reset <html> to lang=\"en\". Removed bgcolor/lang/link/vlink from <body>.",
  };
};

// Same reasoning as replaceHtmlElement: replacing the children of the existing
// <head> is ~1ms, swapping in a new <head> element was over a second.
export const replaceHeadElement = (document, { cssHref = "../css/styles.css", title: titleText = "South American Classification Committee" } = {}) => {
  const head = document.head;
  for (const { name } of [...head.attributes]) head.removeAttribute(name);

  const metaCharset = document.createElement("meta");
  metaCharset.setAttribute("charset", "UTF-8");

  const metaViewport = document.createElement("meta");
  metaViewport.setAttribute("name", "viewport");
  metaViewport.setAttribute("content", "width=device-width, initial-scale=1");

  const link = document.createElement("link");
  link.setAttribute("rel", "stylesheet");
  link.setAttribute("href", cssHref);

  const title = document.createElement("title");
  title.textContent = titleText;

  head.replaceChildren(metaCharset, metaViewport, link, title);

  return {
    message: "Replaced entire <head> content.",
    removals: 1
  };
};

export const removeDivWrapper = (document) => {
  const wrappers = unwrapAll(document, wordClass("div", "WordSection1"));
  return { message: `Removed ${ plural(wrappers, "WordSection1 div wrapper") }.`, wrappers };
};

// Rebuilds an element's text from scratch, re-inserting only the formatting that
// should survive into clean output (links and italicized scientific names) so the
// result isn't littered with Word's mso-* spans and redundant <b> wrappers.
export const fillFormattedItem = (document, item, element, text) => {
  const matches = [...element.querySelectorAll("a[href], i")]
    .filter((node, _index, all) => !all.some((other) => other !== node && other.contains(node)));

  if (!matches.length) { item.textContent = text; return; }

  let remaining = text;
  for (const node of matches) {
    const nodeText = normalizeText(node.textContent ?? "");
    const idx = remaining.indexOf(nodeText);
    if (idx === -1) continue;
    if (idx > 0) item.appendChild(document.createTextNode(remaining.slice(0, idx)));
    const clone = document.createElement(node.tagName.toLowerCase());
    if (node.tagName === "A") clone.setAttribute("href", node.getAttribute("href") ?? "");
    clone.textContent = nodeText;
    item.appendChild(clone);
    remaining = remaining.slice(idx + nodeText.length);
  }
  if (remaining) item.appendChild(document.createTextNode(remaining));
};

export const simplifyBanner = (document) => {
  const bannerSourceElements = collectLeadingCenteredBlock(document);
  const contentElements = bannerSourceElements.filter((element) => !isBlankElement(element));
  if (!contentElements.length) {
    return {
      message: "Created 0 banner elements.",
      banners: 0,
    };
  }

  const banner = document.createElement("div");
  banner.className = "banner";

  let firstContent = true;
  for (const element of contentElements) {
    const item = document.createElement("div");
    const text = normalizeText(element.textContent ?? "");
    const image = element.querySelector("img");

    if (image) {
      item.className = "banner-logo";
      item.appendChild(image.cloneNode(true));
    } else if (firstContent) {
      item.className = "banner-title";
      firstContent = false;
      fillFormattedItem(document, item, element, text);
    } else if (text === "South American Classification Committee") {
      item.className = "banner-subtitle";
      fillFormattedItem(document, item, element, text);
    } else {
      item.className = /^Version /.test(text) ? "banner-meta version-list" : "banner-meta";
      fillFormattedItem(document, item, element, text);
    }

    banner.appendChild(item);
  }

  bannerSourceElements[0].replaceWith(banner);
  for (const element of bannerSourceElements.slice(1)) {
    element.remove();
  }
  removeEmptyTextSiblingsAfter(banner);
  banner.after("\n\n");

  return {
    message: `Created 1 banner element from ${ bannerSourceElements.length } header element${ bannerSourceElements.length === 1 ? "" : "s" }.`,
    banners: 1,
    sourceElements: bannerSourceElements.length,
  };
};

export const simplifyLineSeparators = (document) => {
  const container = document.querySelector("body > div") ?? document.body;
  let replacements = 0;
  let unwrapped = 0;

  for (const element of [...container.children]) {
    if (isLineSeparator(element)) {
      replaceWithSimpleElement(document, element, "hr");
      replacements += 1;
      continue;
    }

    // A para-border-div with real content: Word drew one rule along the whole group's
    // edge (border-bottom in every case seen so far). Put an <hr> on that edge and
    // unwrap the paragraphs so they are processed like any other body content.
    if (isParaBorderDiv(element)) {
      const edges = getBorderedEdges(element);
      if (edges.includes("top")) element.before(document.createElement("hr"));
      if (edges.includes("bottom")) element.after(document.createElement("hr"));
      unwrapElement(element);
      unwrapped += 1;
    }
  }

  const unwrappedNote = unwrapped
    ? ` Unwrapped ${ unwrapped } bordered paragraph group${ unwrapped === 1 ? "" : "s" } with content, keeping the rule.`
    : "";

  return {
    message: `Simplified ${ replacements } line separator${ replacements === 1 ? "" : "s" } to <hr>.${ unwrappedNote }`,
    replacements,
    unwrapped,
  };
};

export const replaceSpacerElements = (document) => {
  const spacers = [...document.body.querySelectorAll("p, div")].filter(isBlankElement);

  for (const spacer of spacers) spacer.remove();

  return {
    message: `Removed ${ plural(spacers.length, "spacer element") }.`,
    removals: spacers.length,
  };
};

// Word represents a visual gap between paragraphs as one or more empty
// MsoNormal paragraphs (margin:0 means adjacent paragraphs otherwise touch).
// Collapse each run of consecutive blank elements down to a single <br> so
// the gap survives into clean output as one blank line.
export const collapseBlankParagraphs = (document) => {
  const elements = [...document.body.querySelectorAll("p, div")];
  let collapsed = 0;
  let removed = 0;
  let index = 0;

  while (index < elements.length) {
    if (!isBlankElement(elements[index])) { index++; continue; }

    const keep = elements[index];
    let next = index + 1;

    while (next < elements.length && isBlankElement(elements[next])) {
      elements[next].remove();
      removed++;
      next++;
    }

    replaceWithSimpleElement(document, keep, "br");
    collapsed++;
    index = next;
  }

  return {
    message: `Collapsed ${ collapsed } blank paragraph run${ collapsed === 1 ? "" : "s" } to a single <br> (removed ${ removed } redundant element${ removed === 1 ? "" : "s" }).`,
    collapsed,
    removed,
  };
};

// since jsDom and browsers "normalize"  hex colors to rgb()
function getOriginalColor(span) {
  const styleAttr = span.getAttribute("style");
  if (!styleAttr) return null;

  const match = styleAttr.match(/color\s*:\s*([^;]+)/i);
  return match ? match[1].trim() : null;
}

// Word sometimes emits near-fuchsia hex values (e.g. #F700F2, #FB14FF) instead of
// the exact named "fuchsia" (#FF00FF) for pending-proposal text. Match the whole range:
// R ≥ 240, G ≤ 30, B ≥ 230.
function isFuchsiaVariant(color) {
  const m = (color ?? "").match(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/);
  if (!m) return false;
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  return r >= 240 && g <= 30 && b >= 230;
}

// "6 Apr 2026", "22 March 2026", "February 2026" — optional day, month name, year.
const MONTH_NAMES = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const DATE_ONLY_RE = new RegExp(`^(?:\\d{1,2}\\s+)?(?:${ MONTH_NAMES })\\.?\\s+\\d{4}$`, "i");

// Red text serves several distinct purposes in the source docs (status-code legend
// entries, revision dates, "proposal needed" flags, stray table numbers) — classify
// by content instead of assuming every red span means the same thing.
function classifyRedText(text) {
  const trimmed = text.trim();

  if (/^E?X\(e\)$/.test(trimmed)) return "endemic";
  if (DATE_ONLY_RE.test(trimmed)) return "date";
  if (/proposal/i.test(trimmed) && /needed/i.test(trimmed)) return "proposalNeeded";
  return "red";
}



const isWhitespaceOnlyText = (node, Node) =>
  node?.nodeType === Node.TEXT_NODE && !(node.nodeValue ?? "").trim();

// Only the colors that feed a semantic class below are worth merging — Word's
// markup is full of incidental same-color runs (mostly "black", the default
// body text color) that have nothing to do with each other and may carry other
// style differences we'd rather not silently discard.
const MERGEABLE_COLORS = new Set(["red", "blue", "fuchsia"]);

// Pure-formatting wrapper tags Word uses around a run without changing its
// color — safe to "see through" when looking for the true next run of a
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
// -formatting wrapper elements, see PEELABLE_WRAPPER_TAGS) between them — e.g.
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
      // inside `next` — unwrap only the span itself in place so its
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

export const stripWordFormatting = (document, { unwrapBold = true } = {}) => {
  const colorMergeResult = mergeAdjacentSameColorSpans(document);

  const paragraphsWithClass = [...document.querySelectorAll("p[class]")];
  const styledElements = [...document.querySelectorAll("[style]")];
  const boldElements = [...document.querySelectorAll("b")];
  // <u1:p> is the same empty-paragraph-mark placeholder as <o:p> — just carried
  // over with an undeclared namespace prefix from pasted-in content whose source
  // document had aliased "u1" to the same office namespace.
  const officeElements = [...document.getElementsByTagName("o:p"), ...document.getElementsByTagName("u1:p")];
  const spanStyleCleanupCount = [...document.querySelectorAll("span[style]")].filter((span) =>
    span
      .getAttribute("style")
      .split(";")
      .some((part) => part.trim().toLowerCase().startsWith("mso-")),
  ).length;

  for (const paragraph of paragraphsWithClass) {
    paragraph.removeAttribute("class");
  }

  for (const element of styledElements) {
    if (!element.style.color)
      element.removeAttribute("style");
    else {
      const introducedColors = ['#999999', '#989999', '#A6A6A6'];
      const originalColor = getOriginalColor(element);  // "rgb(51, 0, 153)" -> "#330099"

      // Skip class assignment for punctuation-only or whitespace-only content —
      // Word sometimes colors a trailing period/space with the same color as the
      // preceding labelled text, producing meaningless colored punctuation.
      const hasSubstantialText = /[A-Za-z0-9]/.test(element.textContent ?? "");

      if (!hasSubstantialText) { /* fall through to removeAttribute */ }
      else if (originalColor === 'red') element.className = classifyRedText(element.textContent ?? "");
      else if (originalColor === 'blue') element.className = 'info';

      else if (originalColor === 'fuchsia' || isFuchsiaVariant(originalColor))
        element.className = /^VERSION:/.test(element.textContent ?? "") ? 'version-baseline' : 'pendingProposal';

      // add  .toLowerCase()

      else if (originalColor === '#330099' || originalColor?.toLowerCase() === '#3366ff') element.className = 'info';  // case-insensitive — dirty files use both #3366FF and #330099
      else if (originalColor === '#999900') element.className = 'nonBreeder';
      else if (originalColor === '#92CDDC') element.className = 'vagrant';

      // else if (originalColor === '#999999' || originalColor === '#989999' || originalColor === '#A6A6A6') element.className = 'introduced';
      else if (introducedColors.includes(originalColor)) element.className = 'introduced';

      else if (originalColor === '#B2A1C7') element.className = 'subclass';
      // (no infraclass color: #92CDDC above is vagrant - 81 of its uses are the literal "V")
      else if (originalColor === '#990099' || originalColor === '#91028A') element.className = 'name';

      // for SpeciesList1.html :
      else if (originalColor === '#C00000') element.className = 'endemicBreeder';  // in species lists page and table only
      else if (originalColor === 'green') element.className = 'breeder';             // in species lists table only

      // Many-colored Rush Tyrant : "color:#009900"

      // color:#0070C0  // an "A" = ignore this
      // color:#9429DC  // just 2 commas = ignore
      // color:#002060  // cons[specific]  = ignore

      // #009999      // V, White-winged Dove, Mourning Dove, Antillean Nighthawk

      // <span class="info"> to treat <i>puna</i> as
      // </span>cons<span class="info">pecific with <i>versicolor</i> did not pass</span>

      element.removeAttribute("style");
    }
  }

  if (unwrapBold) {
    for (const boldElement of boldElements) {
      unwrapElement(boldElement);
    }
  }

  for (const officeElement of officeElements) {
    officeElement.remove();
  }

  // Strip VML/Office namespace attributes (v:shapes, o:spid, etc.) left on regular
  // HTML elements by Word's export. Browsers ignore them; they have no web meaning.
  let namespaceAttrCount = 0;
  for (const element of [...document.querySelectorAll("*")]) {
    const toRemove = [...element.attributes]
      .map((a) => a.name)
      .filter((name) => /^[vo]:/i.test(name));
    for (const name of toRemove) element.removeAttribute(name);
    namespaceAttrCount += toRemove.length;
  }

  return {
    message: [
      colorMergeResult.message,
      `Removed class names from ${ paragraphsWithClass.length } <p> element${ paragraphsWithClass.length === 1 ? "" : "s" }.`,
      `Removed ${ styledElements.length } style attribute${ styledElements.length === 1 ? "" : "s" }.`,
      unwrapBold
        ? `Unwrapped ${ boldElements.length } <b> tag${ boldElements.length === 1 ? "" : "s" }.`
        : `Preserved ${ boldElements.length } <b> tag${ boldElements.length === 1 ? "" : "s" }.`,
      `Removed ${ officeElements.length } <o:p>/<u1:p> tag${ officeElements.length === 1 ? "" : "s" }.`,
      `Cleaned mso styles from ${ spanStyleCleanupCount } <span> tag${ spanStyleCleanupCount === 1 ? "" : "s" }.`,
      `Removed ${ namespaceAttrCount } VML/Office namespace attribute${ namespaceAttrCount === 1 ? "" : "s" }.`,
    ].join(" "),
    colorSpanMerges: colorMergeResult.merges,
    paragraphClasses: paragraphsWithClass.length,
    styleAttributes: styledElements.length,
    boldTags: boldElements.length,
    officeTags: officeElements.length,
    namespaceAttrs: namespaceAttrCount,
  };
};

/// <reference types="jsdom" />
/** @param {Document} document */
export function trimParagraphTextNodes(document) {

  // <p>some text here and then a gap below before the closing tag.

  // </p>

  const collapse = (text) => text.replace(/\s+/g, " ");

  const w = document.defaultView;
  if (!w) return { message: "No window on document" };

  for (const p of Array.from(document.querySelectorAll("p"))) {
    p.normalize();

    for (const node of Array.from(p.childNodes)) {
      if (node.nodeType === w.Node.TEXT_NODE) {
        node.nodeValue = collapse(node.nodeValue);
      }
    }

    while (p.firstChild && p.firstChild.nodeType === w.Node.TEXT_NODE && p.firstChild.nodeValue?.trim() === "") {
      p.removeChild(p.firstChild);
    }
    while (p.lastChild && p.lastChild.nodeType === w.Node.TEXT_NODE && p.lastChild.nodeValue?.trim() === "") {
      p.removeChild(p.lastChild);
    }

    if (p.childNodes.length === 1 && p.firstChild?.nodeType === w.Node.TEXT_NODE && p.firstChild.nodeValue) {
      p.firstChild.nodeValue = p.firstChild.nodeValue.trim();
    }

    p.normalize();
  }

  return { message: "Trimmed whitespace in <p> elements." };
}
