# Working with Claude Code on this project

## Plan Mode findings reports

Whenever in Plan Mode and presenting investigation/audit findings — a list of
file locations or instances found during exploration (e.g. "found 6 `<a>`
elements missing `href`") — also write those findings to a separate markdown
report file in `.claude/reports/` (create the directory if needed), using
clickable markdown links to each finding (`[filename.ts:42](path/to/file.ts#L42)`
format). Name the file descriptively (e.g. `missing-href-audit.md`), and link
to it prominently in the chat response so the user can open it directly.

This is separate from the plan file itself (which documents the implementation
plan, not raw findings) and separate from a one-off answer in chat (which
isn't kept anywhere after the conversation scrolls away).

## Plan files

Plan files are saved to `.claude/plans/` (project-local, tracked in git —
see `plansDirectory` in `.claude/settings.json`) rather than the global
`~/.claude/plans/`, so plan history stays with the project and survives
across sessions/machines.

## VS Code regex's

Remeber that in VS Code to have the match extend across likes that you must include a literal "\n" to span newlines.  "\s" is not sufficient.  So for example "[\s}" should be "[\s\n]".
