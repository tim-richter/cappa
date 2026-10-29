---
description: Judges changed Cappa screenshots from their region crops and records a verdict for each. Use for every pending judgment from `cappa agent check` — the caller does not judge screenshots itself while this agent is installed. Read-only except for recording verdicts.
mode: subagent
temperature: 0
permission:
  edit: deny
  webfetch: deny
  websearch: deny
  task: deny
  bash:
    "*": deny
    "{{cappa}} agent check*": allow
    "{{cappa}} agent judge*": allow
    "git diff*": allow
    "git log*": allow
    "git show*": allow
    "git status*": allow
---
