# Secret Santa

A small, private Secret Santa app for friends and family. A host runs a yearly exchange for a recurring group: invite people by email, collect wish lists, set "these two never draw each other" rules, then run a secret draw in one click.

Built on [PocketBase](https://pocketbase.io): one binary with an embedded SQLite database. No passwords, no build step, and no other services apart from an SMTP server for email.

## Features

### Login
- **Passwordless.** You enter your email and get a login link. The link works once and expires after 15 minutes.
- **Invite only.** Only invited people (plus the first host, created by the admin) can log in. An unknown email gets the same "check your inbox" message, and nothing is sent.
- **Safe from link scanners.** The link opens a page with a **Log in** button, so email scanners that pre-open links can't use it up.
- **Sessions last about 5 days.** After that, request a new link.

### Groups and invites
- **Creating a group.** Anyone logged in can create a group and becomes its **host**. Each group has exactly one host, and the host can't be changed.
- **Inviting.** The host invites people by name and email. Unknown emails get an account automatically, plus an invitation email asking them to log in.
- **Privacy.** Members see each other's names, never each other's email addresses.

### Yearly exchanges
- **One exchange per group per year.** All current members take part by default.
- **Choosing participants.** While the exchange is **open**, the host can tick people in or out, for example when someone sits out a year. The host always takes part.
- **Lifecycle.** `open` → (draw) → `drawn`. Reset takes it back to `open`.

### Rules
- **Meaning.** "Rosalie ✕ Marc" means neither of them draws the other. A rule always works in both directions.
- **Rules belong to the group**, so couples stay excluded every year.
- **Only the host** can see the rules.
- **Impossible rules are refused** as soon as the host tries to add them, so you never find out at draw time.
- **Locked while the latest exchange is drawn.** Reset the draw or start next year's exchange to change them.

### Wish lists
- **One list per person per exchange**, starting fresh each year. Each item has a title, plus an optional link and an optional note.
- **Visibility.** Every participant sees everyone's list, but only the owner can edit theirs. Lists stay editable after the draw.

### The draw
- **Running it.** The host clicks **Run the draw**, which needs at least 3 participants. The server computes every assignment in one transaction: each person gives exactly once and receives exactly once, never to themselves, and never against a rule.
- **Not the same person as last year.** The draw avoids this when possible and silently ignores it when that's impossible. Last year's assignments are never stored as rules or shown to anyone, so the host can't read them either.
- **Notification.** Everyone gets a "the draw is done" email. The email contains **no names**.
- **Checking your match.** Everyone can log in at any time to see who they drew and that person's wish list.
- **Redraw** runs a completely new draw for everyone.
- **Reset** cancels the draw so the host can change participants or rules, for example to add a late joiner, and then draw again.

### Who sees what

|                         | Own match | Others' matches | Rules | Wish lists  |
|-------------------------|-----------|-----------------|-------|-------------|
| Participant             | ✓         | ✗               | ✗     | ✓ all       |
| Host (also participant) | ✓         | ✗               | ✓     | ✓ all       |
| Admin (dashboard)       | ✓         | ✓               | ✓     | ✓           |

The PocketBase access rules enforce this table. The UI does not, so it holds even if someone calls the API directly. `api.check.mjs` verifies it.

## How it works

```
pb_migrations/1_init.js   collections, access rules, login-link email, rate limits
pb_hooks/main.pb.js       validation hooks + routes: invite, draw, reset
pb_hooks/lib/draw.js      draw solver (randomized bipartite matching) + shared helpers
pb_public/                index (login, my groups) · auth (link landing) · group · exchange
PB_VERSION, fetch-pb.sh   pinned PocketBase release and its downloader
api.check.mjs             end-to-end API + secrecy check (dev server only)
```

- **Collections:** `users`, `groups`, `exchanges`, `exclusions` (the rules, stored as one row per pair), `assignments`, `wishlist_items`.
- **Custom routes,** all host-only: `POST /api/groups/{id}/invite`, `POST /api/exchanges/{id}/draw`, `POST /api/exchanges/{id}/reset`.
- **Assignments are write-protected.** Users can't create, edit or delete them; only the draw and reset routes change them.
- **The frontend** is static HTML with the PocketBase JS SDK loaded from a CDN. The SDK is pinned to a version and checked with an integrity hash.

## Local development

```sh
./fetch-pb.sh                                        # downloads the version in PB_VERSION
./pocketbase superuser upsert admin@example.com <password>
docker run -d --name ss-mailpit -p 127.0.0.1:1026:1025 -p 127.0.0.1:8026:8025 axllent/mailpit:v1.21.0
./pocketbase serve                                   # http://127.0.0.1:8090, dashboard at /_/
```

1. In the dashboard, go to **Settings → Mail settings** and enable SMTP with host `127.0.0.1`, port `1026`, no TLS.
2. In **Settings → Application**, set the **Application URL** to `http://127.0.0.1:8090`.
3. In **users → New record**, create yourself with a **lowercase** email and a name. Then log in through the app. Emails show up at http://127.0.0.1:8026.
4. To test another user's view, open their record in the dashboard and use **Impersonate**.

Checks:

```sh
node pb_hooks/lib/draw.check.js                                          # draw solver self-check
PB_SU_EMAIL=admin@example.com PB_SU_PASSWORD=... node api.check.mjs      # rules + flows, DEV server only
```

`api.check.mjs` creates and then deletes its own data, so never point it at production. Run it after every PocketBase upgrade, because the access rules are what keep the draw secret.

## Deployment

### What you need
- A small Linux server (512 MB RAM is plenty) with `curl` and `unzip`.
- A domain or subdomain, e.g. `santa.example.com`, with its DNS **A record** pointing to the server. Ports 80 and 443 must be open.
- An SMTP account from any transactional email provider. Send from an address on a domain where you've set up the provider's SPF/DKIM records; otherwise login links end up in spam.

### 1. Copy the app

From your machine (replace `deploy@server` with your server login):

```sh
ssh deploy@server 'sudo mkdir -p /opt/secret-santa && sudo chown deploy: /opt/secret-santa'
rsync -av --delete pb_hooks pb_migrations pb_public PB_VERSION fetch-pb.sh deploy@server:/opt/secret-santa/
ssh deploy@server 'cd /opt/secret-santa && ./fetch-pb.sh'
```

This copies only the app files. It never touches `pb_data/` on the server, which holds the database and settings.

### 2. Create the admin account

```sh
ssh deploy@server 'cd /opt/secret-santa && ./pocketbase superuser upsert you@example.com "<strong password>"'
```

### 3. Run it as a service

Create `/etc/systemd/system/secret-santa.service`:

```ini
[Unit]
Description=Secret Santa (PocketBase)
After=network-online.target
Wants=network-online.target

[Service]
User=deploy
WorkingDirectory=/opt/secret-santa
ExecStart=/opt/secret-santa/pocketbase serve santa.example.com
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=always
RestartSec=5s
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now secret-santa
journalctl -u secret-santa -f        # logs
```

`serve santa.example.com` listens on ports 80 and 443 and gets a Let's Encrypt certificate automatically. Migrations run on every start.

### 4. Configure the app

Open `https://santa.example.com/_/` and log in as the admin. Then go to **Settings**:
- **Application:** set **Application URL** to `https://santa.example.com`. Every email link uses it, so a wrong value breaks login. Optionally tick **Hide collection create and edit controls** to prevent accidental schema changes.
- **Mail settings:** set the sender name and address, and your SMTP host, port, username and password. Then click **Send test email**.
- **Backups:** turn on automatic backups, e.g. cron `0 3 * * *` keeping 7. If you can, use S3-compatible storage so backups don't live only on the server.
- **Rate limiting** is already enabled by the migration, including 5 login-link requests per minute.

### 5. Create the first host

Go to **Collections → users → New record**. Enter an email (**lowercase**) and a name; the password can be anything, since it's never used. That person logs in from the home page and creates the group. Everyone else joins through invitations.

### 6. Smoke test

1. Request a login link for the host and check that it arrives.
2. Log in, create a group, and invite a second address you control.
3. Start an exchange and add a wish list item.

Leave the draw for when everyone has joined.

### Updating

```sh
# 1. Back up first: dashboard → Settings → Backups → "Initialize new backup"
rsync -av --delete pb_hooks pb_migrations pb_public PB_VERSION fetch-pb.sh deploy@server:/opt/secret-santa/
ssh deploy@server 'cd /opt/secret-santa && ./fetch-pb.sh && sudo systemctl restart secret-santa'
```

- **Upgrading PocketBase:** before changing `PB_VERSION`, read the PocketBase changelog. PocketBase is pre-1.0, so releases can contain breaking changes. Then run both checks locally against the new version.
- **Changing the schema:** add a new file in `pb_migrations/`. Don't edit `1_init.js` once it has been deployed, and don't change collections in the production dashboard, because the server would then write migration files that aren't in the repo.

### Rollback

1. Copy back the previous version of the code with the same `rsync` command and restart the service.
2. If the data needs to go back too, go to **Settings → Backups**, pick the backup taken before the update, and click **Restore**. The app restarts on its own.

### Behind an existing reverse proxy (nginx, Caddy, …)

Run `pocketbase serve --http 127.0.0.1:8090` instead of `serve santa.example.com`, drop the `AmbientCapabilities` line, and proxy your domain to `127.0.0.1:8090`. Then go to **Settings → Application → User IP proxy headers** and add `X-Forwarded-For` (or `X-Real-IP`). Without that header, the rate limiter treats every visitor as the same IP.

## Limits (on purpose, for now)

- **English only.**
- **Not supported:** budgets, gift dates, gift tracking, chat, deleting groups, removing someone from a group, and transferring the host role. To leave someone out for a year, untick them as a participant.
- **Draw randomness:** every valid draw can happen, but they are not all equally likely. The shuffle uses `Math.random`, which is fine against friends.
- **Email sending:** draw emails go out one by one, which is fine for about 30 people.
- **All data is in one SQLite file** in `pb_data/`, so keep backups on.
