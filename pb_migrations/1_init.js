/// <reference path="../pb_data/types.d.ts" />

// Initial schema. Access rules carry the visibility matrix (design.md §3);
// null rule = superuser only, which is how hooks/routes stay the only writers.
// ponytail: no down migration, rollback = restore a pb_data backup.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")

  const groups = new Collection({
    type: "base",
    name: "groups",
    listRule: "members.id ?= @request.auth.id",
    viewRule: "members.id ?= @request.auth.id",
    createRule: "@request.auth.collectionName = 'users' && host = @request.auth.id",
    updateRule: "host = @request.auth.id && @request.body.host:isset = false && @request.body.members:isset = false",
    deleteRule: null,
    fields: [
      { name: "name", type: "text", required: true, max: 100 },
      { name: "host", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
      { name: "members", type: "relation", collectionId: users.id, maxSelect: 999 },
    ],
  })
  app.save(groups)

  const exchanges = new Collection({
    type: "base",
    name: "exchanges",
    listRule: "group.members.id ?= @request.auth.id",
    viewRule: "group.members.id ?= @request.auth.id",
    createRule: "group.host = @request.auth.id",
    updateRule: "group.host = @request.auth.id && status = 'open' && @request.body.status:isset = false && @request.body.group:isset = false && @request.body.year:isset = false",
    deleteRule: null,
    fields: [
      { name: "group", type: "relation", required: true, collectionId: groups.id, maxSelect: 1 },
      { name: "year", type: "number", required: true, onlyInt: true, min: 2000, max: 3000 },
      { name: "status", type: "select", required: true, values: ["open", "drawn"], maxSelect: 1 },
      { name: "participants", type: "relation", collectionId: users.id, maxSelect: 999 },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_exchanges_group_year ON exchanges (`group`, `year`)"],
  })
  app.save(exchanges)

  app.save(new Collection({
    type: "base",
    name: "exclusions",
    listRule: "group.host = @request.auth.id",
    viewRule: "group.host = @request.auth.id",
    createRule: "group.host = @request.auth.id",
    updateRule: null,
    deleteRule: "group.host = @request.auth.id",
    fields: [
      { name: "group", type: "relation", required: true, collectionId: groups.id, maxSelect: 1 },
      { name: "a", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
      { name: "b", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_exclusions_pair ON exclusions (`group`, `a`, `b`)"],
  }))

  app.save(new Collection({
    type: "base",
    name: "assignments",
    listRule: "giver = @request.auth.id",
    viewRule: "giver = @request.auth.id",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "exchange", type: "relation", required: true, collectionId: exchanges.id, maxSelect: 1 },
      { name: "giver", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
      { name: "receiver", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_assignments_giver ON assignments (`exchange`, `giver`)",
      "CREATE UNIQUE INDEX idx_assignments_receiver ON assignments (`exchange`, `receiver`)",
    ],
  }))

  app.save(new Collection({
    type: "base",
    name: "wishlist_items",
    listRule: "exchange.participants.id ?= @request.auth.id",
    viewRule: "exchange.participants.id ?= @request.auth.id",
    createRule: "user = @request.auth.id && exchange.participants.id ?= @request.auth.id",
    updateRule: "user = @request.auth.id && @request.body.user:isset = false && @request.body.exchange:isset = false",
    deleteRule: "user = @request.auth.id",
    fields: [
      { name: "exchange", type: "relation", required: true, collectionId: exchanges.id, maxSelect: 1 },
      { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
      { name: "title", type: "text", required: true, max: 200 },
      { name: "url", type: "url" },
      { name: "note", type: "text", max: 1000 },
      { name: "created", type: "autodate", onCreate: true },
    ],
  }))

  // users: passwordless (OTP as magic link), created only by invite/superuser,
  // visible to self and to people sharing a group; email never exposed.
  // The back-relation keeps "my group" and "their group" the same row; two
  // @collection.groups.members conditions would collapse onto one member.
  users.listRule = "id = @request.auth.id || groups_via_members.members.id ?= @request.auth.id"
  users.viewRule = users.listRule
  users.createRule = null
  users.updateRule = "id = @request.auth.id && @request.body.emailVisibility:isset = false"
  users.deleteRule = null
  users.fields.getByName("name").required = true
  users.passwordAuth.enabled = false
  users.otp.enabled = true
  users.otp.duration = 900
  users.otp.emailTemplate.subject = "Your {APP_NAME} login link"
  users.otp.emailTemplate.body = `<p>Hello,</p>
<p><a href="{APP_URL}/auth.html?otpId={OTP_ID}&amp;otp={OTP}">Click here to log in to {APP_NAME}</a>.</p>
<p>The link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.</p>`
  app.save(users)

  const settings = app.settings()
  settings.meta.appName = "Secret Santa"
  settings.rateLimits.enabled = true
  const rules = [{ label: "/api/collections/users/request-otp", audience: "", duration: 60, maxRequests: 5 }]
  for (const r of settings.rateLimits.rules) rules.push(r)
  settings.rateLimits.rules = rules
  app.save(settings)
})
