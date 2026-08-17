# `<a>` elements missing `href`

Audit of every `<a>` element across `clean/baseline/*.htm`, `clean/proposals/*.htm`,
and `clean/SACCCountryLists.htm` that has no `href` attribute. Found 6 total —
all are Word-internal artifacts (comment/bookmark anchors), not broken content
links. None of them ever had an `href` in the original source either.

## Findings

1. [SACCBaseline05.htm:2138](../../clean/baseline/SACCBaseline05.htm#L2138) —
   `<a>parrots</a>`. Word's marker for a reviewer's inline comment (dirty
   source: `<a style='mso-comment-reference:JR_1; mso-comment-date:...'>`).
   `stripWordFormatting` correctly removed the `style` attribute (no `color`
   in it), leaving the bare tag.
2. [SACCBaseline05.htm:2896](../../clean/baseline/SACCBaseline05.htm#L2896) —
   `<a name="_msocom_1"></a>`. Empty Word comment-thread anchor.
3. [SACCBaseline08.htm:147](../../clean/baseline/SACCBaseline08.htm#L147) —
   `<a name="_Hlt323732524"></a>`. Empty Word auto-generated bookmark.
4. [SACCprop1044.htm:86](../../clean/proposals/SACCprop1044.htm#L86) —
   `<a name="_Hlk167023781">Taxon nigricapillus showed lower song peak
   frequency...`. Word bookmark wrapping a full passage (for internal
   cross-referencing within the original .docx).
5. [SACCprop1044.htm:130](../../clean/proposals/SACCprop1044.htm#L130) —
   `<a name="_Hlk183161418"><b>Table 1</b></a>`. Same kind of bookmark,
   wrapping "Table 1".
6. [SACCprop875.htm:187](../../clean/proposals/SACCprop875.htm#L187) —
   `<a name="_Hlk47097812">Evangelista-Vargas & Silveira</a>`. Same kind of
   bookmark, wrapping an author citation.

## Conclusion

Zero genuinely broken links. All 6 are vestigial Word tooling markers
(comment references and auto-generated bookmarks, `name="_msocom_*"` /
`name="_Hlk*"` / `name="_Hlt*"` / `mso-comment-reference:*`) that serve no
purpose in the exported HTML — nothing in the final output actually navigates
to them. No action taken; reported for awareness only, per the user's
"just report, no changes" preference from the prior `.info`-link audit.
