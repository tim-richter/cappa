---
name: cappa-judge
description: Judges changed Cappa screenshots from their region crops and records a verdict for each. Use for every pending judgment from `cappa agent check` — the caller does not judge screenshots itself while this agent is installed. Can only read files, run `cappa agent check|judge` and read-only git.
tools: Read, Glob, Grep, Bash
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: '{{cappa}} agent guard --runner "{{cappa}}"'
---
