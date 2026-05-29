const normalizeText = (value) =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isBlankElement = (element) => {
  if (!["P", "DIV"].includes(element.tagName)) return false;
  if (element.querySelector("hr, img, table, ul, ol, li, a")) return false;

  return normalizeText(element.textContent ?? "") === "";
};

const isLineSeparator = (element) => {
  if (!["P", "DIV", "HR"].includes(element.tagName)) return false;
  if (element.tagName === "HR") return true;
  if (element.querySelector("hr")) return true;

  return /^_+$/.test(normalizeText(element.textContent ?? ""));
};

const isCenteredElement = (element) => {
  const align = element.getAttribute?.("align")?.toLowerCase();
  const style = element.getAttribute?.("style")?.toLowerCase() ?? "";

  return align === "center" || style.includes("text-align:center");
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
    if (!(node instanceof w.Element)) continue; // narrow to Element

    // tagName is uppercase in DOM; classList is safer than className
    // collect SPANs that do NOT have the "commonName" class
    if (node.tagName === "SPAN" && !(node.classList && node.classList.contains("commonName"))) {
      spans.push(node);
    }
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


export const stripEmptyLines = (document) => {
  const comments = [];
  const walker = document.createTreeWalker(document, document.defaultView.NodeFilter.SHOW_COMMENT);
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

export const removeHeadStyles = (document) => {
  const styles = [...document.head.querySelectorAll("style")];

  for (const style of styles) {
    style.remove();
  }

  return {
    message: `Removed ${ styles.length } head style block${ styles.length === 1 ? "" : "s" }.`,
    removals: styles.length,
  };
};

export const simplifyPageWrapper = (document) => {
  const wrappers = [...document.querySelectorAll("div.WordSection1")];

  for (const wrapper of wrappers) {
    wrapper.removeAttribute("class");
  }

  return {
    message: `Removed WordSection1 class from ${ wrappers.length } wrapper${ wrappers.length === 1 ? "" : "s" }.`,
    wrappers: wrappers.length,
  };
};

export const simplifyBanner = (document) => {
  const container = document.querySelector("body > div") ?? document.body;
  const bannerSourceElements = [];

  for (const element of [...container.children]) {
    if (isCenteredElement(element) || (bannerSourceElements.length && isBlankElement(element))) {
      bannerSourceElements.push(element);
      continue;
    }

    if (bannerSourceElements.length) break;
  }

  const contentElements = bannerSourceElements.filter((element) => !isBlankElement(element));
  if (!contentElements.length) {
    return {
      message: "Created 0 banner elements.",
      banners: 0,
    };
  }

  const banner = document.createElement("div");
  banner.className = "banner";

  for (const element of contentElements) {
    const item = document.createElement("div");
    const text = normalizeText(element.textContent ?? "");
    const image = element.querySelector("img");

    if (image) {
      item.className = "banner-logo";
      item.appendChild(image.cloneNode(true));
    } else if (text === "A Classification of the Bird Species of South America") {
      item.className = "banner-title";
      item.textContent = text;
    } else if (text === "South American Classification Committee") {
      item.className = "banner-subtitle";
      item.textContent = text;
    } else {
      item.className = "banner-meta";
      item.textContent = text;
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


export const stripWordFormatting = (document) => {
  const paragraphsWithClass = [...document.querySelectorAll("p[class]")];
  const styledElements = [...document.querySelectorAll("[style]")];
  const boldElements = [...document.querySelectorAll("b")];
  const officeElements = [...document.getElementsByTagName("o:p")];
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
    element.removeAttribute("style");
  }

  for (const boldElement of boldElements) {
    unwrapElement(boldElement);
  }

  for (const officeElement of officeElements) {
    officeElement.remove();
  }

  return {
    message: [
      `Removed class names from ${ paragraphsWithClass.length } <p> element${ paragraphsWithClass.length === 1 ? "" : "s" }.`,
      `Removed ${ styledElements.length } style attribute${ styledElements.length === 1 ? "" : "s" }.`,
      `Unwrapped ${ boldElements.length } <b> tag${ boldElements.length === 1 ? "" : "s" }.`,
      `Removed ${ officeElements.length } <o:p> tag${ officeElements.length === 1 ? "" : "s" }.`,
      `Cleaned mso styles from ${ spanStyleCleanupCount } <span> tag${ spanStyleCleanupCount === 1 ? "" : "s" }.`,
    ].join(" "),
    paragraphClasses: paragraphsWithClass.length,
    styleAttributes: styledElements.length,
    boldTags: boldElements.length,
    officeTags: officeElements.length,
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
