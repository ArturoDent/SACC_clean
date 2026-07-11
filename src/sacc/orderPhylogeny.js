// @ts-check
import { parseTaxonomyRow } from "./familySpeciesList.js";

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const isOrderPhylogenyRow = (row) =>
  ["blank", "subclass", "infraclass", "order", "suborder"].includes(row.type);

const buildOrderPhylogeny = (rows) => {
  let classes = "";
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


    if (row.type === "subclass") classes = "subclass level-0";
    else if (row.type === "infraclass") classes = "infraclass level-1";
    else if (row.type === "order") classes = "order level-2";
    else if (row.type === "suborder") classes = "order level-3";

    html.push(`    <li class="${ classes }">${ escapeHtml(row.label) }</li>`);
  }

  html.push("  </ul>", "</div>");
  return html.join("\n");
};

/*
* runs once if replacements = 1
* to run multiple times, uncomment flushRun() and remove return in flushRun()
*/
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
    // no suborder here - there are none in the orderPhylogeny

    if (hasSubclass && hasInfraclass && orderCount >= 4) {  // TODO: orderCount >= 4  ???
      currentRun[0].element.insertAdjacentHTML("beforebegin", buildOrderPhylogeny(rows));
      for (const { element } of currentRun) element.remove();
      currentRun = [];
      replacements += 1;
      // only use this return if only interested in first replacement orderPhylogeny
      return {
        message: `Converted ${ replacements } higher-level order phylogeny block${ replacements === 1 ? "" : "s" }.`,
        replacements,
      };
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

  // flushRun();  // uncomment to have this get multiple replacements

  return {
    message: `Converted ${ replacements } higher-level order phylogeny block${ replacements === 1 ? "" : "s" }.`,
    replacements,
  };
};
