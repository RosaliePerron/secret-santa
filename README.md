# Secret Santa

Tiny Secret Santa app on [PocketBase](https://pocketbase.io): yearly exchanges for a group, wish lists, and a secret draw that respects the host's rules.

```
pb_migrations/   collections, access rules, auth + mail settings
pb_hooks/        validation hooks + invite/draw/reset routes (main.pb.js), draw solver (lib/draw.js)
pb_public/       static HTML/JS pages, no build step
```

## Run

```sh
./fetch-pb.sh                      # downloads the version pinned in PB_VERSION
./pocketbase serve                 # local: http://127.0.0.1:8090, dashboard at /_/
./pocketbase serve example.com     # production, with automatic TLS
```

Migrations apply on start.

## First deploy

1. `./pocketbase superuser upsert you@example.com <password>`
2. Dashboard → Settings: set **Application URL** (used in emails), **sender**, **SMTP**, and **backups** (scheduled).
3. Dashboard → `users` → New record: create the first host (lowercase email + name). Everyone else arrives by invitation.

## Check

```sh
node pb_hooks/lib/draw.check.js    # draw solver self-check
PB_SU_EMAIL=... PB_SU_PASSWORD=... node api.check.mjs   # access rules + flows, against a running DEV server
```

Run `api.check.mjs` after every PocketBase upgrade: the access rules are what keep the draw secret.
