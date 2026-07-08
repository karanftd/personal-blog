---
title: "Building a Financial Chatbot That Can Actually Do the Math"
description: "How I built a conversational AI over the ConvFinQA dataset using LangGraph, Program-of-Thought reasoning, and a few non-obvious design choices that took accuracy from 70% to 95%."
pubDate: 2026-07-08
tags: ["llm", "langgraph", "python", "ai", "finance"]
---

Financial documents are the worst possible input for a language model. They are dense with numbers, tables half-formatted as prose, and questions that chain three or four arithmetic steps across paragraphs that were written years apart. Ask a model "what was the percentage change in net revenue from 2009 to 2010?" and you are really asking it to locate two numbers from a semi-structured table, subtract them, divide by the base, and multiply by 100 — without making a single arithmetic mistake along the way.

That is the core challenge of the **ConvFinQA** dataset, and it is the problem I built a system around as part of a technical assessment for [Tomoro.ai](https://tomoro.ai). This post is a writeup of the decisions that mattered.

You can try the live chatbot at **[karanftd.com/chat](https://karanftd.com/chat)**.

---

## What the Dataset Actually Demands

ConvFinQA is not a simple Q&A benchmark. Each record contains:

- A **financial report excerpt** — a mix of narrative text and data tables from real SEC filings
- A **multi-turn conversation** — follow-up questions that reference prior answers ("what about the prior year?" or "and sales?")
- **Multi-hop numerical reasoning** — answers that require combining values across multiple table cells or paragraphs

The multi-turn part is the sneaky hard part. A naive stateless approach that just embeds the document and retrieves chunks fails badly on follow-up questions because those questions carry no self-contained meaning — "and the 2009 figure?" means nothing without the prior exchange.

---

## The Architecture

The system is a Python package with a Typer CLI as the entry point. Under the hood it uses **LangGraph** to manage the conversation as a stateful graph.

```
CLI / Evaluator
      │
      ▼
ConvFinQA Agent          ← owns AgentState (messages, document, chunks, history)
  ├── ConvFinQA Loader   ← reads JSON, converts to Markdown, caches
  │       └── chunk_markdown()  ← splits by sentence; table row → chunk + header
  └── LangGraph StateGraph
          ├── agent_node  ←→  tool_node (loop until final answer)
          └── memory_node → END
                │
                ▼
           OpenAI GPT-4o
           tools: python_eval, retrieve_context
```

The agent owns the document for the lifetime of the session. The graph loops — agent calls a tool, tool returns a result, agent decides whether to call another tool or emit a final answer. This loop handles multi-step arithmetic naturally.

---

## Design Decision 1: Program-of-Thought over Chain-of-Thought

This was the most impactful single decision.

**Chain-of-thought (CoT)** has the model reason in natural language and compute the number itself. It writes: *"The 2010 sum is 18.1 + (−6.3) = 11.8. The 2009 sum is 14.6 + (−5.2) = 9.4. The change is 11.8 − 9.4 = 2.4."* The arithmetic happens inside the model's text generation.

The problem: language models are not calculators. They hallucinate arithmetic. Not always, not dramatically, but enough that on a benchmark where the answer is a specific number, it destroys accuracy.

**Program-of-thought (PoT)** separates the concerns. The model decides *what* to compute, but hands the actual computation to a deterministic executor. Instead of writing the number, it emits a tool call:

```python
subtract(add(18.1, -6.3), add(14.6, -5.2))
```

The calculator returns `2.4`. The model did the reasoning and value-selection; code did the math.

The accuracy jump was significant — from around 70% with `gpt-4o-mini` doing CoT to 90–95% with `gpt-4o` doing PoT. The model upgrade mattered, but stripping arithmetic hallucination from the loop was the bigger lever.

I also built a configurable mode via `AGENT_CALC_MODE` in `.env` that switches between PoT and direct LLM evaluation. PoT has the additional debugging advantage of producing one tool call per arithmetic step, so you can inspect exactly which operation was applied first — useful when a complex expression like `((a - b) / b * 100 // 2) + (x + y) / 2` gives a wrong answer.

---

## Design Decision 2: JSON → Markdown Before Prompting

The ConvFinQA dataset stores documents as JSON — text fields mixed with table arrays. I convert everything to Markdown pipe tables before it touches the model.

| | JSON | JSONL | Markdown |
|---|---|---|---|
| LLM readability | Medium | Medium | **Best** |
| Token efficiency | Worst | Medium | **Best** |
| Table alignment visible to model | No | No | **Yes** |
| Column → value association | Error-prone (index-based) | OK | Explicit headers |

The reasoning is straightforward: every major LLM has been trained on enormous amounts of Markdown, particularly pipe tables from GitHub and Wikipedia. The model natively understands column alignment. JSON repeats key names on every row ("gallons", "gallons", ...) — Markdown headers appear once. For a 2009 JKHY annual report with seven columns and thirty rows, this is not a small difference.

The conversion runs once at session start and the result is cached. The model never sees raw JSON.

---

## Design Decision 3: Prompt Caching

For multi-turn conversations over the same document, naively re-sending the full document on every turn is expensive and slow. I cache the document in the system prompt and mark it for caching.

| | Without Cache | With Cache |
|---|---|---|
| System prompt tokens per call | ~2k | ~2k |
| Charged as input tokens | ~2k | 0 (cache hit) |
| Total billed over 12 turns | ~24k tokens | ~2k tokens |
| **Saving** | — | **~90%** |

The cached prefix gets longer as the conversation progresses — later turns in a session are progressively cheaper. The document, the most expensive part, is never re-billed after the first call.

The implementation loads only the requested `chat_id`'s document into context rather than the entire dataset, which keeps the system prompt tight regardless of dataset size.

---

## Design Decision 4: LangGraph StateGraph for Multi-Turn Memory

I evaluated a few approaches for the conversation loop before settling on LangGraph's `StateGraph`.

The alternative — manually injecting prior Q&A into each new prompt — works but requires bookkeeping that leaks into application logic. With `StateGraph`, state persists across turns automatically. The graph defines:

- An `agent_node` that calls the LLM
- A `tool_node` that executes calculator and retrieval tools
- A `memory_node` that writes the completed turn to conversation history
- Conditional routing: if the agent emits a tool call, go to `tool_node`; if it emits a final text answer, go to `memory_node` → `END`

The rolling buffer auto-prunes to the last 10 turns. This bounds context growth while keeping enough history for follow-ups like "and sales?" to resolve correctly.

---

## Accuracy Results

| Model | Reasoning Mode | Accuracy |
|---|---|---|
| gpt-4o-mini | Chain-of-Thought | ~70% |
| gpt-4o | Chain-of-Thought | ~80% |
| gpt-4o | Program-of-Thought | **~90–95%** |

The remaining failures are mostly on records with ambiguous column references or questions that require external financial knowledge not present in the document.

---

## What I Would Do Differently at Scale

**Retrieval over the full document instead of full-context injection.** For longer filings (10-K documents can be 100+ pages), stuffing the entire document into the system prompt hits context limits and burns tokens. A proper retrieval layer — embedding chunks and fetching the top-k relevant sections — would be necessary. For the ConvFinQA records (which are already excerpts), full-context works fine.

**Structured output for the final answer.** Currently the model emits free-form text. For an evaluation harness, a structured response with `answer`, `confidence`, and `reasoning_steps` would make automated scoring easier and let you catch cases where the model expresses uncertainty.

**Streaming.** The current implementation is request-response. Adding server-sent events through the FastAPI layer would make the hosted demo feel much faster on complex multi-step questions.

---

## Try It

The chatbot is live at **[karanftd.com/chat](https://karanftd.com/chat)**.

The source code was submitted as a feature branch to Tomoro.ai's repository. The hosted demo uses FastAPI with Jinja2 templates, deployed on Railway, exposing the same LangGraph agent over HTTP.

If you are building anything in the financial QA space, the core insight is worth repeating: **do not let the model do arithmetic**. The moment you hand computation to a deterministic tool, a whole class of errors disappears. The model's job is to understand what needs to be computed and to select the right values. A calculator's job is to compute it.
