"use strict";
const test = require("node:test");
const assert = require("node:assert");
const os = require("os");
const path = require("path");
process.env.SALON_DATA = path.join(os.tmpdir(), `salon-test-${Date.now()}.json`);
process.env.ADMIN_USER = "owner";
process.env.ADMIN_PASSWORD = "test-password-123";
const { server, normalizePhone, addMinutes, dhakaDate } = require("./server.js");
const { createStore } = require("./store.js");

let base, cookie = "", csrf = "";
test.before(() => new Promise((r) => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
test.after(() => server.close());

const json = { "Content-Type": "application/json" };
const post = (url, body, extra = {}) => fetch(base + url, { method: "POST", headers: { ...json, ...extra }, body: JSON.stringify(body) });
const authed = (url, body) => post(url, body, { Cookie: cookie, "X-CSRF-Token": csrf });
const get = (url) => fetch(base + url, { headers: { Cookie: cookie } });
const book = (over = {}) => authed("/api/appointments", { customerName: "Rafi", phone: "01712345678", serviceIds: ["haircut"], stylist: "Stylist 1", start: "2026-11-09T11:00", ...over });

test("phone normalisation and time maths", () => {
  assert.strictEqual(normalizePhone("+88 01712-345678", true), "01712345678");
  assert.throws(() => normalizePhone("12345", true));
  assert.strictEqual(addMinutes("2026-11-09T10:50", 20), "2026-11-09T11:10");
});

test("everything is private until the owner logs in", async () => {
  assert.strictEqual((await fetch(base + "/api/state")).status, 401);
  assert.strictEqual((await post("/api/appointments", {})).status, 401);
  assert.strictEqual((await post("/api/login", { username: "owner", password: "wrong" })).status, 401);
});

test("owner logs in with the right password", async () => {
  const r = await post("/api/login", { username: "owner", password: "test-password-123" });
  assert.strictEqual(r.status, 200);
  cookie = r.headers.get("set-cookie").split(";")[0];
  csrf = (await r.json()).csrf;
  assert.strictEqual((await get("/api/state")).status, 200);
});

test("writes also need the CSRF token", async () => {
  const r = await post("/api/appointments", {}, { Cookie: cookie });
  assert.strictEqual(r.status, 403);
});

test("sample appointments for today are preloaded", async () => {
  const s = await (await get(`/api/state?date=${dhakaDate()}`)).json();
  assert.ok(s.appointments.length >= 5 && s.summary.revenue > 0);
});

test("books an appointment and computes total and end time", async () => {
  const r = await book({ serviceIds: ["haircut", "beard"] });
  const { appointment } = await r.json();
  assert.strictEqual(r.status, 201);
  assert.strictEqual(appointment.total, 400);
  assert.strictEqual(appointment.end, "2026-11-09T11:50");
});

test("blocks double booking of the same stylist but allows another stylist", async () => {
  const clash = await book({ start: "2026-11-09T11:20", phone: "01811111111" });
  assert.strictEqual(clash.status, 400);
  assert.ok((await clash.json()).error.includes("already booked"));
  assert.strictEqual((await book({ start: "2026-11-09T11:20", stylist: "Stylist 2", phone: "01811111111" })).status, 201);
});

test("rejects bookings outside opening hours", async () => {
  assert.strictEqual((await book({ start: "2026-11-09T08:00" })).status, 400);
  assert.strictEqual((await book({ start: "2026-11-09T20:50" })).status, 400);
});

test("walk-in tokens count up per day", async () => {
  const w = (name, t) => authed("/api/walkins", { customerName: name, serviceIds: ["shave"], start: `2026-11-10T${t}` }).then((r) => r.json());
  const a = await w("Walk", "12:00"), b = await w("Walk2", "12:05");
  assert.deepStrictEqual([a.appointment.token, b.appointment.token], [1, 2]);
});

test("completing records revenue and customer visits", async () => {
  const { appointment } = await (await book({ start: "2026-11-11T15:00", phone: "01999999999", customerName: "Sakib" })).json();
  assert.strictEqual((await authed(`/api/appointments/${appointment.id}/status`, { status: "completed" })).status, 200);
  assert.strictEqual((await authed(`/api/appointments/${appointment.id}/status`, { status: "cancelled" })).status, 400);
  const state = await (await get("/api/state?date=2026-11-11")).json();
  assert.strictEqual(state.summary.revenue, 250);
  assert.strictEqual(state.customers.find((c) => c.phone === "01999999999").visits, 1);
});

test("public demo mode lets visitors view but never write", async () => {
  process.env.PUBLIC_DEMO = "true";
  assert.strictEqual((await fetch(base + "/api/state")).status, 200);
  assert.strictEqual((await post("/api/appointments", {})).status, 401);
  assert.strictEqual((await fetch(base + "/api/export")).status, 401);
  delete process.env.PUBLIC_DEMO;
  assert.strictEqual((await fetch(base + "/api/state")).status, 401);
});

test("lockout after repeated wrong passwords", async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await post("/api/login", { username: "owner", password: "bad" + i });
  assert.strictEqual(last.status, 429);
});

test("serves the frontend and hides other files", async () => {
  assert.ok((await (await fetch(base + "/")).text()).includes("Royal Hairdresser"));
  for (const f of ["/seed.json", "/server.js", "/auth.js"]) assert.strictEqual((await fetch(base + f)).status, 404);
});

test("PostgreSQL storage path works with a fake pool", async () => {
  const rows = [];
  const pool = { async query(sql, params) {
    if (sql.startsWith("SELECT")) return { rows: rows.map((data) => ({ data })) };
    if (sql.startsWith("INSERT")) rows[0] = JSON.parse(params[0]);
    return { rows: [] };
  } };
  const store = createStore({ seedFile: path.join(__dirname, "seed.json"), pool });
  assert.ok((await store.read()).services.length > 0 && rows.length === 1);
  await store.update((s) => { s.stylists.push("Stylist 3"); });
  assert.ok((await store.read()).stylists.includes("Stylist 3"));
});
