---
title: "What I Learned Shipping LLM Features in Production"
description: "From itinerary generation to content automation — practical lessons on latency, cost, prompt stability, and knowing when not to use an LLM."
pubDate: 2025-01-22
tags: ["AI", "LLM", "Python", "Product Engineering"]
---

We shipped our first LLM-powered feature at Pelago in mid-2023 — an AI itinerary generator that turns a destination and travel dates into a personalised day-by-day plan. A year and several features later, here's what I wish someone had told me before we started.

## Latency Is a Product Decision

The first demo of the itinerary generator took 14 seconds to respond. That's fine in a Jupyter notebook. It's catastrophic in a booking flow where a user has already entered their dates and is waiting.

We solved this with **streaming responses** — sending tokens to the frontend as they're generated rather than waiting for the full completion. The actual latency didn't change, but *perceived* latency dropped dramatically because users saw something happening immediately.

```python
async def stream_itinerary(destination: str, dates: tuple) -> AsyncIterator[str]:
    async with anthropic_client.messages.stream(
        model="claude-opus-4-5",
        max_tokens=1500,
        messages=[{"role": "user", "content": build_prompt(destination, dates)}]
    ) as stream:
        async for text in stream.text_stream:
            yield text
```

## Prompt Stability Is an Engineering Problem

Prompts are code. Treat them that way.

We version-control every prompt, run evals against a golden dataset before any prompt change ships, and have a rollback path. The first time a prompt "improvement" silently degraded output quality for a subset of destinations and we had no way to detect it, we built the eval pipeline the next sprint.

A prompt change that improves average quality by 10% but introduces a 5% failure rate on edge cases isn't an improvement — it's a regression.

## Cost Compounds Faster Than You Think

LLM API costs are easy to underestimate at low volume and easy to panic about at scale. We track cost per feature invocation as a first-class metric alongside latency and error rate.

Three things that meaningfully reduced our costs:

1. **Caching**: Deterministic inputs (popular destinations, standard date ranges) get cached. ~30% of our itinerary requests now hit cache.
2. **Smaller models for simpler tasks**: We use Claude Haiku for classification and extraction tasks, reserving Sonnet/Opus for generation. 
3. **Prompt compression**: Removing redundant instructions and verbose examples from prompts reduced token usage by ~20% with no measurable quality loss.

## When Not to Use an LLM

The highest-ROI decision we made was *not* using an LLM for our promotion targeting engine. The initial proposal was to use GPT to score user-promotion affinity. We ended up with a rules-based ML model instead.

LLMs are bad at:
- Tasks requiring strict numerical reasoning
- Anything that needs a guaranteed structured output format (yes, even with JSON mode)
- Low-latency (<100ms) inference paths
- Tasks where you need to explain the decision to a regulator

Use them for what they're actually good at: generating natural language, summarisation, flexible extraction from unstructured text, and tasks where "pretty good most of the time" is acceptable.

## The Shift in Engineering Thinking

The hardest adjustment wasn't technical — it was probabilistic thinking. Traditional software is deterministic. LLM outputs are distributions. Your job as an engineer is to shape that distribution: narrow the variance, shift the mean, and define what "good enough" means for your use case.

Once you internalise that, everything from prompt design to eval pipelines to fallback strategies starts to make sense.
