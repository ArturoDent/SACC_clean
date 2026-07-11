// @ts-check
import { pageLinkTextContent, pageLinkHTML } from "../helpers/pageLink.js";


const normalizeText = (value) =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getPartNumber = (element) => {
  const match = normalizeText(element.textContent ?? "").match(/^Part\s+(\d+)\./);
  return match ? Number(match[1]) : null;
};

const appendLinkedPartContent = (document, span, paragraph) => {
  // const text = normalizeText(paragraph.textContent ?? "");
  const text = normalizeText(paragraph.textContent.split(/\s+/).join(' ') ?? "");
  const link = paragraph.querySelector("a[href]");

  if (!link) {
    span.textContent = text;
    return;
  }

  const linkText = normalizeText(link.textContent.split(/\s+/).join(' ') ?? "");
  const linkStart = text.indexOf(linkText);
  const before = linkStart === -1 ? text : text.slice(0, linkStart);
  const after = linkStart === -1 ? "" : text.slice(linkStart + linkText.length);
  const cleanLink = document.createElement("a");

  cleanLink.setAttribute("href", link.getAttribute("href"));
  cleanLink.textContent = linkText;

  span.append(before);
  span.append(cleanLink);
  span.append(after);
};

const buildPageLinkBlock = (document, paragraphs) => {
  const block = document.createElement("div");
  block.id = "saccPageLinkBlock";
  block.append("\n");

  paragraphs.forEach((paragraph, index) => {
    const span = document.createElement("span");

    appendLinkedPartContent(document, span, paragraph);
    block.append(span);

    if (index < paragraphs.length - 1) {
      block.append(document.createElement("br"));
      block.append("\n");
    }
  });

  return block;
};


// return after one successful replacement ?
export const convertSaccPageLinks = (document) => {
  const paragraphs = [...document.querySelectorAll("p")];
  let replacement = 0;

  for (const paragraph of paragraphs) {
    if (replacement) break;
    // TODO: .isConnected seems unnecessary
    // if (!paragraph.isConnected || getPartNumber(paragraph) !== 1) continue;
    if (!getPartNumber(paragraph) || paragraph.nextElementSibling?.tagName !== "P") continue;

    const run = [paragraph];
    let current = paragraph;

    // for (let expectedPart = 2; expectedPart <= 11; expectedPart += 1) {
    for (let part = 1; part <= 11; part += 1) {
      let next = current.nextElementSibling;

      while (next?.tagName === "BR") {
        next = next.nextElementSibling;
      }

      // if (next?.tagName !== "P" || getPartNumber(next) !== expectedPart) {
      if (next?.tagName !== "P" || !getPartNumber(next) || !pageLinkTextContent.includes(next.textContent.split(/\s+/).join(' ').trim())) {
        break;
      }

      run.push(next);
      current = next;
    }

    // if (run.length !== 11) continue;

    run[0].replaceWith(buildPageLinkBlock(document, run));
    for (const element of run.slice(1)) {
      element.remove();
    }
    replacement += 1;
  }

  return {
    message: `Converted ${ replacement } SACC page link block${ replacement === 1 ? "" : "s" }.`,
    replacement,
  };
};
