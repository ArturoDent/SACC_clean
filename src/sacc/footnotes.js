// @ts-check

/**
 * Wraps footnote paragraphs in <div class="footnotes"> blocks.
 *
 * A footnote block is defined as the run of <p> elements that appear between:
 *   - an <hr> whose immediately-preceding element sibling is a div.familySpeciesList
 * and:
 *   - the next <hr> (or end of body if none follows)
 *
 * The resulting structure makes it possible to style the hanging indent in CSS:
 *   div.footnotes p { padding-left: 2em; text-indent: -2em; }
 *
 * Only applies to SACCBaseline* files (wired in index.js for SACC1-SACC11).
 */
export const convertFootnotes = (document) => {
  const children = [...document.body.children];

  // First pass: collect footnote groups without touching the DOM yet.
  const groups = [];

  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.tagName !== "HR") continue;

    const prev = el.previousElementSibling;
    if (!prev || !prev.classList.contains("familySpeciesList")) continue;

    // Collect all non-HR elements until the next HR (or end of body).
    const footnoteEls = [];
    let j = i + 1;
    while (j < children.length && children[j].tagName !== "HR") {
      footnoteEls.push(children[j]);
      j++;
    }

    if (footnoteEls.length) groups.push(footnoteEls);
    i = j - 1;
  }

  // Second pass: wrap each group in a div.footnotes.
  for (const footnoteEls of groups) {
    const div = document.createElement("div");
    div.className = "footnotes";
    footnoteEls[0].before(div);
    footnoteEls.forEach((el, index) => {
      div.appendChild(el);
      if (index < footnoteEls.length - 1) div.appendChild(document.createTextNode("\n\n"));
    });
  }

  return {
    message: `Wrapped ${ groups.length } footnote block${ groups.length === 1 ? "" : "s" } in .footnotes (${ groups.reduce((n, g) => n + g.length, 0) } paragraphs total).`,
    blocks: groups.length,
  };
};
