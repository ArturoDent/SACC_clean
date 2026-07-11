// @ts-check
import { subclassNames, infraclassNames, familyNames, orderNames, suborderNames, taxonomyNames } from "../helpers/orders.js";

const normalizeText = (value) =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const getStyleValue = (element, property) => {
  const style = element.getAttribute?.("style") ?? "";
  const declaration = style
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith(`${ property }:`));

  return declaration?.split(":").slice(1).join(":").trim().toLowerCase() ?? "";
};

const collectTextSegments = (node, inherited = { italic: false, color: "" }) => {
  if (node.nodeType === node.TEXT_NODE) {
    const text = normalizeText(node.nodeValue ?? "");
    return text ? [{ ...inherited, text }] : [];
  }

  if (node.nodeType !== node.ELEMENT_NODE) return [];
  if (node.tagName.toLowerCase() === "o:p") return [];

  const tagName = node.tagName.toLowerCase();
  const fontStyle = getStyleValue(node, "font-style");
  const color = getStyleValue(node, "color") || inherited.color;
  const nextInherited = {
    italic: inherited.italic || tagName === "i" || fontStyle === "italic",
    color,
  };

  return [...node.childNodes].flatMap((child) => collectTextSegments(child, nextInherited));
};

const findPrefixedName = (text, names) => {
  for (const name of names) {
    if (text === name) return { name, rest: "" };
    if (text.startsWith(`${ name } `)) return { name, rest: text.slice(name.length).trim() };
  }

  return null;
};

const splitSpeciesParts = (element) => {
  const segments = collectTextSegments(element);
  const italicTexts = segments.filter((s) => s.italic).map((s) => s.text);

  if (!italicTexts.length) return null;

  const fullText = normalizeText(element.textContent ?? "");

  // Build the scientific name by locating each italic segment in fullText
  // in sequence, allowing up to 2 gap characters between them so that:
  //  • directly adjacent spans ("T" + "rogon" → "Trogon") work with gap 0
  //  • abbreviated names separated by a period ("T" + "caesius" → "T.caesius")
  //    work with gap 1
  // Whitespace-only gaps (Word's span-break artifact, e.g. "cryptoxanthu" + " " + "s")
  // are skipped when building the name — otherwise the space leaks into it.
  let scientificName = "";
  let pos = 0;
  for (let i = 0; i < italicTexts.length; i++) {
    const idx = fullText.indexOf(italicTexts[i], pos);
    if (idx === -1) return null;
    if (i === 0 && idx > 0) return null;
    if (i > 0 && idx - pos > 2) return null;
    if (i > 0) {
      const gap = fullText.slice(pos, idx);
      // Skip whitespace-only gaps only when the next segment is a short suffix
      // (≤ 2 chars, e.g. "s" or "us") — Word sometimes splits a trailing suffix
      // into a separate span. For full words like "orbitalis" the space IS part of
      // the scientific name (separating genus from species) so we must keep it.
      const isShortSuffix = italicTexts[i].length <= 2;
      if (gap.trim() || !isShortSuffix) scientificName += gap;
    }
    scientificName += italicTexts[i];
    pos = idx + italicTexts[i].length;
  }

  scientificName = normalizeText(scientificName);
  if (!scientificName) return null;

  let rest = normalizeText(fullText.slice(pos));

  // Word sometimes detaches the trailing 1–2 lowercase chars of a species epithet
  // into a non-italic span (e.g. "cryptoxanthu" italic + "s" plain → rest = "s Olive-...").
  // Absorb them into the scientific name when followed immediately by a space + uppercase
  // (which is how every common name starts), distinguishing this from a real word boundary.
  const suffixMatch = rest.match(/^([a-z]{1,2}) ([A-Z])/);
  if (suffixMatch) {
    scientificName = normalizeText(scientificName + suffixMatch[1]);
    rest = normalizeText(rest.slice(suffixMatch[1].length));
  }

  // const noteMatch = rest.match(/\s+(?=(?:\([A-Z]{1,3}\))|\d)/);
  const noteMatch = rest.match(/\s+(?=(?:\d))/);

  const splitAt = noteMatch?.index ?? -1;

  if (splitAt === -1) {
    return { scientificName, commonName: rest, note: "" };
  }

  return {
    scientificName,
    commonName: normalizeText(rest.slice(0, splitAt)),
    note: normalizeText(rest.slice(splitAt)),
  };
};

export const parseTaxonomyRow = (element) => {
  if (element.tagName?.toLowerCase() !== "p") return null;

  const text = normalizeText(element.textContent ?? "");
  if (!text) return { type: "blank", original: element.outerHTML };
  if (/^_+$/.test(text)) return null;

  // if (taxonomyNames.subclass.has(text)) return { type: "subclass", label: text };
  // if (taxonomyNames.infraclass.has(text)) return { type: "infraclass", label: text };

  // because subclass, infraclass, order and family might have endnote numbers
  // which taxonomyNames.subclass.has(text) would not match (startsWith?)
  const subclass = findPrefixedName(text, subclassNames);
  if (subclass) return { type: "subclass", label: subclass.name, note: subclass.rest };

  const infraclass = findPrefixedName(text, infraclassNames);
  if (infraclass) return { type: "infraclass", label: infraclass.name, note: infraclass.rest };

  const order = findPrefixedName(text, orderNames);
  if (order) return { type: "order", label: order.name, note: order.rest };

  const suborder = findPrefixedName(text, suborderNames);
  if (suborder) return { type: "suborder", label: suborder.name, note: suborder.rest };

  const family = findPrefixedName(text, familyNames);
  if (family) {
    const familyRow = text.match(/^([A-Z]+IDAE)(?:\s+\(([^)]+)\))?(?:\s+(.*))?$/);
    if (familyRow) {
      const [, familyName, parenthetical, note = ""] = familyRow;
      return {
        type: "family",
        label: parenthetical ? `${ familyName } (${ parenthetical })` : familyName,
        note: normalizeText(note),
      };
    }
  }

  // do all subfamilies end with "inae" ?  Incertae sedis

  // Numeniinae has a trailing empty <i> in the Word HTML that querySelector("i")
  // found; collectTextSegments() only returns segments with actual text content.
  // if (/^[A-Z][a-z]+inae(?:\s+.*)?$/.test(text) && !collectTextSegments(element)[0]?.italic) {
  if (/^[A-Z][a-z]+inae(?:\s+.*)?$/.test(text)) {
    const m = text.match(/^([A-Z][a-z]+inae)((?:\s+.*)?)$/);
    return { type: "subfamily", label: m ? m[1] : text, note: normalizeText(m?.[2] ?? "") };
  }
  else if (/^Incertae sedis(?:\s+.*)?$/.test(text)) {
    const m = text.match(/^(Incertae sedis)((?:\s+.*)?)$/);
    return { type: "subfamily", label: m ? m[1] : text, note: normalizeText(m?.[2] ?? "") };
  }
  // Incertae sedis
  //   Tachuris rubrigastra Many-colored Rush Tyrant 43b



  const species = splitSpeciesParts(element);
  if (species?.commonName) return { type: "species", ...species };

  return null;
};

const rowHasListContent = (row) =>
  ["subclass", "infraclass", "order", "suborder", "family", "subfamily", "species"].includes(row.type);

const formatNote = (note) => (note ? ` <span>${ escapeHtml(note) }</span>` : "");

const speciesHtml = ({ scientificName, commonName, note }) => {
  let classList = "commonName";

  if (commonName.endsWith("(IN)")) classList = "commonName introduced";
  // Sturnus vulgaris European Starling (V, IN) 3 : "V" in vagrant color, all else in IN color
  else if (commonName.endsWith("(V, IN)")) {
    classList = "commonName introduced";
    commonName = commonName.slice(0, -8) + ' (<span class="vagrant">V</span>, IN)';
  }
  else if (note.endsWith("(IN)")) {
    classList = "commonName introduced";
    commonName = commonName + ' (IN)';
    note = note.slice(0, -5);  // to remove trailing (IN)
  }

  else if (commonName.endsWith("(NB)")) classList = "commonName nonBreeder";
  else if (note.endsWith("(NB)")) {
    classList = "commonName nonBreeder";
    commonName = commonName + ' (NB)';
    note = note.slice(0, -5);  // to remove trailing (NB)
  }
  // Eskimo Curlew (NB, EX?) 11a - Curlew is in NBcolor, but EX? is in red/extinct color
  else if (commonName.endsWith("(NB, EX?)")) {
    classList = "commonName nonBreeder";
    commonName = commonName.slice(0, -9) + ' (NB, <span class="extinct">EX?</span>)';
  }

  // Northern Bentbill: (V?)
  else if (commonName.endsWith("(V)") || commonName.endsWith("(V?)")) classList = "commonName vagrant";
  else if (note.endsWith("(V)")) {
    classList = "commonName vagrant";
    commonName = commonName + ' (V)';
    note = note.slice(0, -4);  // to remove trailing (V)
  }

  else if (commonName.endsWith("(EX)")) classList = "commonName extinct";
  else if (note.endsWith("(EX)")) {
    classList = "commonName extinct";
    commonName = commonName + ' (EX)';
    note = note.slice(0, -5);  // to remove trailing (EX)
  }

  // If commonName already contains embedded HTML markup (e.g. a nested <span>) use
  // it directly; otherwise escape so that bare & < > characters are rendered safely.
  const commonNameHtml = commonName.includes("<") ? commonName : escapeHtml(commonName);
  return `<li><i>${ escapeHtml(scientificName) }</i> <span class="${ classList }">${ commonNameHtml }</span>${ note ? ` ${ escapeHtml(note) }` : "" }</li>`;
};

const buildFamilySpeciesList = (rows) => {

  const html = ['<div class="familySpeciesList">', "  <ul>"];
  let familyOpen = false;
  let familySpeciesListOpen = false;
  let subfamilyOpen = false;

  const closeSubfamily = () => {
    if (!subfamilyOpen) return;
    html.push("          </ul>");
    html.push("        </li>");
    subfamilyOpen = false;
  };

  const closeFamily = () => {
    closeSubfamily();
    if (!familyOpen) return;
    html.push("      </ul>");
    html.push("    </li>");
    familyOpen = false;
    familySpeciesListOpen = false;
  };

  for (const row of rows) {
    if (row.type === "blank") continue;

    if (["subclass", "infraclass", "order", "suborder"].includes(row.type)) {
      closeFamily();
      // TODO: since this will be formatted, are the leading spaces necessary?
      html.push(`    <li class="${ row.type }">${ escapeHtml(row.label) }${ formatNote(row.note) }</li>`);
      continue;
    }

    if (row.type === "family") {
      closeFamily();
      html.push(`    <li class="family">${ escapeHtml(row.label) }${ formatNote(row.note) }`);
      html.push("      <ul>");
      familyOpen = true;
      familySpeciesListOpen = true;
      continue;
    }

    if (row.type === "subfamily") {
      if (!familySpeciesListOpen) continue;
      closeSubfamily();
      html.push(`        <li class="subfamily">${ escapeHtml(row.label) }${ formatNote(row.note) }`);
      html.push("          <ul>");
      subfamilyOpen = true;
      continue;
    }

    if (row.type === "species") {
      if (subfamilyOpen) {
        html.push(`            ${ speciesHtml(row) }`);
      } else if (familySpeciesListOpen) {
        html.push(`        ${ speciesHtml(row) }`);
      }
    }
  }

  closeFamily();
  html.push("  </ul>", "</div>");
  return html.join("\n");
};

export const convertFamilySpeciesLists = (document) => {
  const container = document.querySelector("body > div") ?? document.body;
  const children = [...container.children];
  let replacements = 0;
  let currentRun = [];

  const flushRun = () => {
    if (!currentRun.length) return;

    const rows = currentRun.map(({ row }) => row);
    const hasListContent = rows.some(rowHasListContent);
    const replacementHtml = hasListContent
      ? buildFamilySpeciesList(rows)
      : currentRun.map(({ element }) => element.outerHTML).join("\n");

    currentRun[0].element.insertAdjacentHTML("beforebegin", replacementHtml);
    for (const { element } of currentRun) element.remove();
    // if (hasListContent && hasFamilyContent) replacements += 1;
    if (hasListContent) replacements += 1;
    currentRun = [];
  };

  for (const element of children) {
    const row = parseTaxonomyRow(element);

    if (row && (row.type !== "blank" || currentRun.length)) {
      currentRun.push({ element, row });
      continue;
    }

    flushRun();
  }

  flushRun();

  return {
    message: `Converted ${ replacements } taxonomy block${ replacements === 1 ? "" : "s" } into familySpeciesList markup.`,
    replacements,
  };
};
