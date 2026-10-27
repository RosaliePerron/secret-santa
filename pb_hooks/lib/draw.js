// Draw solver + shared lookups for the hooks. Plain ES5 so it runs in the
// PocketBase JSVM (require it inside each handler) and under node (check file).

// ponytail: Math.random, fine against friends; swap for a CSPRNG if the
// threat model ever includes someone predicting the shuffle.
function shuffle(a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1))
    var t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}

// Random perfect matching giver -> receiver (Kuhn's augmenting paths over
// shuffled candidates). forbidden: list of one-way [giver, receiver] pairs;
// self-draws are always forbidden. Returns {giver: receiver}, or null when no
// valid draw exists (exact, not a timeout). Every valid draw is possible, not
// uniformly likely.
function solve(ids, forbidden) {
  var banned = {}
  forbidden.forEach(function (p) { banned[p[0] + ">" + p[1]] = true })
  var candidates = {}
  ids.forEach(function (g) {
    candidates[g] = shuffle(ids.filter(function (r) { return r !== g && !banned[g + ">" + r] }))
  })

  var giverOf = {}
  function augment(g, seen) {
    var c = candidates[g]
    for (var i = 0; i < c.length; i++) {
      var r = c[i]
      if (seen[r]) continue
      seen[r] = true
      if (!giverOf[r] || augment(giverOf[r], seen)) { giverOf[r] = g; return true }
    }
    return false
  }

  var givers = shuffle(ids.slice())
  for (var i = 0; i < givers.length; i++) {
    if (!augment(givers[i], {})) return null
  }
  var result = {}
  Object.keys(giverOf).forEach(function (r) { result[giverOf[r]] = r })
  return result
}

// Exclusion rules of a group as one-way pairs, both directions.
function rulePairs(app, groupId) {
  var pairs = []
  app.findRecordsByFilter("exclusions", "group = {:g}", "", 0, 0, { g: groupId }).forEach(function (x) {
    pairs.push([x.getString("a"), x.getString("b")], [x.getString("b"), x.getString("a")])
  })
  return pairs
}

// Most recent exchange of a group (highest year), or null.
function latestExchange(app, groupId) {
  var list = app.findRecordsByFilter("exchanges", "group = {:g}", "-year", 1, 0, { g: groupId })
  return list.length ? list[0] : null
}

// Exchange from the route's {id} and its group; throws unless the caller hosts it.
function hostExchange(app, e) {
  var exchange = app.findRecordById("exchanges", e.request.pathValue("id"))
  var group = app.findRecordById("groups", exchange.getString("group"))
  if (group.getString("host") !== e.auth.id) throw new ForbiddenError("Only the host can do this.")
  return { exchange: exchange, group: group }
}

function clearAssignments(app, exchangeId) {
  app.findRecordsByFilter("assignments", "exchange = {:x}", "", 0, 0, { x: exchangeId }).forEach(function (a) {
    app.delete(a)
  })
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// Best effort: a failed email is logged, never undoes the action that sent it.
function mail(app, to, subject, html) {
  var meta = app.settings().meta
  try {
    app.newMailClient().send(new MailerMessage({
      from: { address: meta.senderAddress, name: meta.senderName },
      to: [{ address: to }],
      subject: subject,
      html: html,
    }))
  } catch (err) {
    app.logger().error("mail failed", "to", to, "subject", subject, "error", String(err))
  }
}

module.exports = {
  solve: solve, rulePairs: rulePairs, latestExchange: latestExchange,
  hostExchange: hostExchange, clearAssignments: clearAssignments, esc: esc, mail: mail,
}
