---
title: "Building Event-Driven Systems with Celery and Redis"
description: "Lessons from processing 50K+ async jobs per day at Pelago — how we designed reliable task pipelines with sub-200ms latency."
pubDate: 2024-11-10
tags: ["Python", "Celery", "Redis", "Distributed Systems", "Backend"]
---

Running a high-throughput async pipeline sounds straightforward until you're debugging a task that silently failed three hours ago and cascaded into downstream booking failures. Here's what I learned building and scaling Celery + Redis task queues at Pelago, where we process 50K+ async jobs per day.

## Why Celery + Redis?

We evaluated several options — SQS, RabbitMQ, custom Kafka consumers — but for our scale and team familiarity, Celery with Redis as a broker hit the sweet spot. Redis gave us sub-millisecond enqueue latency, Celery gave us Python-native task definitions, and together they let us move fast without a separate ops team managing queue infrastructure.

## The Pitfalls Nobody Warns You About

### 1. Visibility timeout mismatches

Redis doesn't ack messages the way SQS does. If a worker crashes mid-task, the job vanishes unless you've configured `acks_late = True` and set your visibility timeout to exceed your longest-running task. We learned this the hard way when a notification batch would intermittently drop ~2% of sends.

```python
@app.task(bind=True, acks_late=True, max_retries=3)
def send_notification(self, user_id: int, payload: dict):
    try:
        notification_service.send(user_id, payload)
    except TransientError as exc:
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)
```

### 2. Idempotency is non-negotiable

Network retries mean your task will run more than once. Every task we write is idempotent by design — usually by keying operations on a business entity ID and using database upserts rather than inserts.

### 3. Separate queues by priority and latency class

Mixing time-sensitive tasks (push notifications) with batch jobs (weekly digest emails) in a single queue is a recipe for priority inversion. We run three queues:

- `critical` — real-time user-facing actions, 2 workers, no long tasks
- `default` — standard async work
- `bulk` — batch jobs, rate-limited, can be starved safely

## Monitoring That Actually Helps

Flower is fine for debugging locally, but in production we emit task lifecycle events to Datadog with tags for `task_name`, `queue`, `retry_count`, and `success`. The metric that matters most: **p99 task execution latency**, not average. Averages hide the tail where your users live.

## What I'd Do Differently

If starting fresh today, I'd probably reach for **Temporal** for anything with complex multi-step workflows. Celery is excellent for fire-and-forget tasks, but orchestrating a 5-step booking flow with compensation logic pushed it to its limits. The lack of a native workflow state machine means you end up rolling your own in Redis, which defeats the purpose.

That said, for a team that knows Python and wants reliable async task processing without significant infrastructure overhead, Celery + Redis is still a solid choice in 2024.
