// @ts-check

// Collapses any run of whitespace (including Word's non-breaking spaces, which
// JS's \s already matches) to a single space and trims the ends. Shared by every
// module that compares or rebuilds text so they all agree on what "blank" means.
/** @param {string} value */
export const normalizeText = (value) => value.replace(/\s+/g, " ").trim();
