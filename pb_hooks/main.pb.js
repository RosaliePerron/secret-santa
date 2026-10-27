/// <reference path="../pb_data/types.d.ts" />

// Validation the API rules can't express, plus the invite/draw/reset routes.
// Handlers run in isolated scopes: shared code comes from lib/draw.js via require.

// The creator is the only host and the first member.
onRecordCreateRequest((e) => {
  e.record.set("members", [e.record.getString("host")])
  e.next()
}, "groups")

// New exchanges start open, with every current member taking part.
onRecordCreateRequest((e) => {
  const group = $app.findRecordById("groups", e.record.getString("group"))
  e.record.set("status", "open")
  e.record.set("participants", group.getStringSlice("members"))
  e.next()
}, "exchanges")

onRecordUpdateRequest((e) => {
  const group = $app.findRecordById("groups", e.record.getString("group"))
  const members = group.getStringSlice("members")
  const participants = e.record.getStringSlice("participants")
  if (participants.some((id) => !members.includes(id))) throw new BadRequestError("Participants must be group members.")
  if (!participants.includes(group.getString("host"))) throw new BadRequestError("The host always takes part.")
  e.next()
}, "exchanges")

onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/lib/draw.js`)
  const group = $app.findRecordById("groups", e.record.getString("group"))
  let a = e.record.getString("a"), b = e.record.getString("b")
  if (a === b) throw new BadRequestError("Pick two different people.")
  const members = group.getStringSlice("members")
  if (!members.includes(a) || !members.includes(b)) throw new BadRequestError("Both people must be group members.")
  if (a > b) [a, b] = [b, a] // one row per pair, whatever the order
  e.record.set("a", a)
  e.record.set("b", b)
  if ($app.findRecordsByFilter("exclusions", "group = {:g} && a = {:a} && b = {:b}", "", 1, 0, { g: group.id, a, b }).length) {
    throw new BadRequestError("This rule already exists.")
  }

  const latest = lib.latestExchange($app, group.id)
  if (latest && latest.getString("status") === "drawn") {
    throw new BadRequestError("Rules are locked while the draw stands. Reset it or create next year's exchange first.")
  }
  const people = latest ? latest.getStringSlice("participants") : members
  if (!lib.solve(people, lib.rulePairs($app, group.id).concat([[a, b], [b, a]]))) {
    throw new BadRequestError("No draw would be possible with this rule.")
  }
  e.next()
}, "exclusions")

onRecordDeleteRequest((e) => {
  const lib = require(`${__hooks}/lib/draw.js`)
  const latest = lib.latestExchange($app, e.record.getString("group"))
  if (latest && latest.getString("status") === "drawn") {
    throw new BadRequestError("Rules are locked while the draw stands. Reset it or create next year's exchange first.")
  }
  e.next()
}, "exclusions")

routerAdd("POST", "/api/groups/{id}/invite", (e) => {
  const lib = require(`${__hooks}/lib/draw.js`)
  const group = $app.findRecordById("groups", e.request.pathValue("id"))
  if (group.getString("host") !== e.auth.id) throw new ForbiddenError("Only the host can invite.")

  const body = e.requestInfo().body
  const email = String(body.email || "").trim().toLowerCase()
  const name = String(body.name || "").trim()
  if (!email || !name) throw new BadRequestError("Email and name are required.")

  let user
  try {
    user = $app.findAuthRecordByEmail("users", email)
  } catch (_) {
    user = new Record($app.findCollectionByNameOrId("users"))
    user.setEmail(email)
    user.set("name", name)
    user.setRandomPassword() // never used: login is OTP only
  }
  if (group.getStringSlice("members").includes(user.id)) throw new BadRequestError("Already a member.")

  $app.runInTransaction((tx) => {
    tx.save(user)
    group.set("members+", user.id)
    tx.save(group)
    const latest = lib.latestExchange(tx, group.id)
    if (latest && latest.getString("status") === "open") {
      latest.set("participants+", user.id)
      tx.save(latest)
    }
  })

  const appName = lib.esc($app.settings().meta.appName)
  lib.mail($app, email, `You're invited to ${group.getString("name")}`,
    `<p>${lib.esc(e.auth.getString("name"))} invited you to the Secret Santa group <b>${lib.esc(group.getString("name"))}</b>.</p>` +
    `<p><a href="${lib.esc($app.settings().meta.appURL)}">Open ${appName}</a> and log in with this email address.</p>`)
  return e.json(200, { id: user.id })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/exchanges/{id}/draw", (e) => {
  const lib = require(`${__hooks}/lib/draw.js`)
  const { exchange, group } = lib.hostExchange($app, e)
  const people = exchange.getStringSlice("participants")
  if (people.length < 3) throw new BadRequestError("A draw needs at least 3 participants.")

  // Last year's pairs, one way, best effort. Never stored or returned, so the
  // host can't read last year's draw from the rules or from an error message.
  const rules = lib.rulePairs($app, group.id)
  const prev = $app.findRecordsByFilter("exchanges", "group = {:g} && year < {:y} && status = 'drawn'", "-year", 1, 0,
    { g: group.id, y: exchange.getInt("year") })
  const history = prev.length
    ? $app.findRecordsByFilter("assignments", "exchange = {:x}", "", 0, 0, { x: prev[0].id })
        .map((a) => [a.getString("giver"), a.getString("receiver")])
    : []
  const result = lib.solve(people, rules.concat(history)) || lib.solve(people, rules)
  if (!result) throw new BadRequestError("No draw is possible with these rules.")

  $app.runInTransaction((tx) => {
    lib.clearAssignments(tx, exchange.id)
    const col = tx.findCollectionByNameOrId("assignments")
    for (const giver of people) {
      const a = new Record(col)
      a.set("exchange", exchange.id)
      a.set("giver", giver)
      a.set("receiver", result[giver])
      tx.save(a)
    }
    exchange.set("status", "drawn")
    tx.save(exchange)
  })

  // ponytail: sequential sends, fine at ≤30 people; queue them if groups grow
  const title = lib.esc(`${group.getString("name")} ${exchange.getInt("year")}`)
  const url = lib.esc($app.settings().meta.appURL)
  for (const u of $app.findRecordsByIds("users", people)) {
    lib.mail($app, u.email(), `The Secret Santa draw is done`,
      `<p>The draw for <b>${title}</b> is done.</p><p><a href="${url}">Log in</a> to see who you got.</p>`)
  }
  return e.json(200, { status: "drawn" })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/exchanges/{id}/reset", (e) => {
  const lib = require(`${__hooks}/lib/draw.js`)
  const { exchange } = lib.hostExchange($app, e)
  if (exchange.getString("status") !== "drawn") throw new BadRequestError("There is no draw to reset.")
  $app.runInTransaction((tx) => {
    lib.clearAssignments(tx, exchange.id)
    exchange.set("status", "open")
    tx.save(exchange)
  })
  return e.json(200, { status: "open" })
}, $apis.requireAuth("users"))
