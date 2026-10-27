// Self-check for the draw solver: `node pb_hooks/lib/draw.check.js`
const assert = require("assert")
const { solve } = require("./draw.js")

function assertValid(ids, forbidden, result) {
  assert.deepStrictEqual(Object.keys(result).sort(), [...ids].sort(), "every participant gives")
  assert.deepStrictEqual(Object.values(result).sort(), [...ids].sort(), "every participant receives once")
  for (const g of ids) {
    assert.notStrictEqual(result[g], g, "no self-draw")
    assert.ok(!forbidden.some(([a, b]) => a === g && b === result[g]), `forbidden ${g}>${result[g]}`)
  }
}

// random groups with random rules: any result must be valid
for (let run = 0; run < 2000; run++) {
  const n = 3 + Math.floor(Math.random() * 28)
  const ids = Array.from({ length: n }, (_, i) => "u" + i)
  const forbidden = []
  for (let k = Math.floor(Math.random() * n); k > 0; k--) {
    const a = ids[Math.floor(Math.random() * n)], b = ids[Math.floor(Math.random() * n)]
    if (a !== b) forbidden.push([a, b], [b, a])
  }
  const result = solve(ids, forbidden)
  if (result) assertValid(ids, forbidden, result)
}

// impossible: A can draw nobody
assert.strictEqual(solve(["A", "B", "C"], [["A", "B"], ["B", "A"], ["A", "C"], ["C", "A"]]), null)
// impossible: A and B both need C (Hall violation, not caught by a per-giver check)
assert.strictEqual(solve(["A", "B", "C", "D"], [["A", "B"], ["A", "D"], ["B", "A"], ["B", "D"]]), null)
// two people: only A<->B
assert.deepStrictEqual(solve(["A", "B"], []), { A: "B", B: "A" })

// randomness: 4 people have 9 derangements, all should show up
const seen = new Set()
for (let i = 0; i < 2000; i++) { const r = solve(["A", "B", "C", "D"], []); seen.add("ABCD".split("").map((g) => r[g]).join("")) }
assert.strictEqual(seen.size, 9, `expected all 9 derangements, saw ${seen.size}`)

console.log("draw.check: ok")
