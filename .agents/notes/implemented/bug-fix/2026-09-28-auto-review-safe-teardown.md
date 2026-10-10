# Agent Note: Preserve reviewed permissions during teardown

Status: implemented

English | [中文](2026-09-28-auto-review-safe-teardown.zh.md)

## Problem

Removing the reviewer must not grant unreviewed Full access. Root shutdown also disposes the reviewer, so an unload-time permission rewrite can change the mode restored after an ordinary restart.

## Decision

Live reviewer removal closes tool admission, aborts reviews, cancels each Auto agent, and waits for idle. Exclusive agent maintenance closes its persistent terminals before switching its Session to the configured `read-only` preset through the existing permission writer. The terminal backend refuses sandbox changes while a terminal exists, so cleanup precedes every permission write. Activation requires that preset to use sandbox `read-only` and approval `ask`, so a misconfigured fallback cannot advertise Auto. Root shutdown preserves durable Auto selection and only closes review admission and drains operations. Missing integration still prevents a persisted Auto Session from opening.

This replaces only the Full access teardown fallback in the [Auto review decision](../feature/2026-08-28-auto-review.md). Its reviewer policy, authority rules, cancellation, and child identity decisions remain active. No event type or Session format changes.

## Alternatives considered

**Retain the Auto label after live removal.** It would advertise unavailable review.

**Switch to Full access.** It would silently remove the approval requirement.

**Rewrite historical Full access selections.** It would override explicit user choices.

## Consequences

Live removal requires human approval for subsequent writes; reinstalling the reviewer does not reselect Auto. Removal terminates affected agent-owned terminals; unrelated terminals survive. Cleanup failure retains the closed tool gate instead of granting unreviewed access. Previously persisted Full access selections remain untouched because the log cannot distinguish teardown from explicit user selection. Runtime shutdown is identified by the root Cordis fiber state, not by carrier-specific flags or a guessed timeout.
