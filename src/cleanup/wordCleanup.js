// @ts-check
const normalizeText = (value) =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const isBlankElement = (element) => {
  if (!["P", "DIV"].includes(element.tagName)) return false;
  // a[href] (not bare <a>) so Word's nameless bookmark anchors (<a name="...">,
  // used for internal cross-references, no visible text) don't block blank detection.
  if (element.querySelector("hr, img, table, ul, ol, li, a[href]")) return false;

  return normalizeText(element.textContent ?? "") === "";
};

const isLineSeparator = (element) => {
  if (!["P", "DIV", "HR"].includes(element.tagName)) return false;
  if (element.tagName === "HR") return true;
  if (element.querySelector("hr")) return true;

  // Word's way of bordering a single (often blank) paragraph: wrap it in a div
  // carrying the real CSS border, while the paragraph itself gets border:none
  // plus an mso-border-*-alt hint that only Word itself honors.
  if (element.tagName === "DIV" && (element.getAttribute("style") ?? "").toLowerCase().includes("mso-element:para-border-div")) {
    return true;
  }

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
  const spans = [...document.querySelectorAll("span.SpellE")];

  for (const span of spans) {
    const parent = span.parentNode;
    if (!parent) continue;

    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  }

  return {
    message: `Removed ${ spans.length } SpellE span${ spans.length === 1 ? "" : "s" }.`,
    removals: spans.length,
  };
};

export const unwrapGramESpans = (document) => {
  const spans = [...document.querySelectorAll("span.GramE")];

  for (const span of spans) {
    const parent = span.parentNode;
    if (!parent) continue;

    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  }

  return {
    message: `Removed ${ spans.length } GramE span${ spans.length === 1 ? "" : "s" }.`,
    removals: spans.length,
  };
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
  const spans = [...document.querySelectorAll("span")].filter((span) => span.attributes.length === 0);

  for (const span of spans) {
    const parent = span.parentNode;
    if (!parent) continue;

    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  }

  return {
    message: `Unwrapped ${ spans.length } attribute-less span${ spans.length === 1 ? "" : "s" }.`,
    removals: spans.length,
  };
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
  const spans = [...document.querySelectorAll("span.MsoHyperlink")];

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
  const spans = [...document.querySelectorAll("span")].filter((span) => span.childElementCount === 0);
  let removed = 0;
  let collapsed = 0;

  for (const span of spans) {
    const text = span.textContent ?? "";
    if (!text) {
      span.remove();
      removed++;
    } else if (!text.trim()) {
      span.replaceWith(document.createTextNode(text));
      collapsed++;
    }
  }

  return {
    message: `Removed ${ removed } empty span${ removed === 1 ? "" : "s" } and collapsed ${ collapsed } whitespace-only span${ collapsed === 1 ? "" : "s" } to text.`,
    removed,
    collapsed,
  };
};

// Same as removeEmptySpans, but for <b> — only relevant where bold is preserved
// rather than unwrapped (proposals pipeline): a <b> wrapping only Word's <o:p>
// paragraph-mark placeholder ends up with nothing left inside once that's
// stripped, since nothing else targets bold tags specifically.
export const removeEmptyBoldTags = (document) => {
  const boldElements = [...document.querySelectorAll("b")].filter((b) => b.childElementCount === 0);
  let removed = 0;
  let collapsed = 0;

  for (const b of boldElements) {
    const text = b.textContent ?? "";
    if (!text) {
      b.remove();
      removed++;
    } else if (!text.trim()) {
      b.replaceWith(document.createTextNode(text));
      collapsed++;
    }
  }

  return {
    message: `Removed ${ removed } empty <b> tag${ removed === 1 ? "" : "s" } and collapsed ${ collapsed } whitespace-only <b> tag${ collapsed === 1 ? "" : "s" } to text.`,
    removed,
    collapsed,
  };
};

export const stripEmptyLines = (document) => {
  const comments = [];
  const walker = document.createTreeWalker(document, document.defaultView?.NodeFilter.SHOW_COMMENT);
  // const walker2 = document.createTreeWalker(document, document.defaultView.NodeFilter.);

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

// export const removeHeadStyle = (document) => {
//   const styles = [...document.head.querySelectorAll("style")];

//   for (const style of styles) {
//     style.remove();
//   }

//   return {
//     message: `Removed ${ styles.length } head style block${ styles.length === 1 ? "" : "s" }.`,
//     removals: styles.length,
//   };
// };

export const replaceHtmlElement = (document) => {
  const oldHtml = document.documentElement;

  // Create a brand‑new <html> element
  const newHtml = document.createElement("html");

  // Add whatever attributes you want
  newHtml.setAttribute("lang", "en");

  // Move <head> and <body> into the new <html>
  // (These nodes are automatically removed from the old <html>)
  newHtml.appendChild(document.head);
  newHtml.appendChild(document.body);

  // Replace the old <html> with the new one
  oldHtml.parentNode.replaceChild(newHtml, oldHtml);

  // bgcolor/link/vlink are deprecated presentational attributes (CSS handles
  // background-color and a:link/a:visited instead) and lang is redundant now
  // that <html lang="en"> is set above.
  document.body.removeAttribute("bgcolor");
  document.body.removeAttribute("lang");
  document.body.removeAttribute("link");
  document.body.removeAttribute("vlink");

  return {
    message: "Replaced <html> element with a modern version. Removed bgcolor/lang/link/vlink from <body>.",
  };
};


// export const replaceHeadElement = (document) => {
//   const newHead = document.createElement("head");

//   newHead.innerHTML = `
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1">
//     <link rel="stylesheet" href="../css/styles.css">
//     <title>South American Classification Committee</title>
//   `;

//   // Replace the old <head> with the new one
//   document.documentElement.replaceChild(newHead, document.head);

//   return {
//     message: "Replaced entire <head> element.",
//     removals: 1
//   };
// };

export const replaceHeadElement = (document, { cssHref = "../css/styles.css", title: titleText = "South American Classification Committee" } = {}) => {
  const newHead = document.createElement("head");

  // <meta charset="UTF-8">
  const metaCharset = document.createElement("meta");
  metaCharset.setAttribute("charset", "UTF-8");
  newHead.appendChild(metaCharset);

  // <meta name="viewport" content="width=device-width, initial-scale=1">
  const metaViewport = document.createElement("meta");
  metaViewport.setAttribute("name", "viewport");
  metaViewport.setAttribute("content", "width=device-width, initial-scale=1");
  newHead.appendChild(metaViewport);

  // <link rel="stylesheet" href="...">
  const link = document.createElement("link");
  link.setAttribute("rel", "stylesheet");
  link.setAttribute("href", cssHref);
  newHead.appendChild(link);

  // <title>...</title>
  const title = document.createElement("title");
  title.textContent = titleText;
  newHead.appendChild(title);

  // Replace old head
  document.documentElement.replaceChild(newHead, document.head);

  // console.log(document.head.outerHTML);

  return {
    message: "Replaced entire <head> element.",
    removals: 1
  };
};



export const removeDivWrapper = (document) => {
  const wrappers = [...document.querySelectorAll("div.WordSection1")];

  for (const wrapper of wrappers) {
    wrapper.replaceWith(...wrapper.childNodes);
  }

  return {
    message: `Removed ${ wrappers.length } WordSection1 div wrapper${ wrappers.length === 1 ? "" : "s" }.`,
    wrappers: wrappers.length,
  };
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
  const separators = [...container.children].filter(isLineSeparator);

  for (const separator of separators) {
    replaceWithSimpleElement(document, separator, "hr");
  }

  return {
    message: `Simplified ${ separators.length } line separator${ separators.length === 1 ? "" : "s" } to <hr>.`,
    replacements: separators.length,
  };
};

// export const replaceSpacerElements = (document) => {
//   const spacers = [...document.body.querySelectorAll("p, div")].filter(isBlankElement);

//   for (const spacer of spacers) {
//     replaceWithSimpleElement(document, spacer, "br");
//   }

//   return {
//     message: `Replaced ${ spacers.length } spacer element${ spacers.length === 1 ? "" : "s" } with <br>.`,
//     replacements: spacers.length,
//   };
// };

export const replaceSpacerElements = (document) => {
  const spacers = [...document.body.querySelectorAll("p, div")].filter(isBlankElement);

  for (const spacer of spacers) {
    removeElement(spacer);
  }

  return {
    message: `Removed ${ spacers.length } spacer element${ spacers.length === 1 ? "" : "s" }.`,
    removals: spacers.length,
  };
};

const removeElement = (element) => {
  element.remove();
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

// Word occasionally splits one visually-styled run into separate sibling
// <span style="color:..."> elements with only whitespace between them (e.g. a
// line-wrap artifact in the source: "SACC proposal" / "badly needed" as two
// spans instead of one). Merge these back together *before* classifying by
// color, so content-dependent rules (like classifyRedText) see the whole phrase
// rather than each fragment in isolation.
const mergeAdjacentSameColorSpans = (document) => {
  const Node = document.defaultView.Node;
  let merges = 0;

  for (const element of [...document.querySelectorAll("[style]")]) {
    if (!element.isConnected) continue; // already absorbed into an earlier merge
    const color = getOriginalColor(element);
    if (!color || !MERGEABLE_COLORS.has(color)) continue;

    while (true) {
      let separator = element.nextSibling;
      let next = separator;

      if (isWhitespaceOnlyText(separator, Node)) {
        next = separator.nextSibling;
      } else {
        separator = null;
      }

      if (!next || next.nodeType !== Node.ELEMENT_NODE || getOriginalColor(next) !== color) break;

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

    // TODO, use this a s a default and don't remove the style attribute?
    const colorClass = element.style.color;

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
      else if (originalColor === '#92CDDC') element.className = 'infraclass';
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


/// <reference types="jsdom" />
//** @param {Document} document */
export function removeWhitespaceBetweenBlocks(document) {
  const w = document.defaultView;
  if (!w) return { message: "No window on document", removed: 0 };

  let removed = 0;
  const body = document.body;
  if (!body) return { message: "No body", removed };

  // Walk a snapshot of body.childNodes because we'll mutate while iterating
  const nodes = Array.from(body.childNodes);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    // target text nodes that are only whitespace
    if (node.nodeType === w.Node.TEXT_NODE && (node.nodeValue || "").trim() === "") {
      const prev = node.previousSibling;
      const next = node.nextSibling;
      // remove only when between two element siblings (e.g., </p> [whitespace] <p>)
      if (prev && next && prev.nodeType === w.Node.ELEMENT_NODE && next.nodeType === w.Node.ELEMENT_NODE) {
        node.remove();
        removed++;
      }
    }
  }

  // final normalize to merge any remaining text nodes
  document.normalize();
  return { message: "Removed whitespace-only text nodes between block elements.", removed };
}


/// <reference types="jsdom" />
/**
 * Serialize dom and return cleaned HTML string (no file I/O).
 * @param {import("jsdom").JSDOM} dom
 * @returns {string}
 */
// export function collapseBlankLinesToString(dom) {
//   let html = dom.serialize();
//   html = html.replace(/<\/p>\s*(?:\r?\n[ \t]*)+<p>/g, "</p>\n\n<p>");
//   html = html.replace(/(\r?\n\s*){3,}/g, "\n\n");
//   return html;
// }

// /** @param {Document} document */
// export function collapseBlankParagraphsFromDocument(document) {
//   const w = document.defaultView;
//   if (!w) return { message: "No window on document", removals: 0 };

//   let removals = 0;

//   // 1) Remove whitespace-only text nodes that are between two element siblings
//   //    (this removes the stray newline/tab lines between </p> and <p>)
//   // Walk a snapshot of all text nodes under body
//   const walker = document.createTreeWalker(
//     document.body || document,
//     w.NodeFilter.SHOW_TEXT,
//     null
//   );

//   const textNodes = [];
//   while (walker.nextNode()) textNodes.push(walker.currentNode);

//   for (const tn of textNodes) {
//     if ((tn.nodeValue || "").trim() === "") {
//       const prev = tn.previousSibling;
//       const next = tn.nextSibling;
//       if (prev && next && prev.nodeType === w.Node.ELEMENT_NODE && next.nodeType === w.Node.ELEMENT_NODE) {
//         tn.remove();
//         removals++;
//       }
//     }
//   }

//   // 2) Remove truly empty <p> (no meaningful text, only whitespace, &nbsp;, <br>, or empty inline wrappers)
//   const isMeaningful = (el) => {
//     const txt = (el.textContent || "").replace(/\u00A0/g, " ").trim();
//     return txt !== "";
//   };

//   for (const p of Array.from(document.querySelectorAll("p"))) {
//     if (!isMeaningful(p)) {
//       p.remove();
//       removals++;
//     }
//   }

//   // 3) Collapse runs of consecutive blank <p> to a single blank <p>
//   //    (we treat a paragraph as "blank-like" if it has no meaningful text)
//   const paragraphs = Array.from(document.querySelectorAll("p"));
//   let prevWasBlank = false;
//   for (const p of paragraphs) {
//     if (!p.parentNode) continue; // may have been removed
//     const blank = !isMeaningful(p);
//     if (blank) {
//       if (prevWasBlank) {
//         p.remove();
//         removals++;
//       } else {
//         // keep the first blank in a run but normalize it to be empty
//         for (const n of Array.from(p.childNodes)) {
//           p.removeChild(n);
//         }
//         prevWasBlank = true;
//       }
//     } else {
//       prevWasBlank = false;
//     }
//   }

//   // final normalize
//   document.normalize();

//   return { message: `Collapsed blank paragraphs; removed ${ removals } nodes.`, removals };
// }
