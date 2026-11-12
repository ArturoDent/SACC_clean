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

## Links for web fetch

The original "dirty" source of the files is `http://www.museum.lsu.edu/~Remsen/`  This is a flat collection so there are no subfolders like `baseline` or `proposals` so all files are found at the top level `http://www.museum.lsu.edu/~Remsen/`

WebFetch converts the page to markdown and summarizes via a small model rather than returning raw bytes — good for spotting version drift and prose changes like this, but not reliable for a byte-exact diff of a 1000+ line taxonomic table (it can miss or compress rows). If you want a rigorous content diff (e.g., which species/proposals changed between 27 Feb and 25 Jul), the better approach is to fetch the raw HTML via curl/Bash and diff it against dirty/baseline/SACCBaseline.htm's pre-cleaned source, since this repo's src/pipeline/createCleanHtml.js already reformats structure and would otherwise create noise in a naive diff.

've now diffed the raw HTML (both are pre-cleanup Word exports, so this comparison is apples-to-apples — no pipeline reformatting noise). The 17,000-line file produced ~463 diff lines, but almost all of it is inert Word-export noise. Filtering that out, here's what actually changed on the live page since the local dirty/baseline/SACCBaseline.htm snapshot.

Normalize whitespace before diffing.
