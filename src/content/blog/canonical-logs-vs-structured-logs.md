---
title: "Canonical Logs vs Structured Logs: Choosing Your Logging Strategy"
description: "A practical guide to understanding the trade-offs between canonical (unstructured) and structured logging, and when to use each approach in your backend systems."
pubDate: 2026-06-02
tags: ["Observability", "Logging", "Backend", "DevOps", "Engineering"]
---

Most teams start with canonical logs—free-form text that developers write by hand. They work until they don't. Then you hit a page at 3am trying to debug a distributed transaction, and grep through thousands of log lines only to realize the information you need was buried in a different format on a different service.

This is where structured logging comes in. But structured logging isn't a simple upgrade—it's a different philosophy that trades off developer ergonomics for operational clarity.

## What Are Canonical Logs?

Canonical logs are human-written, free-form text messages. They're what you probably have now:

```python
logger.info(f"User {user_id} processed payment of ${amount}")
logger.error(f"Failed to connect to Stripe API after {retries} retries: {error}")
logger.debug(f"Cache hit for key: {cache_key}, ttl_remaining: {ttl}")
```

**Strengths:**
- **Easy to write**: You just write what you think matters at that moment
- **Readable**: A human can scan logs and immediately understand what happened
- **Flexible**: Want to log a nested object? Just stringify it. Need to change the format? No schema to update

**Weaknesses:**
- **Unsearchable**: "Find all payment failures for user 123" requires parsing text
- **Inconsistent**: Different developers format messages differently. One writes `user_id=123`, another writes `uid: 123`
- **Fragile**: Change a log message, and all your dashboards and alerts that parse that message break
- **Context-blind**: If payment processing fails at 3am, you have no structured trace of what conditions led to the failure

## What Are Structured Logs?

Structured logs attach meaning to data by embedding it in a schema. Instead of writing text, you write key-value pairs:

```python
logger.info("payment_processed", {
    "user_id": user_id,
    "amount_cents": int(amount * 100),
    "payment_method": payment_method,
    "processing_time_ms": elapsed_ms,
})

logger.error("stripe_api_failed", {
    "error_code": stripe_error.code,
    "retries_attempted": retries,
    "final_error_message": str(stripe_error),
    "total_duration_ms": elapsed_ms,
})
```

**Strengths:**
- **Queryable**: Aggregate logs by user, by error code, by processing time
- **Consistent**: The schema enforces that every "payment_processed" log has the same fields
- **Composable**: Logs flow naturally into monitoring systems, dashboards, and alerting rules
- **Traceable**: You can thread a request ID through every service and reconstruct the entire request flow

**Weaknesses:**
- **Overhead to write**: You have to think about what fields matter *before* you log
- **Schema burden**: Change a field name and you might break ingestion pipelines
- **Over-instrumentation**: Teams often log 20 fields when 3 would suffice, creating noise

## The Real Trade-off

The choice between canonical and structured logging isn't about the format—it's about **who you're optimizing for**.

**Canonical logs optimize for the moment you're writing the code.** You're debugging a function right now, so you log what helps you debug that function. Fast to write, minimal thought required.

**Structured logs optimize for operations.** The code is in production, something broke, and you need to find it across 1000 services handling millions of requests per day. You don't have time to grep through text—you need to query.

At small scale (one service, a few engineers), canonical logs are perfectly fine. Your Datadog bill is low, you know the codebase, and when something breaks you can usually figure it out in 10 minutes.

At scale (multiple services, 50+ engineers, millions of events/day), you need structure. Not because structured logging is objectively better, but because the return on structure compounds. One query across services that would take hours to grep becomes a click.

## The Stripe Approach: Canonical + Structured

Stripe doesn't choose—they use both. The key insight from their engineering blog is **canonical logs are meant for humans, structured logs are meant for machines**.

They structure the logs that matter for operations (requests, errors, state transitions) and leave development/debugging logs as canonical text.

```python
# Operational—structured for querying
logger.info("request_complete", {
    "request_id": request_id,
    "endpoint": endpoint,
    "status_code": status_code,
    "duration_ms": elapsed_ms,
    "user_id": user_id,
    "error": None,
})

# Debugging—canonical, human-readable
logger.debug(f"Query planner chose index: {index_name}, estimated_rows: {rows}")
```

This separates concerns. Your monitoring and alerting rules attach to structured fields. Your engineers can still add debug logs without worrying about breaking a pipeline.

## Choosing Your Logging Strategy

**Use canonical logs if:**
- You have one or two services
- Your team fits in a single Slack channel
- You can grep through logs in under 5 minutes and feel confident you've found the answer
- Your on-call rotation is light (< 5 pages/week per person)

**Use structured logs if:**
- You have 3+ backend services
- You have more than 10 engineers
- You're troubleshooting production incidents more than once a week
- You're paying for log ingestion (Datadog, New Relic, etc.) and need the ROI

**Use both (like Stripe) if:**
- You have the observability platform to ingest both
- You want operational structure without sacrificing developer experience
- You're willing to enforce discipline: "these logs are structured, these are debug-only"

## The Implementation

If you're starting structured logging, don't rip out your canonical logs overnight. Add structure incrementally to the logs that matter most:

1. **Request entry/exit**: Structure these. You'll query them constantly.
2. **Error logs**: Structure these. They're the first thing you check during incidents.
3. **State transitions**: Structure these. They're the story of what happened.
4. **Performance-sensitive operations**: Structure these. You'll want to query by latency.
5. **Everything else**: Leave as canonical text for now.

Use a logging library that supports both without friction (Bunyan in Node, Structlog in Python, structured-logging crates in Rust). Avoid logging libraries that force you to choose—you'll need both.

## What Gets Better With Structure

- **Incident response**: "Give me all requests where payment processing took >1000ms in the last hour" becomes one query instead of 20 minutes of grepping
- **Performance tuning**: You can aggregate latency by endpoint, by user cohort, by service, without parsing text
- **Anomaly detection**: Your ML models can't consume free-form text; they need structure to detect pattern breaks
- **Correlation**: Request ID, trace ID, user ID flow through logs; you can reconstruct the entire request flow across 5 services

## The Mistake Teams Make

They add structure without discipline. Every field gets logged. Logs become 2KB of JSON per request. Datadog bills skyrocket. The logs become noise.

The opposite mistake: they wait until they're drowning in incidents before adding structure. By then, it's hard to retrofit. Logs have been written 100 different ways; there's no consistency to build on.

The sweet spot: **structure the critical path early, keep the rest canonical, and evolve as you grow.**

## The Implementation at Scale

When you're running enough volume that structure matters (millions of requests/day), the payoff is clear. Stripe's engineering team has written extensively about how structured logging with proper tracing lets you answer questions like:

- How many requests touched this specific bug?
- What percentage of payments took >500ms?
- Which user cohort has the highest latency?

You can't answer those questions with text logs. You *can* answer them in seconds with structured logs.

## The Bottom Line

Canonical logs work until your team scales. Structured logs scale but require discipline. The best strategy is to start with canonical logs (they're faster to get started), then add structure to the logs that matter as soon as you have more than one engineer on-call.

If you're at Stripe's scale, you've probably already done this. If you're at 5 engineers wondering whether to invest, the answer is: start structuring your request logs and error logs now. Future-you will thank you when you're debugging at 2am.
