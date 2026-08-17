// @ts-check
import { mergeFragmentedItalicParagraphs } from "../cleanup/inlineTagCleanup.js";

const unwrapWhitespaceOnlySpans = (document, root) => {
  for (const span of [...root.querySelectorAll("span")]) {
    if (span.attributes.length === 0 && /^\s*$/.test(span.textContent ?? "")) {
      span.replaceWith(document.createTextNode(span.textContent ?? ""));
    }
  }
};

const escapeHtmlText = (text) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const unwrapUnclassedSpans = (root) => {
  for (const span of [...root.querySelectorAll("span")]) {
    if (span.attributes.length === 0) {
      span.replaceWith(...span.childNodes);
    }
  }
};

const isInfoNode = (node, Node, className = "info") => {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  if (node.tagName === "SPAN" && node.classList.contains(className)) return true;

  return node.tagName === "A"
    && [...node.childNodes].some((child) => child.textContent?.trim())
    && [...node.childNodes].every((child) =>
      (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim())
      || (child.nodeType === Node.ELEMENT_NODE
        && child.tagName === "SPAN"
        && child.classList.contains(className))
    );
};

const unwrapInfoSpans = (root, className = "info") => {
  for (const span of [...root.querySelectorAll(`span.${className}`)]) {
    span.replaceWith(...span.childNodes);
  }
};

const consolidateInfoRuns = (document, root, className = "info") => {
  const Node = document.defaultView.Node;
  const nodes = [...root.childNodes];

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (!isInfoNode(node, Node, className) || !node.parentNode) continue;

    const run = [node];
    let cursor = node.nextSibling;

    while (cursor) {
      // Whitespace-only text node: extend through it
      if (cursor.nodeType === Node.TEXT_NODE && !cursor.textContent?.trim()) {
        run.push(cursor);
        cursor = cursor.nextSibling;
        continue;
      }

      // Info node (span.className, or <a> whose children are ALL info spans): extend
      if (isInfoNode(cursor, Node, className)) {
        run.push(cursor);
        cursor = cursor.nextSibling;
        continue;
      }

      // Italic bridge (e.g. a species name splitting one sentence into
      // fragments) — extend speculatively, same as the bare <a> bridge below;
      // trimmed off again if it doesn't lead to another info node.
      if (cursor.nodeType === Node.ELEMENT_NODE && cursor.tagName === "I") {
        run.push(cursor);
        cursor = cursor.nextSibling;
        continue;
      }

      // Bare <a> bridge — link text not wrapped in an info span (common for .info class).
      // Extend speculatively; the trim step below drops it if no info node follows.
      if (cursor.nodeType === Node.ELEMENT_NODE && cursor.tagName === "A") {
        run.push(cursor);
        cursor = cursor.nextSibling;
        continue;
      }

      break;
    }

    // Drop trailing whitespace/bridge nodes so the run ends on an info node.
    // Those nodes stay in the DOM unchanged — we just won't move them.
    while (run.length > 1 && !isInfoNode(run[run.length - 1], Node, className)) {
      run.pop();
    }

    if (run.filter((runNode) => isInfoNode(runNode, Node, className)).length < 2) continue;

    const infoSpan = document.createElement("span");
    infoSpan.className = className;
    node.before(infoSpan);

    for (const runNode of run) {
      if (runNode.nodeType === Node.TEXT_NODE) {
        infoSpan.appendChild(document.createTextNode(" "));
        runNode.remove();
        continue;
      }

      if (runNode.tagName === "SPAN") {
        while (runNode.firstChild) {
          infoSpan.appendChild(runNode.firstChild);
        }
        runNode.remove();
        continue;
      }

      unwrapInfoSpans(runNode, className);
      infoSpan.appendChild(runNode);
    }

    collapseTextNodeWhitespace(document, infoSpan);
  }
};

const CITATION_LINK_RE = /SACCprop(\d+[A-Za-z]?)\.html?$/i;

// Some span.className runs wrongly glue together two or more distinct SACC
// proposal citations (e.g. "SACC proposal[566] passed ... SACC proposal[575]
// ..."). Split each such span right before the token ("SACC", or "Proposal"
// for the phrasing variant that omits "SACC") that starts each citation after
// the first. A span with 2+ <a> links to the SAME proposal number (a bonus
// inline link on a species name, not a new citation) is left untouched.
const splitMultiCitationInfoSpans = (document, root, className = "info") => {
  const Node = document.defaultView.Node;
  let splits = 0;

  for (const span of [...root.querySelectorAll(`span.${ className }`)]) {
    const allLinks = [...span.querySelectorAll("a")]
      .filter((a) => CITATION_LINK_RE.test(a.getAttribute("href") ?? ""));

    // Keep only the first <a> per distinct proposal number - later <a>s to
    // the same number are bonus inline links to the same citation, not a new one.
    const seen = new Set();
    const citationLinks = [];
    for (const a of allLinks) {
      const number = a.getAttribute("href")?.match(CITATION_LINK_RE)?.[1];
      if (number && !seen.has(number)) {
        seen.add(number);
        citationLinks.push(a);
      }
    }
    if (citationLinks.length < 2) continue;

    for (let i = citationLinks.length - 1; i >= 1; i--) {
      const prevLink = citationLinks[i - 1];
      const thisLink = citationLinks[i];

      const range = document.createRange();
      range.setStartAfter(prevLink);
      range.setEndBefore(thisLink);
      const between = range.toString();
      let tokenIndex = Math.max(between.lastIndexOf("SACC"), between.lastIndexOf("Proposal"));
      if (tokenIndex === -1) continue; // leave unsplit rather than guess

      // A capitalized adverb directly preceding the token (e.g. "New SACC",
      // "Subsequently, SACC") belongs to the new citation's sentence, not the
      // old one - fold it into the split point too. Only capitalized words
      // qualify: a lowercase conjunction (e.g. "but subsequent SACC") signals
      // one continuous sentence rather than a fresh one, so it's left as-is.
      const precedingWord = between.slice(0, tokenIndex).match(/[A-Z][a-zA-Z]*,?\s+$/);
      if (precedingWord) tokenIndex -= precedingWord[0].length;

      // Walk the whole span to find the text node containing the split point,
      // counting only text genuinely after prevLink (not prevLink's own inner
      // text, which "following" alone wouldn't exclude - descendants count as
      // "following" their ancestor too, hence the extra CONTAINED_BY check).
      const walker = document.createTreeWalker(span, Node.SHOW_TEXT);
      let charsSeen = 0;
      let splitNode = null;
      let splitOffset = 0;
      let text;
      while ((text = walker.nextNode())) {
        const pos = prevLink.compareDocumentPosition(text);
        const isAfterPrevLink = (pos & Node.DOCUMENT_POSITION_FOLLOWING) && !(pos & Node.DOCUMENT_POSITION_CONTAINED_BY);
        if (!isAfterPrevLink) continue;
        if (thisLink.contains(text)) break;

        const len = (text.nodeValue ?? "").length;
        if (charsSeen + len > tokenIndex) {
          splitNode = text;
          splitOffset = tokenIndex - charsSeen;
          break;
        }
        charsSeen += len;
      }
      if (!splitNode) continue;

      const newTextNode = splitNode.splitText(splitOffset);
      const newSpan = document.createElement("span");
      newSpan.className = className;
      span.after(newSpan);

      let node = newTextNode;
      while (node) {
        const next = node.nextSibling;
        newSpan.appendChild(node);
        node = next;
      }
      splits++;
    }
  }

  return {
    message: `Split ${ splits } multi-citation info span${ splits === 1 ? "" : "s" }.`,
    splits,
  };
};

// Matches a citation link in either relative form (baseline, already
// shortened by shortenSaccPropLinks) or absolute form (proposals, not
// shortened) - digits-only or a combined-citation range/list ("214-218",
// "373+374"), .htm or the occasional ".html" typo in the source. Deliberately
// narrower than CITATION_LINK_RE above (no letter suffix) to match only links
// shortenSaccPropLinks itself would also normalize.
const CITED_PROPOSAL_LINK_RE = /(?:^|\/)(SACCprop\d+(?:[-+]\d+)?\.html?)$/i;

// A citation's own <a> is sometimes a preceding sibling of the .info span
// rather than nested inside it (e.g. "<a href='SACCprop551.htm'>Proposal</a>
// <span class='info'> passed to change ...</span>"), skipping only
// whitespace-only text between them.
const precedingCitationLink = (document, span) => {
  const Node = document.defaultView.Node;
  let node = span.previousSibling;

  while (node && node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) {
    node = node.previousSibling;
  }

  return node?.nodeType === Node.ELEMENT_NODE && node.tagName === "A" ? node : null;
};

// .info is a catch-all for any originally-blue Word text (stripWordFormatting).
// Spans that specifically cite a single decided proposal page get their own
// .citedProposal class/style instead, leaving plain .info for anything else
// that happened to be blue. Runs after splitMultiCitationInfoSpans so every
// span here already has at most the citation links for ONE proposal.
const reclassifyCitedProposalSpans = (document, root, className = "info") => {
  let reclassified = 0;

  for (const span of [...root.querySelectorAll(`span.${ className }`)]) {
    const nestedLink = [...span.querySelectorAll("a")]
      .some((a) => CITED_PROPOSAL_LINK_RE.test(a.getAttribute("href") ?? ""));
    const precedingLink = precedingCitationLink(document, span);
    const hasCitationLink = nestedLink
      || (precedingLink && CITED_PROPOSAL_LINK_RE.test(precedingLink.getAttribute("href") ?? ""));
    if (!hasCitationLink) continue;

    span.classList.remove(className);
    span.classList.add("citedProposal");
    reclassified++;
  }

  return {
    message: `Reclassified ${ reclassified } cited-proposal span${ reclassified === 1 ? "" : "s" } from .${ className } to .citedProposal.`,
    reclassified,
  };
};

const mergeAdjacentItalicElements = (document, root) => {
  const trimLeadingText = (element) => {
    const walker = document.createTreeWalker(element, document.defaultView.NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode() ? walker.currentNode : null;

    if (!textNode) return false;

    const hadLeadingWhitespace = /^\s/.test(textNode.nodeValue ?? "");
    textNode.nodeValue = (textNode.nodeValue ?? "").replace(/^\s+/, "");

    return hadLeadingWhitespace;
  };

  for (const italic of [...root.querySelectorAll("i")]) {
    while (true) {
      let separator = italic.nextSibling;
      let nextItalic = separator;

      if (separator?.nodeType === document.defaultView.Node.TEXT_NODE && /^\s*$/.test(separator.nodeValue ?? "")) {
        nextItalic = separator.nextSibling;
      } else {
        separator = null;
      }

      if (nextItalic?.nodeType !== document.defaultView.Node.ELEMENT_NODE || nextItalic.tagName !== "I") break;

      const nextItalicHadLeadingWhitespace = trimLeadingText(nextItalic);
      italic.appendChild(document.createTextNode(separator || nextItalicHadLeadingWhitespace ? " " : ""));

      while (nextItalic.firstChild) {
        italic.appendChild(nextItalic.firstChild);
      }

      separator?.remove();
      nextItalic.remove();
    }
  }
};

const collapseTextNodeWhitespace = (document, root) => {
  root.normalize();

  const walker = document.createTreeWalker(root, document.defaultView.NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const textNode of textNodes) {
    textNode.nodeValue = (textNode.nodeValue ?? "").replace(/\s+/g, " ");
  }

  root.normalize();
};

const normalizePunctuationSpacing = (document, root) => {
  const walker = document.createTreeWalker(root, document.defaultView.NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const textNode of textNodes) {
    textNode.nodeValue = (textNode.nodeValue ?? "")
      .replace(/\s{2,}([.,;:!?)])/g, "$1");
  }
};

const trimParagraphEdgeWhitespace = (root) => {
  root.normalize();

  if (root.firstChild?.nodeType === root.ownerDocument.defaultView.Node.TEXT_NODE) {
    root.firstChild.nodeValue = (root.firstChild.nodeValue ?? "").replace(/^\s+/, "");
  }

  if (root.lastChild?.nodeType === root.ownerDocument.defaultView.Node.TEXT_NODE) {
    root.lastChild.nodeValue = (root.lastChild.nodeValue ?? "").replace(/\s+$/, "");
  }
};

// Collapse inline <p> content into a single line
export function collapseInlineParagraphs(document) {
  const Node = document.defaultView.Node;

  const paragraphs = [...document.querySelectorAll("p")];

  for (const p of paragraphs) {
    // Skip paragraphs that contain block elements
    if ([...p.children].some(el =>
      ["DIV", "P", "UL", "OL", "TABLE", "SECTION", "ARTICLE"].includes(el.tagName)
    )) continue;

    // Unwrap attribute-less spans before building parts so adjacent spans that
    // share a word (Word split-formatting artifact like <span>cons</span><span>pecific</span>)
    // are merged into a single text node by normalize() rather than getting a
    // space injected between them by the reduce() below.
    unwrapUnclassedSpans(p);
    p.normalize();

    const parts = [];
    let prevHadTrailSpace = false;

    for (const node of [...p.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE) {
        const raw = node.nodeValue ?? "";
        const t = raw.replace(/\s+/g, " ").trim();
        if (t) {
          parts.push({
            content: escapeHtmlText(t),
            needsLeadSpace: prevHadTrailSpace || /^\s/.test(raw)
          });
          prevHadTrailSpace = /\s$/.test(raw);
        } else {
          prevHadTrailSpace = true;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Inline elements: <i>, <a>, <span>, <b>, etc.
        const html = node.outerHTML.replace(/\s+/g, " ").trim();
        parts.push({ content: html, needsLeadSpace: prevHadTrailSpace });
        prevHadTrailSpace = false;
      }
    }

    // A paragraph that had content but collapses to no parts was a deliberate
    // blank line (e.g. a non-breaking-space placeholder) — keep it visible
    // rather than emptying it out, which would zero its rendered height.
    if (!parts.length && p.childNodes.length) {
      p.innerHTML = "&nbsp;";
      continue;
    }

    p.innerHTML = parts.reduce((html, part) => {
      if (!html) return part.content;
      if (/^[.,;:!?)]/.test(part.content)) return html + part.content;
      if (part.needsLeadSpace) return `${ html } ${ part.content }`;
      return html + part.content;
    }, "");

    unwrapWhitespaceOnlySpans(document, p);
    collapseTextNodeWhitespace(document, p);
    consolidateInfoRuns(document, p);
    consolidateInfoRuns(document, p, "pendingProposal");
    unwrapUnclassedSpans(p);
    collapseTextNodeWhitespace(document, p);
    mergeAdjacentItalicElements(document, p);
    collapseTextNodeWhitespace(document, p);
    consolidateInfoRuns(document, p);
    consolidateInfoRuns(document, p, "pendingProposal");
    normalizePunctuationSpacing(document, p);
    trimParagraphEdgeWhitespace(p);

    // Remove truly empty classified spans (e.g. <span class="proposalNeeded"></span> left after
    // stripping <o:p>). Whitespace-only spans are unwrapped to preserve their space content —
    // they often act as the sole separator between adjacent inline elements.
    for (const span of [...p.querySelectorAll("span")]) {
      if (span.childElementCount === 0) {
        const text = span.textContent ?? "";
        if (!text) span.remove();
        else if (!text.trim()) span.replaceWith(document.createTextNode(text));
      }
    }
  }

  // Split any span that ended up citing 2+ distinct proposals (accidental
  // over-merge) - must run after both consolidateInfoRuns passes above have
  // finished, so a not-yet-merged fragment can't be mis-split and a split-off
  // span can't get wrongly re-merged by a later pass.
  for (const p of paragraphs) {
    splitMultiCitationInfoSpans(document, p);
    splitMultiCitationInfoSpans(document, p, "pendingProposal");
    reclassifyCitedProposalSpans(document, p);
  }

  // consolidateInfoRuns above can merge separately-italicized runs into new
  // arrangements that are themselves fragmented (e.g. leaving a lone <i>.</i>
  // directly beside a still-classed span containing its own <i>) — sweep once
  // more now that the paragraph has taken its final shape.
  mergeFragmentedItalicParagraphs(document);
}
