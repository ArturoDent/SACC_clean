// @ts-check

/**
 * Cleans up the Word-exported species-count table in SACCCountryLists.htm:
 *  - assigns id="speciesListTable", removes MsoTableGrid class and deprecated
 *    presentation attributes (border, cellspacing, cellpadding, style)
 *  - strips valign and width from every <td> (CSS handles it)
 *  - unwraps <p> elements inside each <td>, leaving only inline content
 */
export const convertSpeciesListTable = (document) => {
  const table = document.querySelector("table.MsoTableGrid");
  if (!table) return { message: "No MsoTableGrid table found — skipping.", count: 0 };

  table.id = "speciesListTable";
  table.removeAttribute("class");
  table.removeAttribute("border");
  table.removeAttribute("cellspacing");
  table.removeAttribute("cellpadding");
  table.removeAttribute("style");

  for (const td of table.querySelectorAll("td")) {
    td.removeAttribute("valign");
    td.removeAttribute("width");
    for (const p of td.querySelectorAll("p")) {
      p.replaceWith(...p.childNodes);
    }
    for (const node of [...td.childNodes]) {
      if (node.nodeType === node.TEXT_NODE && !node.textContent?.trim()) {
        node.remove();
      }
    }
    for (const span of td.querySelectorAll("span:empty")) {
      span.remove();
    }
  }

  return { message: "Converted species list table to #speciesListTable.", count: 1 };
};

/**
 * Reclassifies three #speciesListTable columns by position rather than content —
 * "Argentina", "1052", and "18" carry no textual signal distinguishing them from
 * any other .info/.red span in the document, only their column does:
 *  - column 1 (country name): .info -> .country
 *  - column 2 (total count): .info -> .total (header's "TOTAL" has no class and
 *    is left black, since it's not itself a per-country total)
 *  - column 4 (endemic count): .red -> .endemic
 */
export const classifySpeciesListColumns = (document) => {
  const table = document.querySelector("#speciesListTable");
  if (!table) return { message: "No #speciesListTable found — skipping.", recolored: 0 };

  let recolored = 0;

  for (const row of table.querySelectorAll("tr")) {
    const cells = [...row.children];

    const country = cells[0]?.querySelector("span.info");
    if (country) { country.className = "country"; recolored++; }

    const total = cells[1]?.querySelector("span.info");
    if (total) { total.className = "total"; recolored++; }

    const endemic = cells[3]?.querySelector("span.red");
    if (endemic) { endemic.className = "endemic"; recolored++; }
  }

  return {
    message: `Reclassified ${ recolored } species-list-table span${ recolored === 1 ? "" : "s" } by column.`,
    recolored,
  };
};
