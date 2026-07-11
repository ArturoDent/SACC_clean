// @ts-check
const AUX_LINK_KEYS = ["SACCHypoList", "SACCHybridList", "SACCBiblio"];

const findStandaloneAuxLink = (document, hrefKey) => {
  for (const link of document.querySelectorAll(`a[href*="${ hrefKey }"]`)) {
    const p = link.closest("p");
    if (!p) continue;
    // Only the standalone paragraphs have the link as their sole element child
    // paragraph is standalone if all its text content lives inside the link
    const pText = (p.textContent ?? "").replace(/\s+/g, " ").trim();
    const linkText = (link.textContent ?? "").replace(/\s+/g, " ").trim();
    if (pText === linkText) return { p, link };
  }
  return null;
};

export const convertSaccAuxLinks = (document) => {
  const found = AUX_LINK_KEYS.map(key => findStandaloneAuxLink(document, key)).filter(item => item !== null);

  if (!found.length) return { message: "No auxiliary links found.", replaced: 0 };

  const div = document.createElement("div");
  div.id = "auxiliaryLinks";
  div.append("\n");

  found.forEach(({ link }, i) => {
    const span = document.createElement("span");
    const cleanLink = document.createElement("a");
    cleanLink.setAttribute("href", link.getAttribute("href"));
    cleanLink.textContent = link.textContent.replace(/\s+/g, " ").trim();
    span.append(cleanLink);
    div.append(span);
    if (i < found.length - 1) {
      div.append(document.createElement("br"));
      div.append("\n");
    }
  });

  found[0].p.before(div);
  for (const { p } of found) p.remove();

  return {
    message: `Converted ${ found.length } auxiliary link${ found.length === 1 ? "" : "s" } to #auxiliaryLinks block.`,
    replaced: found.length,
  };
};
