---
title: "Designing a Personalised Promotion Engine That Actually Works"
description: "How we built a promotion engine that increased bookings 30× in 6 months while cutting coupon abuse by 30% — the architecture, the mistakes, and the ML targeting layer."
pubDate: 2025-03-05
tags: ["System Design", "Python", "Machine Learning", "Backend", "Growth"]
---

Most promotion engines are just coupon tables with a discount percentage. Ours started that way too. After a rewrite driven by abuse patterns and poor targeting, it became one of the highest-ROI systems at Pelago — 30× booking increase over 6 months post-launch. Here's how it works.

## The Problem With Simple Coupon Systems

The original system: user enters a code, system checks if the code is valid and not expired, applies discount. Simple, fast, easy to reason about.

The problems:

- **Abuse**: The same user creating multiple accounts to claim first-time-user discounts. We were burning promo budget on users who had already converted.
- **Undifferentiated targeting**: Every user got the same offer. A user who books regularly got the same 15% off as a user who hadn't booked in 6 months.
- **No feedback loop**: We had no idea which promotions actually caused a booking versus which ones a user would have made anyway.

## The Architecture

The rebuilt engine has three layers:

### 1. Eligibility Engine

Stateless rule evaluation — fast, deterministic, auditable. Given a user and a promotion, returns eligible/ineligible with a reason code.

```python
@dataclass
class EligibilityContext:
    user_id: int
    promotion_id: str
    booking_context: BookingContext

def evaluate_eligibility(ctx: EligibilityContext) -> EligibilityResult:
    rules = load_promotion_rules(ctx.promotion_id)
    for rule in rules:
        result = rule.evaluate(ctx)
        if not result.eligible:
            return result
    return EligibilityResult(eligible=True)
```

Rules include: account age, previous redemptions, booking history, device fingerprint, payment method history. The fingerprint check alone cut multi-account abuse by ~30%.

### 2. Targeting Score

A lightweight ML model that scores user-promotion affinity. Features:
- Recency, frequency, monetary value (RFM) of past bookings
- Category affinity (adventure vs. cultural vs. food experiences)
- Price sensitivity signal derived from browsing-to-booking ratio
- Dormancy score (days since last booking)

We use a gradient boosted tree (XGBoost) rather than a neural net — fast inference, explainable scores, easy to debug when a user complains their discount didn't apply.

### 3. Incrementality Guard

The most important layer, and the most often skipped.

A promotion that gives a discount to a user who was going to book anyway is wasted spend. We run a holdout group for every major promotion — 10% of eligible users don't receive the offer. The delta in conversion rate between treatment and holdout is the *incremental lift*. Any promotion with lift below our threshold gets paused automatically.

## The State Machine

Promotion redemption has more states than you'd think:

```
ISSUED → VIEWED → APPLIED → RESERVED → REDEEMED
                         ↘ EXPIRED
                    ↘ ABANDONED
```

Each transition is an event. This gives us a full audit trail and lets us answer questions like "how many users applied a promo but didn't complete checkout?" (spoiler: a lot — that cohort gets a follow-up nudge).

## What I'd Change

The targeting model is retrained weekly on a batch job. In retrospect, online learning with real-time feature updates would have improved targeting quality meaningfully — especially for capturing recency signals right after a user completes a booking.

We also underinvested in the attribution model early on. Crediting the last-touch promotion for a booking misses the influence of earlier touchpoints. Multi-touch attribution is genuinely hard, but the distortions from last-touch drove some bad decisions in the first quarter.

## The Number That Matters

30× bookings sounds dramatic. The base was low (new feature, limited rollout), so the multiplier is somewhat flattering. The metric I'm more proud of: **promotion ROI** (GMV generated per dollar of promo spend) improved 4× from the original system. That's the number the business actually cares about.
