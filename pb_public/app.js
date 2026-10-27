// Shared client + helpers for the pages. Loaded after the PocketBase SDK.
const pb = new PocketBase(location.origin)

const param = (k) => new URLSearchParams(location.search).get(k)

// html`...` escapes every interpolated value unless it is itself html`...`
// (or a list of them), so user text can't inject markup.
class Html { constructor(s) { this.s = s } }
function html(strings, ...values) {
  const part = (v) => Array.isArray(v) ? v.map(part).join("")
    : v instanceof Html ? v.s
    : String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  return new Html(strings.reduce((out, s, i) => out + s + (i < values.length ? part(values[i]) : ""), ""))
}
const render = (el, h) => { el.innerHTML = h.s }

function errorText(err) {
  const fields = Object.values(err?.response?.data || {}).map((f) => f.message)
  return [err?.response?.message || err.message, ...fields].join(" ")
}
const showError = (err) => { document.getElementById("error").textContent = errorText(err) }

function requireLogin() {
  if (!pb.authStore.isValid) { location.replace("/"); throw new Error("not logged in") }
  return pb.authStore.record
}
function logout() { pb.authStore.clear(); location.href = "/" }

// Forms and buttons declare data-action="name"; actions[name](values, element) runs it.
// Buttons may add data-confirm="question?". Errors land in #error.
function bind(actions) {
  const run = async (name, values, el) => {
    document.getElementById("error").textContent = ""
    try { await actions[name](values, el) } catch (err) { showError(err) }
  }
  document.addEventListener("submit", (ev) => {
    const form = ev.target
    if (!form.dataset.action) return
    ev.preventDefault()
    run(form.dataset.action, Object.fromEntries(new FormData(form)), form)
  })
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-action]")
    if (!b || (b.type === "submit" && b.form)) return
    if (b.dataset.confirm && !confirm(b.dataset.confirm)) return
    run(b.dataset.action, { ...b.dataset }, b)
  })
}
