// @ts-check
import { collectLeadingCenteredBlock, fillFormattedItem } from "../cleanup/wordCleanup.js";

const normalizeText = (value) => value.replace(/\s+/g, " ").trim();

/**
 * Converts the leading centered header block of a proposal page —
 * "Proposal (N) to South American Classification Committee" followed by the
 * proposal's own title — into a #proposalHeader block, and reports the title
 * text so the caller can use it (e.g. for logging).
 */
export const convertProposalHeader = (document) => {
  const headerSourceElements = collectLeadingCenteredBlock(document);
  const contentElements = headerSourceElements.filter(
    (element) => normalizeText(element.textContent ?? "") !== ""
  );

  if (contentElements.length < 2) {
    return { message: "No proposal header found — skipping.", title: null };
  }

  const [idElement, titleElement] = contentElements;
  const titleText = normalizeText(titleElement.textContent ?? "");

  const header = document.createElement("div");
  header.id = "proposalHeader";

  const idItem = document.createElement("div");
  idItem.className = "proposal-id";
  fillFormattedItem(document, idItem, idElement, normalizeText(idElement.textContent ?? ""));
  header.appendChild(idItem);

  const titleItem = document.createElement("div");
  titleItem.className = "proposal-title";
  fillFormattedItem(document, titleItem, titleElement, titleText);
  header.appendChild(titleItem);

  headerSourceElements[0].replaceWith(header);
  for (const element of headerSourceElements.slice(1)) {
    element.remove();
  }
  header.after("\n\n");

  return {
    message: `Created proposal header: "${ titleText }".`,
    title: titleText,
  };
};
