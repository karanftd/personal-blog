---
title: "SKILLS.md vs AGENTS.md: What's the Difference?"
description: "Two files, two jobs. AGENTS.md tells the agent about your project. SKILLS.md tells it how to work. Here's the simple mental model for when to use which."
pubDate: 2026-06-13
tags: ["AI", "Agents", "LLM", "Developer Tools", "Claude Code"]
---

If you use Claude Code or any modern coding agent, you've probably seen both `AGENTS.md` and `SKILLS.md` mentioned. They sound similar. They're not.

Here's the simplest way to think about it:

> **AGENTS.md** answers *"What is this project?"*
> **SKILLS.md** answers *"What can you do?"*

## AGENTS.md — The Project Brief

`AGENTS.md` (also `CLAUDE.md`, `GEMINI.md` depending on the agent) is a **repo-level context file**. It's written once, lives in your project root, and gets injected into every agent session automatically.

It should contain only what the agent can't figure out on its own:

- How to run tests: `uv run pytest`
- How to format code: `ruff check . --fix`
- Non-obvious environment requirements: "requires `STRIPE_TEST_KEY` set locally"
- Project-specific conventions: "generated files in `/gen` are never edited manually"

Think of it as a one-page onboarding doc — but for the agent, not your teammates.

**What it's not:** a directory map, an architecture overview, or a style guide summary. Research shows those add cost without improving performance.

## SKILLS.md — The Capability Playbook

`SKILLS.md` is different. It's not about a specific repo — it's about **reusable workflows** the agent can apply across any project. It documents *how to do things*, not *what this project is*.

Examples of what goes in SKILLS.md:

- "To debug a flaky test, start by isolating it with `pytest -k` then check for shared state"
- "When planning a feature, always run `/plan` first and wait for confirmation"
- "For database migrations, run `--dry-run` before applying"

Think of it as a playbook of proven workflows. It travels with the agent, not with the project.

## Quick Decision Guide

| Question | Use |
|---|---|
| Where do my tests live and how do I run them? | `AGENTS.md` |
| What's the process for planning a big feature? | `SKILLS.md` |
| What build tool does this repo use? | `AGENTS.md` |
| How should the agent approach debugging? | `SKILLS.md` |
| What are the naming conventions in this project? | `AGENTS.md` |
| What's the workflow for reviewing and committing code? | `SKILLS.md` |

## The One-Line Rule

If the information changes when you switch projects → **AGENTS.md**.

If it stays the same regardless of what you're working on → **SKILLS.md**.

Keep both files short. Every line is an instruction the agent will act on. More instructions mean more steps, more cost, and often no better outcome. Write only what solves a real, observable problem.
