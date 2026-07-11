// @ts-check

// Detects the "Current SACC membership" → "Editorial Advisors" section (in
// SACCBaseline.htm / Part 1 only) and wraps it in a single <div id="saccRoster">
// so the headings (already underlined <u> elements) and the member entries
// (<p> elements containing <span class="name">) can be collectively styled —
// e.g. indenting entries via CSS on #saccRoster p.
// Stops at <p><u>Past Committee Members</u> which is left outside the div.

const underlineText = (p) => {
  const u = p.querySelector("u");
  return u ? u.textContent ?? "" : "";
};

export const convertMembershipSection = (document) => {
  const paragraphs = [...document.querySelectorAll("p")];

  const startP = paragraphs.find((p) => /current sacc membership/i.test(underlineText(p)));
  if (!startP) return { message: "No membership section found — skipping.", wrapped: 0 };

  const stopP = paragraphs.find((p) => /past committee members/i.test(underlineText(p)));

  const elements = [];
  let current = startP;
  while (current && current !== stopP) {
    elements.push(current);
    current = current.nextElementSibling;
  }

  const isHeading = (el) => el.tagName === "P" && !!el.querySelector("u");
  const nl = () => document.createTextNode("\n\n");

  const div = document.createElement("div");
  div.id = "saccRoster";
  startP.before(document.createTextNode("\n\n"));
  startP.before(document.createComment(" #saccRoster: member entries indented via CSS"));
  startP.before(div);
  elements.forEach((el, index) => {
    if (index === 0) div.appendChild(nl());
    else if (isHeading(el)) div.appendChild(nl());
    div.appendChild(el);
    if (isHeading(el) && index < elements.length - 1) div.appendChild(nl());
  });

  return {
    message: `Wrapped ${ elements.length } element${ elements.length === 1 ? "" : "s" } in #saccRoster.`,
    wrapped: elements.length,
  };
};
