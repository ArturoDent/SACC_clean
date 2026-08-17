# Draft a comment on claude-code issue #41112

## Context

While setting up a global `~/.claude/CLAUDE.md`, the user hit the exact bug
reported in [anthropics/claude-code#41112](https://github.com/anthropics/claude-code/issues/41112):
markdown links in the Claude Code chat pane that point outside the workspace
root render as clickable (blue, hand cursor) but do nothing when clicked —
a "false affordance." The filed issue documents this for raw absolute
Windows paths; the user's repro additionally shows it happening with a
`file://` URI to a path outside the workspace, and specifically for the
**global** `~/.claude/CLAUDE.md` config file, which structurally can never
have a workspace-relative path since it isn't part of any project.

The user wants a comment drafted for that issue adding this data point, but
explicitly does **not** want it submitted yet — they want to review it
themselves first (most likely by posting it via the GitHub web UI, or by
double-checking it here before I run `gh issue comment`).

## Plan

1. Write the draft comment text to a markdown file in the session scratchpad
   directory (not the repo — this is throwaway/reference content, not
   project material): `comment-draft-41112.md`.
2. Draft content will:
   - Confirm this reproduces on a different setup (mention Windows 11 +
     VS Code, consistent with the existing report).
   - Add the specific case: linking to the **global** `~/.claude/CLAUDE.md`
     — a file that is inherently outside any workspace root, so a
     workspace-relative link can never be constructed for it. This is a
     useful edge case for the maintainers since it's not just "a project
     file located elsewhere" but a category of file (user-level config)
     that will always trigger the bug.
   - Note that both a bare absolute path (`C:\Users\...\CLAUDE.md`) and a
     `file:///C:/Users/...` URI were tried in the chat pane and neither
     produced a working link, while pasting the same `file://` URI into an
     actual file's contents and clicking it in the editor worked fine (VS
     Code's native link detection, unrelated to the extension).
   - Keep it short and factual — a repro data point, not a rewrite of the
     existing report.
3. Show the drafted text to the user in this chat for review.
4. **Do not run `gh issue comment` or otherwise post anything.** Submission
   is a separate, explicitly-confirmed follow-up action outside this plan —
   posting a comment on a public GitHub issue is a visible, hard-to-fully-
   reverse action (comments can be edited/deleted but the notification to
   watchers already fired), so it needs the user's explicit go-ahead on the
   exact final text, not just plan approval.

## Verification

Not applicable — this produces text content for human review, not code.
Success is the user confirming the draft reads correctly before any
submission happens.
