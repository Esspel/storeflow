# Issue Tracker Configuration

## Tracker: GitHub Issues

Issues for this repository live in the GitHub Issues of the repository at:
`https://github.com/Esspel/storeflow`

All agent skills that interact with issues (`to-tickets`, `to-spec`, etc.) should use the `gh` CLI.

### PRs as Request Surface

**Disabled** — Pull requests are not automatically treated as triage requests. If you want external PRs to enter the triage queue, set `prsAsRequestSurface: true` in this file and re-run the skill.
