## Why

Running a Secret Santa by hand (names in a hat, group chats, spreadsheets) breaks down quickly: the hat dead-ends, couples draw each other, someone forgets who they got, and nobody knows what anyone wants. We want a tiny, private web app where a host sets up a yearly exchange for a recurring group of friends, everyone keeps a wish list, and one click produces a fair, secret draw that respects the host's rules.

## What Changes

- New greenfield app built on PocketBase (single binary, SQLite) with static HTML/JS pages and no build step.
- Passwordless login: users enter their email and receive a magic link (PocketBase one-time code). Only invited emails can log in.
- Persistent **groups** with exactly one host (always a participant). The host invites members by email.
- One **exchange** per group per year, with its own participant list (pre-filled from the group members) and a lifecycle `open ⇄ drawn`.
- Host-defined **exclusion rules** on the group: "A and B must never draw each other". One rule always applies in both directions. Rules carry over to later years.
- A **draw** computed by the server in one atomic step: every participant gets exactly one receiver, nobody draws themselves, and no exclusion is violated. Impossible rule sets are rejected when the rule is added and again at draw time.
- An automatic, best-effort "not the same person as last year" rule, derived at draw time and never stored or shown.
- Re-running the draw is the only change allowed after a draw: it wipes and recomputes all assignments.
- Per-exchange **wish lists** (title, optional link, optional note) visible to all participants of that exchange.
- Strict visibility: participants see only their own receiver. The host also sees the exclusion rules but never others' receivers. Only the PocketBase superuser (dashboard) sees everything.
- Emails: invitation, login link, and "the draw is done", which never contains names.

## Capabilities

### New Capabilities
- `auth`: Passwordless email login via magic link, restricted to invited users, plus logout.
- `groups-and-invites`: Groups with a single host, inviting members by email, yearly exchanges with participant lists and the `open`/`drawn` lifecycle, and host-managed exclusion rules.
- `wishlists`: Per-user, per-exchange wish list items and who can see or edit them.
- `draw`: Computing, re-running, and revealing assignments, including constraint handling, feasibility checks, the last-year rule, secrecy guarantees, and the draw notification.

### Modified Capabilities
<!-- none: no existing specs -->

## Impact

- New codebase: `pb_migrations/` (collections and API rules), `pb_hooks/` (invite, draw, and feasibility logic), `pb_public/` (HTML/JS pages).
- Dependencies: a pinned PocketBase release binary and the PocketBase JS SDK (loaded from a CDN). Nothing else.
- Requires SMTP credentials configured in PocketBase settings for outgoing email.
- Deployment: one binary plus its `pb_data/` directory, which must be backed up because it holds the SQLite database.
