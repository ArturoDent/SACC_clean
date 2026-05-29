/**
 * Assign hierarchical level-N classes to direct children of .familySpeciesList > ul,
 * then normalize so the first top-level item in each list becomes level-0.
 *
 * Also add nested-level-(familyLevel+1) to .subfamily elements that are direct children
 * of a family's nested UL so subfamilies are visually one step deeper than their family.
 */
export async function addTaxonomyLevels(root = document, prefix = "level-", nestedPrefix = "nested-level-") {
  const rankOrder = { subclass: 0, infraclass: 1, order: 2, family: 3 };

  // 1) Compute raw levels for each top-level list and store them
  const lists = Array.from(root.querySelectorAll(".familySpeciesList > ul"));
  lists.forEach(ul => {
    const items = Array.from(ul.children).filter(n => n.nodeType === 1);
    if (items.length === 0) return;

    // compute raw levels (inherit previous when no explicit rank)
    const rawLevels = [];
    let currentLevel = 0;
    items.forEach(li => {
      let level = null;
      for (const rank in rankOrder) {
        if (li.classList.contains(rank)) { level = rankOrder[rank]; break; }
      }
      if (level === null) level = currentLevel;
      rawLevels.push(level);
      currentLevel = level;
    });

    // normalize so first item becomes 0
    const offset = rawLevels[0];
    const normalized = rawLevels.map(l => Math.max(0, l - offset));

    // assign normalized classes
    items.forEach((li, i) => {
      li.classList.add(`${ prefix }${ normalized[i] }`);
    });
  });

  // 2) Add nested-level to subfamily children inside each top-level family
  const familyLis = Array.from(root.querySelectorAll(".familySpeciesList > ul > li.family"));
  familyLis.forEach(familyLi => {
    // read normalized family level if present, otherwise default to 3
    const familyLevelClass = Array.from(familyLi.classList).find(c => c.startsWith(prefix));
    const familyLevel = familyLevelClass ? parseInt(familyLevelClass.slice(prefix.length), 10) : 3;
    const nestedLevel = familyLevel + 1;

    const nestedUl = familyLi.querySelector(":scope > ul");
    if (!nestedUl) return;

    Array.from(nestedUl.children).forEach(childLi => {
      if (childLi.nodeType !== 1) return;
      if (childLi.classList.contains("subfamily")) {
        childLi.classList.add(`${ nestedPrefix }${ nestedLevel }`);
      }
    });
  });
}
