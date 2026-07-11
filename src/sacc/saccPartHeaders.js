// @ts-check

const normalizePartText = (p) =>
  (p.textContent ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();

const isPartHeader = (p) =>
  /^Part\s+\d+\./.test(normalizePartText(p));

const getPartNumber = (p) =>
  Number(normalizePartText(p).match(/^Part\s+(\d+)\./)?.[1]);

export const convertPartHeaders = (document) => {
  const paragraphs = [...document.querySelectorAll("p")];
  const first = paragraphs.find(isPartHeader);
  const last = [...paragraphs].reverse().find(isPartHeader);

  let count = 0;

  if (first && first === last) {
    // Only one part header in the file. If its number is > 1 there is no
    // "current part" header (e.g. SACC1 has "Part 2." but no "Part 1."),
    // so treat it as nextPart.
    first.classList.add("part");
    first.id = getPartNumber(first) > 1 ? "nextPart" : "thisPart";
    count++;
  } else {
    if (first) { first.classList.add("part"); first.id = "thisPart"; count++; }
    if (last)  { last.classList.add("part");  last.id  = "nextPart"; count++; }
  }

  return {
    message: `Added "part" class to ${ count } part header paragraph${ count === 1 ? "" : "s" }.`,
    count,
  };
};
