// @ts-check

// Wraps the status-code definition paragraphs in SACCCountryLists.htm into
// two <div class="statusCodes"> blocks:
//   1. Everything after <p><u>Status</u></p> up to (not including) <p>Also:</p>
//   2. Everything after <p>Also:</p> up to (not including) <p><u>Taxonomy</u></p>
// The wrapping divs allow the definitions to be indented via CSS.

export const convertStatusCodes = (document) => {
  const paragraphs = [...document.querySelectorAll("p")];

  const getU = (p) => p.querySelector("u")?.textContent?.trim() ?? "";

  const statusP   = paragraphs.find((p) => getU(p) === "Status");
  const alsoP     = paragraphs.find((p) => p.textContent?.trim() === "Also:");
  const taxonomyP = paragraphs.find((p) => getU(p) === "Taxonomy");

  if (!statusP || !alsoP || !taxonomyP) {
    return { message: "Status section boundaries not found — skipping.", blocks: 0 };
  }

  const collectUntil = (startEl, stopEl) => {
    const group = [];
    let cur = startEl?.nextElementSibling;
    while (cur && cur !== stopEl) {
      group.push(cur);
      cur = cur.nextElementSibling;
    }
    return group;
  };

  const wrap = (group) => {
    if (!group.length) return;
    const div = document.createElement("div");
    div.className = "statusCodes";
    group[0].before(document.createTextNode("\n\n"));
    group[0].before(document.createComment(" .statusCodes: child paragraphs indented via CSS "));
    group[0].before(div);
    for (const el of group) div.appendChild(el);
  };

  const firstGroup  = collectUntil(statusP, alsoP);
  const secondGroup = collectUntil(alsoP, taxonomyP);

  wrap(firstGroup);
  wrap(secondGroup);

  return {
    message: `Wrapped ${ firstGroup.length } + ${ secondGroup.length } paragraphs into 2 .statusCodes blocks.`,
    blocks: 2,
  };
};
