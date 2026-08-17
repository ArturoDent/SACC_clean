# Working with Claude Code on this project

General Claude Code preferences (Plan Mode findings reports, VS Code regex
notes, markdown lint rules, link-checking habits) now live in the global
`~/.claude/CLAUDE.md` and apply here automatically — no need to duplicate
them in this file.

## Plan files

Plan files are saved to `.claude/plans/` (project-local, tracked in git —
see `plansDirectory` in `.claude/settings.json`) rather than the global
`~/.claude/plans/`, so plan history stays with the project and survives
across sessions/machines.

## Links in plans and reports

Plans and reports for this project live in `./.claude/plans` and
`./.claude/reports`. Make sure links point correctly to those locations —
note that report files need a `../../` prefix before repo-root paths.
