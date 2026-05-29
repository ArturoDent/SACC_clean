import { parseTaxonomyRow } from "./familySpeciesList.js";

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const isOrderPhylogenyRow = (row) =>
  ["blank", "subclass", "infraclass", "order"].includes(row.type);

const buildOrderPhylogeny = (rows) => {
  const html = ['<div id="orderPhylogeny">', "  <ul>"];
  let addedBreak = false;

  for (const row of rows) {
    if (row.type === "blank") {
      if (!addedBreak) {
        html.push("    <br>");
        addedBreak = true;
      }
      continue;
    }

    html.push(`    <li class="${ row.type }">${ escapeHtml(row.label) }</li>`);
  }

  html.push("  </ul>", "</div>");
  return html.join("\n");
};

export const convertOrderPhylogeny = (document) => {
  const container = document.querySelector("body > div") ?? document.body;
  const children = [...container.children];
  let replacements = 0;
  let currentRun = [];

  const flushRun = () => {
    if (!currentRun.length) return;

    const rows = currentRun.map(({ row }) => row);
    const contentRows = rows.filter((row) => row.type !== "blank");
    const hasSubclass = contentRows.some((row) => row.type === "subclass");
    const hasInfraclass = contentRows.some((row) => row.type === "infraclass");
    const orderCount = contentRows.filter((row) => row.type === "order").length;

    if (hasSubclass && hasInfraclass && orderCount >= 4) {
      currentRun[0].element.insertAdjacentHTML("beforebegin", buildOrderPhylogeny(rows));
      for (const { element } of currentRun) element.remove();
      replacements += 1;
    }

    currentRun = [];
  };

  for (const element of children) {
    const row = parseTaxonomyRow(element);

    if (row && isOrderPhylogenyRow(row) && (row.type !== "blank" || currentRun.length)) {
      currentRun.push({ element, row });
      continue;
    }

    flushRun();
  }

  flushRun();

  return {
    message: `Converted ${ replacements } higher-level order phylogeny block${ replacements === 1 ? "" : "s" }.`,
    replacements,
  };
};
