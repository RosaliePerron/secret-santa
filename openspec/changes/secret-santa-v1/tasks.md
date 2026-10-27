## 1. Setup

- [ ] 1.1 Pick the latest stable PocketBase release, record it in `PB_VERSION`, add a tiny `fetch-pb.sh` that downloads that exact binary, and gitignore `pocketbase` and `pb_data/`
- [ ] 1.2 Create the `pb_hooks/`, `pb_hooks/lib/`, `pb_migrations/` and `pb_public/` directories and a README with the run command (`./pocketbase serve`) and the bootstrap steps from design.md
- [ ] 1.3 Start PocketBase locally and create a superuser; confirm the dashboard loads

## 2. Schema and access rules (migrations)

- [ ] 2.1 `users`: add a required `name` field, turn OTP on and password auth off, set OTP duration to 900 s, set emailVisibility off, create rule superuser-only, update rule self
- [ ] 2.2 `groups` collection (name, host, members) with the rules from design.md §3
- [ ] 2.3 `exchanges` collection (group, year, status select open/drawn, participants), unique index (group, year), rules from §3 including the "status/group/year not in body" guard
- [ ] 2.4 `exclusions` collection (group, a, b), unique index (group, a, b), host-only rules
- [ ] 2.5 `assignments` collection (exchange, giver, receiver), unique index (exchange, giver), list/view `giver = @request.auth.id`, all writes superuser-only
- [ ] 2.6 `wishlist_items` collection (exchange, user, title required, url as URL field, note), rules from §3
- [ ] 2.7 `users` view rule allowing users who share a group; verify it in the dashboard rule tester, and if it can't be expressed, implement the fallback from the design Risks
- [ ] 2.8 Customize the OTP email template to link to `{APP_URL}/auth.html?otpId={OTP_ID}&otp={OTP}`

## 3. Draw solver

- [ ] 3.1 `pb_hooks/lib/draw.js`: `solve(participantIds, forbiddenPairs)` using a shuffled Kuhn matching that returns `{giver: receiver}` or `null`; plain ES5, `module.exports`
- [ ] 3.2 `pb_hooks/lib/draw.check.js`, runnable with `node`: over many random runs, assert no self-draws, no forbidden pairs and a valid permutation; assert `null` for the A,B,C + A–B + A–C case; assert more than one distinct result appears when several exist

## 4. Validation hooks

- [ ] 4.1 `groups` create: set `members = [host]`
- [ ] 4.2 `exchanges` create: force `status = open` and `participants = group.members`
- [ ] 4.3 `exchanges` update: participants must be a subset of members and include the host
- [ ] 4.4 `exclusions` create: normalize `a < b`, reject `a = b` or non-members, reject while the latest exchange is `drawn`, and reject when `solve()` returns null on the open exchange's participants (or on all members if none is open)
- [ ] 4.5 `exclusions` delete: reject while the latest exchange is `drawn`

## 5. Custom routes

- [ ] 5.1 `POST /api/groups/{id}/invite`: host-only; lowercase the email; find or create the user with a random password and the given name; reject if already a member; add to members and to the open exchange's participants; send the invitation email (app link only, no login link)
- [ ] 5.2 `POST /api/exchanges/{id}/draw`: host-only; at least 3 participants; build forbidden pairs from the rules (both directions) plus last year's pairs (one way); solve with history, then without; return 400 "no draw is possible with these rules" if it fails; otherwise, in one transaction, delete old assignments, insert new ones and set `status = drawn`
- [ ] 5.3 After a successful draw commits, email every participant "the draw is done, log in to see who you got", with no names; log failures without rolling back
- [ ] 5.4 `POST /api/exchanges/{id}/reset`: host-only and `drawn` only; in one transaction, delete assignments and set `status = open`

## 6. Frontend (`pb_public/`)

- [ ] 6.1 `app.js` (PocketBase SDK from a pinned CDN URL, shared client, require-login helper, logout) and a minimal `style.css`
- [ ] 6.2 `index.html`: email form, then "check your email" when logged out; when logged in, my groups, create group, edit my name, log out
- [ ] 6.3 `auth.html`: read `otpId`/`otp` from the URL and show a "Log in" button that calls `authWithOTP`; on error, show the message and a "send a new link" form
- [ ] 6.4 `group.html?id=`: members (names only), exchanges by year; for the host: invite form, rules list with add/delete and error messages, create-exchange form
- [ ] 6.5 `exchange.html?id=`: when drawn, my receiver's name and their wish list on top; all participants' wish lists; my wish list editor (add/edit/delete)
- [ ] 6.6 Host panel on `exchange.html`: participant toggles while open, plus Draw / Redraw / Reset buttons with a confirm on Redraw and Reset

## 7. Verification

- [ ] 7.1 Run `node pb_hooks/lib/draw.check.js` and confirm it passes
- [ ] 7.2 Secrecy check through the REST API with three test users: a non-host and the host each list `assignments` and get only their own row; a non-host lists `exclusions` and gets none; a non-member gets nothing for the group, its exchanges and wish lists; direct create/update of assignments and direct `status` edits are rejected
- [ ] 7.3 End-to-end by hand: invite 4 people, log in through emailed links (local SMTP catcher, e.g. Mailpit), add a couple rule, fill wish lists, draw, confirm each person sees exactly one receiver and the draw email has no names; reset, invite a 5th person, draw again
- [ ] 7.4 Last-year rule: create the next year's exchange, draw, and confirm nobody repeats a receiver when an alternative exists
