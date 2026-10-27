## Context

This is a greenfield project with no existing code. It's a private Secret Santa app for friends and family: a handful of groups of roughly 3–30 people, used intensely for a few weeks each year. The owner wants it as lightweight as possible to build, run and host. The core promise is secrecy: nobody, the host included, can find out who drew whom through the app.

## Goals / Non-Goals

**Goals:**
- Ship the four capabilities (`auth`, `groups-and-invites`, `wishlists`, `draw`) with the least custom code possible.
- Enforce secrecy with declarative access rules, not scattered checks.
- One process, one SQLite file, deployable by copying a directory.

**Non-Goals:**
- Budgets, gift dates, gift-sent tracking, anonymous Santa↔receiver chat.
- Deleting groups, removing members from a group, transferring or sharing the host role. A member sits out a year by being removed from that exchange's participants.
- Uniformly random draws. Every valid assignment is possible, but they are not equally likely.
- Self sign-up. Users exist only through an invitation or the admin dashboard.
- Mobile apps, a JS framework, a build pipeline.

## Decisions

### 1. PocketBase as the whole backend
A pinned PocketBase release provides SQLite, email one-time-code (OTP) auth, per-collection API rules, an admin dashboard, an SMTP mailer, rate limiting, scheduled backups and JS hooks.
- *Alternatives:* Rails 8 minimal is conventional and server-rendered, but requires writing auth, mailer and authorization code. Go stdlib + SQLite is the smallest at runtime but means writing everything, including sessions and migrations.
- *Why:* three requirements come built in: the magic link (OTP), the visibility matrix (API rules) and "the admin sees everything" (the dashboard). What's left to write is the invite/draw/reset routes, a few validation hooks and the HTML pages.

### 2. Data model

```
users (auth)    name                          email hidden from others (emailVisibility=false)
groups          name, host→users, members→users[]
exchanges       group→groups, year, status(open|drawn), participants→users[]   unique(group, year)
exclusions      group→groups, a→users, b→users                                 unique(group, a, b), a < b
assignments     exchange→exchanges, giver→users, receiver→users                unique(exchange, giver)
wishlist_items  exchange→exchanges, user→users, title, url?, note?
```

- Rules belong to the **group** so couples carry over to later years. Participants belong to the **exchange** so someone can sit out a year.
- Every rule applies both ways, so a pair is stored **once**, normalized with `a < b` by id in a create hook. A unique index then rejects duplicates in either order, and there are no mirror rows to keep in sync.

### 3. API rules carry the visibility matrix

| Collection | list / view | create | update | delete |
|---|---|---|---|---|
| users | self, or shares a group | — (hook/admin) | self (name only) | — |
| groups | `members.id ?= auth` | any logged-in user, `host = auth` | host, name only | — |
| exchanges | `group.members.id ?= auth` | `group.host = auth` | host, `status = "open"`, body must not set `status`/`group`/`year` | — |
| exclusions | `group.host = auth` | `group.host = auth` | — | `group.host = auth` |
| assignments | `giver = auth` | — | — | — |
| wishlist_items | `exchange.participants.id ?= auth` | owner and participant | owner, cannot change `user`/`exchange` | owner |

`—` means superuser only. Hooks write through `$app.save()`, which bypasses API rules, so assignments can be written only by server code. Realtime subscriptions follow the same view rules, so they open no side channel. Exact rule syntax is checked against the pinned version during implementation (see Risks).

### 4. Hooks for the rules that API rules cannot express
- `groups` create: set `members = [host]`.
- `exchanges` create: force `status = open` and `participants = group.members`.
- `exchanges` update: participants must be a subset of members and must include the host.
- `exclusions` create: normalize `a < b`, reject `a = b`, require both to be members, reject while the group's latest exchange is `drawn`, and reject if the draw would become impossible (runs the solver).
- `exclusions` delete: same lock check.

### 5. Three custom routes, all host-only
- `POST /api/groups/{id}/invite {email, name}`: lowercases the email, finds or creates the user (with a random unused password, since login is OTP-only), adds them to `members` and to the open exchange's `participants`, and sends the invitation email. A custom route is needed because creating users requires superuser privileges.
- `POST /api/exchanges/{id}/draw`: requires at least 3 participants and solves the draw (see 6). Inside one `runInTransaction` it deletes the old assignments, inserts the new ones and sets `status = drawn`. Emails are sent **after** the commit, and failures are only logged.
- `POST /api/exchanges/{id}/reset`: inside one transaction, deletes the assignments and sets `status = open`.

The draw route also performs redraws: calling it on a `drawn` exchange replaces everything atomically, so there is no separate redraw endpoint.

### 6. Solver: randomized bipartite matching
Givers and receivers are the same participants. The draw is valid when it is a perfect matching in which nobody gives to themselves and no forbidden pair is used. The solver shuffles the giver order and each giver's candidate list, then runs Kuhn's augmenting-path algorithm, which is about 25 lines of code.
- *Alternatives:* reshuffling until valid cannot tell "impossible" apart from "unlucky". Randomized backtracking can take exponential time on impossible inputs.
- *Why:* it runs in O(V·E), so it is instant at our scale, and it answers "impossible" **exactly**. Every valid matching has a non-zero probability: if the shuffles happen to list that matching's receivers first, every giver takes its first candidate and no augmentation happens.
- The solver lives in `pb_hooks/lib/draw.js` as plain ES5-compatible code. It is `require`d inside each handler, because JSVM handlers run in isolated scopes. The same file runs under Node for a self-check.

### 7. Soft "not last year" rule
The draw route loads the assignments of the group's most recent `drawn` exchange with a lower year, keeps the pairs whose two people are both participants now, and adds them as **one-way** forbidden pairs. It solves with them first, and if that fails, solves without them. These pairs are never persisted and never appear in any response, because storing them in `exclusions` would show last year's draw to the host. The fallback is silent for the same reason.

### 8. Magic link from OTP
- Settings for the `users` collection: OTP auth on, password auth off, OTP duration 900 s, rate limiting on `request-otp`.
- The OTP email template links to `{APP_URL}/auth.html?otpId={OTP_ID}&otp={OTP}`. `auth.html` shows a **"Log in" button** that calls `authWithOTP`; it does not submit automatically, so email-scanner prefetches cannot consume the link.
- The invitation email links only to the app home. An OTP would expire before people read the invite.
- The SDK keeps the session token in localStorage. When it expires, the user simply requests a new link.

### 9. Frontend: four static pages
`index.html` (email form, or my groups and my name), `auth.html` (link landing), `group.html?id=` (members, invite and rules for the host, exchanges), `exchange.html?id=` (my receiver, all wish lists, my wish list editor, and for the host: participants plus Draw/Redraw/Reset). The pages share `app.js` (SDK client and small helpers) and `style.css`. The SDK loads from a CDN at a pinned version. No framework, no build step.

### 10. Configuration lives in migrations; secrets stay out of the repo
Collections, rules, indexes and the OTP template are defined in `pb_migrations/`. SMTP credentials, the app URL, sender address and backup schedule are set in the dashboard and stored in `pb_data/`, which is not committed.

## Risks / Trade-offs

- [PocketBase is pre-1.0, so minor versions can break APIs] → Pin one release, commit a `PB_VERSION` file, and read the changelog before upgrading.
- [A wrong API rule leaks assignments, breaking the core promise] → Add an explicit secrecy check to the tasks: as a non-host and as the host, list assignments, rules and other groups through the REST API and confirm only the allowed rows come back.
- [It's unclear whether same-group user visibility can be expressed in one rule (joining `groups` twice on the same record)] → Verify early. Fallback: return member names through the group-view expand, or add a small `/api/groups/{id}/members` route.
- [The host can force a pairing by excluding everyone except one person] → Accepted. The trust model is friends and family, and only the host sees rules.
- [The superuser can see every assignment] → Accepted and required. That's the operator.
- [Login depends on email delivery] → Use a reputable SMTP provider. The link can be re-requested at any time.
- [Email scanners prefetch links] → The confirm button on `auth.html` (Decision 8).
- [Everything lives in one SQLite file] → Turn on PocketBase's built-in scheduled backups.
- [JSVM has no npm and no async] → The solver is pure synchronous JS, and mail sending is synchronous, which is fine at ≤30 emails.

## Migration Plan

This is a first deploy, so there's nothing to migrate.
1. Put the pinned `pocketbase` binary on the host next to `pb_hooks/`, `pb_migrations/` and `pb_public/`.
2. Run `./pocketbase serve <domain>`. Migrations apply automatically and TLS is issued automatically.
3. Create the superuser, then configure SMTP, the app URL, sender, rate limits and backups in the dashboard.
4. Bootstrap: create the first host's user record in the dashboard. From then on, users arrive through invitations.

Rollback: stop the process and restore `pb_data/` from a backup.

## Open Questions

- UI language: French, English, or both? The default for v1 is a single language.
- Which PocketBase release to pin: the latest stable release at implementation time.
