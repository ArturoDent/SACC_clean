// Minimal zero-dependency .xlsx reader.
//
// An .xlsx file is a ZIP archive of XML parts. Rather than adding a
// spreadsheet package as a dependency, this inflates the parts we need with
// Node's built-in zlib and parses them with regexes.
//
//   readSheetRows(xlsxPath) -> Map<rowNumber, Record<columnLetter, string>>
//
// e.g. rows.get(4).E === "Rhea americana"

import fs from "node:fs";
import zlib from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const EOCD_MIN_SIZE = 22;
const STORED = 0;

// Locate the End Of Central Directory record by scanning backwards from the
// end of the file. It is last, but a trailing comment can push it back, so we
// cannot simply read it at a fixed offset.
const findEndOfCentralDirectory = (buffer) => {
  for (let offset = buffer.length - EOCD_MIN_SIZE; offset >= 0; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error("Not a ZIP archive: no end-of-central-directory record found.");
};

// Inflate every entry in the archive. Returns Map<entryName, Buffer>.
const unzip = (buffer) => {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let i = 0; i < entryCount; i++) {
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeader = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    // The local header repeats the name/extra lengths, and they can differ
    // from the central directory's, so re-read them there to find the data.
    const localNameLength = buffer.readUInt16LE(localHeader + 26);
    const localExtraLength = buffer.readUInt16LE(localHeader + 28);
    const dataStart = localHeader + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);

    entries.set(name, method === STORED ? data : zlib.inflateRawSync(data));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
};

const decodeXmlEntities = (value) =>
  value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replaceAll("&amp;", "&");  // last, so "&amp;lt;" does not become "<"

const textOf = (xml) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("");

// Shared strings are stored once and referenced by index from the cells.
// A single string can be split across several <t> runs when it carries rich
// text formatting, so each <si> is the concatenation of its runs.
const parseSharedStrings = (xml) =>
  [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decodeXmlEntities(textOf(m[1])));

const cellValue = (attributes, inner, sharedStrings) => {
  const type = /\bt="([^"]+)"/.exec(attributes)?.[1];
  if (type === "s") {
    const index = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]);
    return sharedStrings[index] ?? "";
  }
  if (type === "inlineStr") return decodeXmlEntities(textOf(inner));
  return decodeXmlEntities(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
};

export const readSheetRows = (xlsxPath, sheetPart = "xl/worksheets/sheet1.xml") => {
  const entries = unzip(fs.readFileSync(xlsxPath));

  const sharedStringsPart = entries.get("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsPart ? parseSharedStrings(sharedStringsPart.toString("utf8")) : [];

  const sheet = entries.get(sheetPart);
  if (!sheet) throw new Error(`${ xlsxPath } has no ${ sheetPart }`);

  const rows = new Map();
  // Both rows and cells may be self-closing when empty, hence the alternation.
  for (const rowMatch of sheet.toString("utf8").matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(/\br="(\d+)"/.exec(rowMatch[1])?.[1]);
    if (!rowNumber) continue;

    const cells = {};
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const column = /\br="([A-Z]+)\d+"/.exec(cellMatch[1])?.[1];
      if (!column) continue;
      cells[column] = cellValue(cellMatch[1], cellMatch[2] ?? "", sharedStrings);
    }
    rows.set(rowNumber, cells);
  }

  return rows;
};
