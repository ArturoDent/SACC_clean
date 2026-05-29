import { familyNames, orderNames, taxonomyNames } from "./orders.js";

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
  const scientificName = normalizeText(
    segments
      .filter((segment) => segment.italic)
      .map((segment) => segment.text)
      .join(" "),
  );

  if (!scientificName) return null;

  const fullText = normalizeText(element.textContent ?? "");
  if (!fullText.startsWith(scientificName)) return null;

  const rest = normalizeText(fullText.replace(scientificName, ""));

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

  if (taxonomyNames.subclass.has(text)) return { type: "subclass", label: text };
  if (taxonomyNames.infraclass.has(text)) return { type: "infraclass", label: text };

  const order = findPrefixedName(text, orderNames);
  if (order) return { type: "order", label: order.name, note: order.rest };

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

  if (/^[A-Z][a-z]+inae(?:\s+.*)?$/.test(text) && !element.querySelector("i")) {
    return { type: "subfamily", label: text };
  }

  const species = splitSpeciesParts(element);
  if (species?.commonName) return { type: "species", ...species };

  return null;
};

const rowHasListContent = (row) =>
  ["subclass", "infraclass", "order", "family", "subfamily", "species"].includes(row.type);

const formatNote = (note) => (note ? ` <span>${ escapeHtml(note) }</span>` : "");

const speciesHtml = ({ scientificName, commonName, note }) => {
  let classList = "commonName";
  if (commonName.match("(IN)")) classList = "commonName introduced";
  return `<li>${ escapeHtml(scientificName) } <span class="${ classList }">${ escapeHtml(commonName) }</span>${ note ? ` ${ escapeHtml(note) }` : "" }</li>`;
};

const buildFamilySpeciesList = (rows) => {
  if (!rows.some((row) => row.type === "family" || row.type === "species")) {
    return rows.map((row) => row.original ?? "").join("\n");
  }

  const html = ['<div class="familySpeciesList">', "", "  <ul>"];
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

    if (["subclass", "infraclass", "order"].includes(row.type)) {
      closeFamily();
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
      html.push(`        <li class="subfamily">${ escapeHtml(row.label) }`);
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
  html.push("  </ul>", "", "</div>");
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
    const hasFamilyContent = rows.some((row) => row.type === "family");
    const replacementHtml = hasListContent && hasFamilyContent
      ? buildFamilySpeciesList(rows)
      : currentRun.map(({ element }) => element.outerHTML).join("\n");

    currentRun[0].element.insertAdjacentHTML("beforebegin", replacementHtml);
    for (const { element } of currentRun) element.remove();
    if (hasListContent && hasFamilyContent) replacements += 1;
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
