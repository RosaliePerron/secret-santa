// End-to-end API + secrecy check against a running dev server (never prod: it creates and deletes data).
//   PB_SU_EMAIL=... PB_SU_PASSWORD=... node api.check.mjs   [PB_URL=http://127.0.0.1:8090]
import assert from "node:assert"

const URL = process.env.PB_URL || "http://127.0.0.1:8090"
const tag = Math.random().toString(36).slice(2, 8)
const created = { assignments: [], wishlist_items: [], exclusions: [], exchanges: [], groups: [], users: [] }

async function api(token, method, path, body) {
  const res = await fetch(URL + path, {
    method,
    headers: { "content-type": "application/json", ...(token && { Authorization: token }) },
    body: body && JSON.stringify(body),
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}
const ok = (r, what) => { assert.ok(r.status >= 200 && r.status < 300, `${what}: ${r.status} ${JSON.stringify(r.data)}`); return r.data }
const denied = (r, what) => assert.ok(r.status >= 400, `${what} should be rejected, got ${r.status}`)
const list = async (t, col, filter = "") =>
  ok(await api(t, "GET", `/api/collections/${col}/records?perPage=500&filter=${encodeURIComponent(filter)}`), `list ${col}`).items

const su = ok(await api(null, "POST", "/api/collections/_superusers/auth-with-password",
  { identity: process.env.PB_SU_EMAIL, password: process.env.PB_SU_PASSWORD }), "superuser login").token

async function bootstrapUser(name) {
  const pw = "x".repeat(12)
  const u = ok(await api(su, "POST", "/api/collections/users/records",
    { email: `${name.toLowerCase()}-${tag}@example.com`, name, password: pw, passwordConfirm: pw }), `create ${name}`)
  created.users.push(u.id)
  return u.id
}
const tokenFor = async (id) => ok(await api(su, "POST", `/api/collections/users/impersonate/${id}`, {}), "impersonate").token

try {
  const H = await bootstrapUser("Host"), O = await bootstrapUser("Outsider")
  const tH = await tokenFor(H), tO = await tokenFor(O)

  // group + invites
  const group = ok(await api(tH, "POST", "/api/collections/groups/records", { name: `G-${tag}`, host: H, members: [O] }), "create group")
  created.groups.push(group.id)
  assert.deepStrictEqual(group.members, [H], "creator is the only first member")
  const ids = {}
  for (const n of ["A", "B", "C"]) {
    ids[n] = ok(await api(tH, "POST", `/api/groups/${group.id}/invite`, { email: `${n.toLowerCase()}-${tag}@Example.com`, name: n }), `invite ${n}`).id
    created.users.push(ids[n])
  }
  const { A, B, C } = ids
  const [tA, tB, tC] = await Promise.all([A, B, C].map(tokenFor))
  denied(await api(tH, "POST", `/api/groups/${group.id}/invite`, { email: `a-${tag}@example.com`, name: "A" }), "re-invite member")
  denied(await api(tA, "POST", `/api/groups/${group.id}/invite`, { email: `z-${tag}@example.com`, name: "Z" }), "non-host invite")

  // users: names of group mates only, never emails
  const seenByA = await list(tA, "users")
  assert.deepStrictEqual(seenByA.map((u) => u.id).sort(), [H, A, B, C].sort(), "A sees group mates only")
  assert.ok(seenByA.filter((u) => u.id !== A).every((u) => !u.email), "no emails of others")
  assert.deepStrictEqual((await list(tO, "users")).map((u) => u.id), [O], "outsider sees only self")
  denied(await api(tA, "PATCH", `/api/collections/users/records/${A}`, { emailVisibility: true }), "expose own email")

  // exchange
  const year = 2000 + Math.floor(Math.random() * 900)
  const ex = ok(await api(tH, "POST", "/api/collections/exchanges/records", { group: group.id, year, status: "drawn", participants: [H] }), "create exchange")
  created.exchanges.push(ex.id)
  assert.strictEqual(ex.status, "open")
  assert.deepStrictEqual(ex.participants.sort(), [H, A, B, C].sort(), "participants = members")
  denied(await api(tH, "POST", "/api/collections/exchanges/records", { group: group.id, year }), "duplicate year")
  denied(await api(tA, "POST", "/api/collections/exchanges/records", { group: group.id, year: year + 1 }), "non-host exchange")
  denied(await api(tH, "PATCH", `/api/collections/exchanges/records/${ex.id}`, { status: "drawn" }), "direct status edit")
  denied(await api(tH, "PATCH", `/api/collections/exchanges/records/${ex.id}`, { participants: [A, B, C] }), "drop host")
  denied(await api(tH, "PATCH", `/api/collections/exchanges/records/${ex.id}`, { participants: [H, A, O] }), "non-member participant")
  ok(await api(tH, "PATCH", `/api/collections/exchanges/records/${ex.id}`, { participants: [H, A, B] }), "C sits out")
  ok(await api(tH, "PATCH", `/api/collections/exchanges/records/${ex.id}`, { participants: [H, A, B, C] }), "C back")

  // rules
  const rule = ok(await api(tH, "POST", "/api/collections/exclusions/records", { group: group.id, a: B, b: A }), "rule A-B")
  created.exclusions.push(rule.id)
  assert.deepStrictEqual([rule.a, rule.b], [A, B].sort(), "pair stored once, sorted")
  denied(await api(tH, "POST", "/api/collections/exclusions/records", { group: group.id, a: A, b: B }), "duplicate rule")
  denied(await api(tH, "POST", "/api/collections/exclusions/records", { group: group.id, a: A, b: A }), "self rule")
  denied(await api(tH, "POST", "/api/collections/exclusions/records", { group: group.id, a: A, b: O }), "non-member rule")
  const nonHost = await api(tA, "POST", "/api/collections/exclusions/records", { group: group.id, a: A, b: H })
  assert.ok(nonHost.status >= 400 && !/draw|exists|different|member/i.test(nonHost.data.message), "non-host rule rejected without hints about rules")
  created.exclusions.push(ok(await api(tH, "POST", "/api/collections/exclusions/records", { group: group.id, a: A, b: C }), "rule A-C").id)
  const impossible = await api(tH, "POST", "/api/collections/exclusions/records", { group: group.id, a: A, b: H })
  assert.ok(impossible.status === 400 && /No draw would be possible/.test(impossible.data.message), "rule leaving A nobody is rejected")
  assert.strictEqual((await list(tA, "exclusions")).length, 0, "non-host sees no rules")
  assert.strictEqual((await list(tH, "exclusions")).length, 2, "host sees rules")

  // wish lists
  const item = ok(await api(tA, "POST", "/api/collections/wishlist_items/records", { exchange: ex.id, user: A, title: "Book", url: "https://example.com" }), "A adds item")
  created.wishlist_items.push(item.id)
  denied(await api(tA, "POST", "/api/collections/wishlist_items/records", { exchange: ex.id, user: A, title: "" }), "missing title")
  denied(await api(tA, "POST", "/api/collections/wishlist_items/records", { exchange: ex.id, user: B, title: "Forged" }), "item for someone else")
  denied(await api(tO, "POST", "/api/collections/wishlist_items/records", { exchange: ex.id, user: O, title: "Sneaky" }), "outsider item")
  denied(await api(tH, "PATCH", `/api/collections/wishlist_items/records/${item.id}`, { title: "Edited by host" }), "host edits A's item")
  assert.strictEqual((await list(tB, "wishlist_items", `exchange = "${ex.id}"`)).length, 1, "B sees A's list")
  assert.strictEqual((await list(tO, "wishlist_items")).length, 0, "outsider sees no lists")

  // draw
  denied(await api(tA, "POST", `/api/exchanges/${ex.id}/draw`), "non-host draw")
  assert.strictEqual(ok(await api(tH, "POST", `/api/exchanges/${ex.id}/draw`), "draw").result, undefined, "draw response has no assignments")
  const checkDraw = async (exId, people, forbidden) => {
    const all = await list(su, "assignments", `exchange = "${exId}"`)
    created.assignments.push(...all.map((a) => a.id))
    assert.deepStrictEqual(all.map((a) => a.giver).sort(), [...people].sort(), "everyone gives")
    assert.deepStrictEqual(all.map((a) => a.receiver).sort(), [...people].sort(), "everyone receives once")
    for (const a of all) {
      assert.notStrictEqual(a.giver, a.receiver, "no self draw")
      assert.ok(!forbidden.some(([x, y]) => (a.giver === x && a.receiver === y) || (a.giver === y && a.receiver === x)), "rule respected")
    }
    return all
  }
  await checkDraw(ex.id, [H, A, B, C], [[A, B], [A, C]])
  for (const [who, t] of [["H", tH], ["A", tA], ["B", tB], ["C", tC]]) {
    const mine = await list(t, "assignments")
    assert.strictEqual(mine.length, 1, `${who} sees exactly one assignment`)
    assert.strictEqual(mine[0].giver, { H, A, B, C }[who], `${who} sees only their own`)
    const r = ok(await api(t, "GET", `/api/collections/assignments/records/${mine[0].id}?expand=receiver`), "expand receiver")
    assert.ok(r.expand?.receiver?.name, `${who} sees receiver name`)
  }
  assert.strictEqual((await list(tO, "assignments")).length, 0, "outsider sees none")
  const mineH = (await list(tH, "assignments"))[0]
  denied(await api(tH, "PATCH", `/api/collections/assignments/records/${mineH.id}`, { receiver: H }), "edit assignment")
  denied(await api(tH, "POST", "/api/collections/assignments/records", { exchange: ex.id, giver: B, receiver: C }), "forge assignment")
  denied(await api(tH, "DELETE", `/api/collections/assignments/records/${mineH.id}`), "delete assignment")

  // locked while drawn
  denied(await api(tH, "PATCH", `/api/collections/exchanges/records/${ex.id}`, { participants: [H, A, B] }), "participants locked")
  denied(await api(tH, "POST", "/api/collections/exclusions/records", { group: group.id, a: B, b: C }), "rule add locked")
  denied(await api(tH, "DELETE", `/api/collections/exclusions/records/${rule.id}`), "rule delete locked")
  ok(await api(tA, "PATCH", `/api/collections/wishlist_items/records/${item.id}`, { note: "after draw" }), "wish list editable after draw")

  // outsider sees nothing of the group
  denied(await api(tO, "GET", `/api/collections/groups/records/${group.id}`), "outsider group")
  assert.strictEqual((await list(tO, "exchanges")).length, 0, "outsider exchanges")

  // redraw, reset
  ok(await api(tH, "POST", `/api/exchanges/${ex.id}/draw`), "redraw")
  await checkDraw(ex.id, [H, A, B, C], [[A, B], [A, C]])
  denied(await api(tA, "POST", `/api/exchanges/${ex.id}/reset`), "non-host reset")
  ok(await api(tH, "POST", `/api/exchanges/${ex.id}/reset`), "reset")
  assert.strictEqual((await list(su, "assignments", `exchange = "${ex.id}"`)).length, 0, "reset wipes assignments")
  ok(await api(tH, "POST", `/api/exchanges/${ex.id}/draw`), "draw after reset")
  const year1 = await checkDraw(ex.id, [H, A, B, C], [[A, B], [A, C]])

  // next year: no rules, so avoiding last year's receivers is always possible for 4 people
  const ex2 = ok(await api(tH, "POST", "/api/collections/exchanges/records", { group: group.id, year: year + 1 }), "next exchange")
  created.exchanges.push(ex2.id)
  for (const id of created.exclusions.splice(0)) ok(await api(tH, "DELETE", `/api/collections/exclusions/records/${id}`), "delete rule")
  assert.strictEqual((await list(tH, "exclusions")).length, 0, "history is not exposed as rules")
  for (let i = 0; i < 5; i++) {
    ok(await api(tH, "POST", `/api/exchanges/${ex2.id}/draw`), "draw next year")
    const year2 = await checkDraw(ex2.id, [H, A, B, C], [])
    for (const a of year2) assert.ok(!year1.some((p) => p.giver === a.giver && p.receiver === a.receiver), "no repeat of last year")
  }
  console.log("api.check: ok")
} finally {
  for (const [col, list] of Object.entries(created)) {
    for (const id of new Set(list)) await api(su, "DELETE", `/api/collections/${col}/records/${id}`)
  }
}
