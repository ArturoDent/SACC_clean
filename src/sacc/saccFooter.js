// @ts-check
const normalizeText = (value) =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const cloneLinkWithText = (document, link) => {
  const cleanLink = document.createElement("a");
  cleanLink.setAttribute("href", link.getAttribute("href"));
  cleanLink.textContent = normalizeText(link.textContent ?? "");

  return cleanLink;
};

const appendRow = (document, tbody, className, buildCell) => {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.className = className;

  buildCell(cell);
  row.append(cell);
  tbody.append(row);
};

const removeAdjacentBreaks = (element) => {
  for (const direction of ["previousSibling", "nextSibling"]) {
    let sibling = element[direction];

    while (
      sibling &&
      (
        (sibling.nodeType === sibling.TEXT_NODE && !normalizeText(sibling.nodeValue ?? "")) ||
        sibling.tagName === "BR"
      )
    ) {
      const nextSibling = sibling[direction];
      sibling.remove();
      sibling = nextSibling;
    }
  }
};

export const convertSaccFooter = (document) => {
  const forms = [...document.querySelectorAll("form")];
  let replacements = 0;

  for (const form of forms) {
    const dateParagraph = [...form.querySelectorAll("p")]
      .find((paragraph) => /\d{1,2}\s+\w+\s+\d{4}/.test(normalizeText(paragraph.textContent ?? "")));

    if (!dateParagraph) continue;

    const table = document.createElement("table");
    const tbody = document.createElement("tbody");
    table.className = "saccFooter";
    table.append(tbody);

    appendRow(document, tbody, "saccFooter-date", (cell) => {
      cell.textContent = normalizeText(dateParagraph.textContent ?? "");
    });

    const counterImages = [...form.querySelectorAll("table img")];
    if (counterImages.length) {
      appendRow(document, tbody, "saccFooter-counter", (cell) => {
        for (const image of counterImages) {
          const sourceLink = image.closest("a[href]");
          const cleanImage = image.cloneNode(true);
          cleanImage.removeAttribute("v:shapes");

          if (sourceLink) {
            const cleanLink = document.createElement("a");
            cleanLink.setAttribute("href", sourceLink.getAttribute("href"));
            if (sourceLink.hasAttribute("target")) cleanLink.setAttribute("target", sourceLink.getAttribute("target"));
            cleanLink.append(cleanImage);
            cell.append(cleanLink);
          } else {
            cell.append(cleanImage);
          }
        }
      });
    }

    const footerLinks = [...form.querySelectorAll("p > a[href]")].filter((link) =>
      /^www\.lsu\.edu\//.test(normalizeText(link.textContent ?? "")),
    );

    for (const footerLink of footerLinks) {
      appendRow(document, tbody, "saccFooter-link", (cell) => {
        cell.append(cloneLinkWithText(document, footerLink));
      });
    }

    form.replaceWith(table);
    removeAdjacentBreaks(table);
    table.before("\n\n");
    table.after("\n\n");
    replacements += 1;
  }

  return {
    message: `Converted ${ replacements } SACC footer${ replacements === 1 ? "" : "s" } to simple tables.`,
    replacements,
  };
};
