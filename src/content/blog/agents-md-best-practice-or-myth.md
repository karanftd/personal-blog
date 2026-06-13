---
title: "AGENTS.md: Best Practice or Expensive Myth?"
description: "A new ETH Zurich study tested whether context files (AGENTS.md, CLAUDE.md) actually improve coding agent performance — across 4 models, 2 benchmarks, 438 tasks. The results challenge the conventional wisdom."
pubDate: 2026-06-13
tags: ["AI", "Agents", "LLM", "Engineering", "Developer Tools"]
---

Everyone from Anthropic to OpenAI recommends adding a context file to your repo. Drop an `AGENTS.md` or `CLAUDE.md` at the root, describe your project structure, tooling, and conventions — and your coding agent will perform better.

A study from ETH Zurich and LogicStar.ai (arXiv:2602.11988) just tested that assumption rigorously. The results are not what most people expect.

## The Study

**4 models** (Claude Sonnet-4.5, GPT-5.2, GPT-5.1 Mini, Qwen3-30B), **2 benchmarks** (SWE-Bench Lite + a new AGENTBENCH with 12 real niche Python repos), **438 tasks**, **3 conditions**:

- **NONE** — no context file, agent navigates cold
- **LLM** — auto-generated via `/init`
- **HUMAN** — developer-written file committed to the repo

## Myth vs. Reality

---

**Myth: Adding AGENTS.md makes agents more successful.**

**Reality:** LLM-generated context files *lower* success in 5 of 8 settings. Human-written files help marginally (+4% on average) — but not always.

---

**Myth: A codebase overview helps agents navigate faster.**

**Reality:** Directory maps (present in 95–100% of LLM-generated files, 8 of 12 human-written files) had no measurable effect on how quickly agents found relevant files. One model (GPT-5.1 Mini) spent *extra* steps hunting for the context file and re-reading it — confused by having it in both the filesystem and its context window.

---

**Myth: Context files are basically free.**

**Reality:** They increase inference cost by 20–23% every time, with no setting where they reduce it.

| Model | Cost (no file) | Cost (with LLM file) |
|---|---|---|
| Sonnet-4.5 | $1.30 | $1.51 (+16%) |
| GPT-5.2 | $0.32 | $0.43 (+34%) |
| GPT-5.1 Mini | $0.18 | $0.22 (+22%) |
| Qwen3-30B | $0.12 | $0.13 (+8%) |

Agents follow the instructions — more `grep`, more file reads, more test runs — they're just doing *more work*, not *better work*.

---

**Myth: LLM-generated files are useless — you need a human to write a good one.**

**Reality:** When repos had *no existing documentation*, LLM-generated context files improved performance by +2.7% and beat human-written ones. The problem is that for well-documented repos, they're redundant summaries of what already exists.

---

**Myth: Use a stronger model to generate the context file.**

**Reality:** GPT-5.2-generated files improved SWE-Bench (+2%) but *hurt* AGENTBENCH (−3%). Stronger models write longer, more thorough files — which adds overhead rather than clarity on niche repos.

---

## Dos and Don'ts

**Do:**
- Include specific tooling commands the agent couldn't guess: `uv run pytest`, `ruff check . --fix`
- Write a minimal file for repos with thin or no documentation — it genuinely helps orientation
- Specify only *non-obvious* requirements: unusual env vars, project-specific conventions not inferable from code

**Don't:**
- Auto-generate with `/init` for repos that already have decent docs — you're paying 20%+ more for no benefit
- Include directory maps or codebase overviews — they don't help agents navigate faster
- Add style guide summaries or generic instructions like "do thorough testing" — these add overhead without improving outcomes

> Every line you add to AGENTS.md is an instruction the agent will try to follow. If you can't point to a concrete failure it prevents, leave it out.

## Key Numbers

- **60,000+** public GitHub repos now have a context file
- **+20–23%** inference cost increase — every single time
- **+4%** average improvement from human-written files (modest, context-dependent)
- **−2%** average drop from LLM-generated files on realistic repos
- **2.5×** more use of repo-specific tools when mentioned in context files (instructions *are* being followed — the issue is what the instructions say)

## Caveats

All 438 tasks are Python repos. Models have extensive Python training data and are already well-calibrated without help. For niche languages (Rust, Zig, Lean) or domain-specific DSLs, context files might matter more.

The benchmark measures issue resolution (does the patch make tests pass?), not code quality or convention adherence. A context file enforcing a no-`eval` policy might have real value this study can't capture.

Developer-written files ranged from 24 to 2,003 words. The study measures the average across 12 repos — a carefully minimal context file could outperform that average.

## tl;dr

Auto-generated context files reliably increase cost and reduce task success rates. Human-written files help slightly — only when they're minimal and contain genuinely non-obvious information. Until better generation methods exist, treat `AGENTS.md` like production infrastructure: add only what you need, remove what you don't, and measure the effect.

---

*Source: "Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?" — Gloaguen et al., ETH Zurich / LogicStar.ai. arXiv:2602.11988, February 2026.*
