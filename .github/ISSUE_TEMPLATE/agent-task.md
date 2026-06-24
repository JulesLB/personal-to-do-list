---
name: Agent task
about: Queue an Ember coding task for Claude to run during the day. End with @claude.
title: "[task] "
labels: []
assignees: []
---

**What I want**
<!-- One or two lines. What should change or exist when this is done? -->

**Where / which files**
<!-- Point at the area: a lib file, the board, the nudge engine, etc. Optional but helps. -->

**Definition of done**
<!-- How you'll know it's right. Default: npm test + npm run build pass, behavior described. -->

<!--
Guardrails (the cloud runner respects these; you review the PR anyway):
- No schema/migration changes (db:migrate hits prod). Flag if a change needs one; don't run it.
- No deploy, no prod data access. Drafts a PR only.
- Keep it small and self-contained so the diff is reviewable on a phone.
-->

@claude
