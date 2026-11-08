"use strict";
/**
 * Royal Hairdresser - Smart Salon Manager (backend API, Node.js, no required dependencies)
 * Run: node server.js   then open http://localhost:3100
 *
 * Environment variables (all optional for local use):
 *   ADMIN_USER, ADMIN_PASSWORD, SESSION_SECRET   owner login (see README)
 *   DATABASE_URL                                 PostgreSQL storage (otherwise data.json)
 *   EMPTY_START=true                             start without the sample appointments (use for real data)
 *   PUBLIC_DEMO=true                             let visitors VIEW the sample data without logging in
 *                                                (never enable this with real customer data)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { createStore } = require("./store");
const { createAuth } = require("./auth");

const DIR = __dirname;
const STATIC = { "/": "index.html", "/index.html": "index.html", "/style.css": "style.css", "/app.js": "app.js" };
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const ACTIVE = ["booked", "waiting"];

// ---------- helpers ----------
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const text = (v, max) => String(v || "").trim().slice(0, max);
const dhakaDate = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);

function normalizePhone(v, required) {
  let p = String(v || "").replace(/[\s-]/g, "");
  if (!p && !required) return "";
  p = p.replace(/^\+?88/, "");
  if (!/^01[3-9]\d{8}$/.test(p)) throw bad("Enter a valid Bangladeshi mobile number (01XXXXXXXXX)");
  return p;
}
const DT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
function minutesOf(str) {
  const m = DT.exec(str || "");
  if (!m) throw bad("Date and time must look like 2026-11-08T14:30");
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000;
}
function addMinutes(str, mins) {
  const d = new Date((minutesOf(str) + mins) * 60000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
const dateOf = (str) => str.slice(0, 10);

// ---------- sample data (only when the store is first created) ----------
function prepare(s) {
  if (process.env.EMPTY_START === "true") return s;
  const day = dhakaDate();
  const price = (ids) => ids.reduce((n, id) => n + s.services.find((x) => x.id === id).price, 0);
  const mins = (ids) => ids.reduce((n, id) => n + s.services.find((x) => x.id === id).minutes, 0);
  const names = (ids) => ids.map((id) => s.services.find((x) => x.id === id).name);
  const demo = [
    ["Sample Customer A", "01700000001", ["haircut", "beard"], "Stylist 1", "11:00", "booked", "completed"],
    ["Sample Customer B", "01700000002", ["color"], "Stylist 2", "12:00", "booked", "completed"],
    ["Sample Customer C", "01700000003", ["haircut"], "Stylist 1", "14:30", "booked", "booked"],
    ["Sample Customer D", "01700000004", ["facial", "wash"], "Stylist 2", "16:00", "booked", "booked"],
    ["Sample Customer E", "01700000005", ["shave"], "Stylist 1", "17:30", "booked", "booked"],
    ["Walk-in", "", ["shave"], "Any", "13:10", "walkin", "waiting"],
    ["Walk-in", "", ["haircut"], "Any", "13:25", "walkin", "waiting"],
  ];
  let token = 0;
  demo.forEach(([name, phone, ids, stylist, time, type, status], i) => {
    const start = `${day}T${time}`;
    const a = { id: "demo" + (i + 1), type, customerName: name, phone, serviceIds: ids, serviceNames: names(ids), stylist,
                start, end: addMinutes(start, mins(ids)), minutes: mins(ids), total: price(ids), status, createdTs: 0 };
    if (type === "walkin") a.token = ++token;
    s.appointments.push(a);
    if (status === "completed") {
      s.customers[phone] = { name, phone, visits: 1, totalSpent: a.total, lastVisit: day };
    }
  });
  s.tokens[day] = token;
  return s;
}

const store = createStore({
  file: process.env.SALON_DATA || path.join(DIR, "data.json"),
  seedFile: path.join(DIR, "seed.json"),
  pool: global.__TEST_POOL__,
  prepare,
});
const auth = createAuth();

function pickServices(s, ids) {
  if (!Array.isArray(ids) || !ids.length) throw bad("Choose at least one service");
  const list = ids.map((id) => s.services.find((x) => x.id === id));
  if (list.some((x) => !x)) throw bad("Unknown service");
  return list;
}
function conflict(s, stylist, start, end) {
  if (!stylist || stylist === "Any") return null;
  const a = minutesOf(start), b = minutesOf(end);
  return s.appointments.find((x) => ACTIVE.includes(x.status) && x.stylist === stylist && a < minutesOf(x.end) && b > minutesOf(x.start)) || null;
}
function summary(s, date) {
  const day = s.appointments.filter((a) => dateOf(a.start) === date);
  const done = day.filter((a) => a.status === "completed");
  const byService = {}, byStylist = {};
  done.forEach((a) => {
    a.serviceNames.forEach((n) => (byService[n] = (byService[n] || 0) + 1));
    byStylist[a.stylist] = (byStylist[a.stylist] || 0) + a.total;
  });
  const top = Object.entries(byService).sort((x, y) => y[1] - x[1])[0];
  return {
    date, revenue: done.reduce((n, a) => n + a.total, 0), completed: done.length,
    upcoming: day.filter((a) => a.status === "booked").length, waiting: day.filter((a) => a.status === "waiting").length,
    cancelled: day.filter((a) => a.status === "cancelled").length, noShow: day.filter((a) => a.status === "no-show").length,
    topService: top ? top[0] : null, byStylist,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 1e5) { reject(bad("Body too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(bad("Invalid JSON")); } });
  });
}
const send = (res, code, body, type = "application/json; charset=utf-8", headers = {}) => {
  res.writeHead(code, { "Content-Type": type, "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
                        "Referrer-Policy": "no-referrer", "Cache-Control": "no-store", ...headers });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

// ---------- routes ----------
async function api(req, res, fullUrl) {
  const [url, query = ""] = fullUrl.split("?");
  const publicDemo = process.env.PUBLIC_DEMO === "true";
  const canRead = () => { if (!publicDemo) auth.requireLogin(req); };

  if (req.method === "GET" && url === "/api/me") return send(res, 200, { ...auth.me(req), publicDemo });
  if (req.method === "POST" && url === "/api/login") {
    const r = auth.login(req, await readBody(req));
    return send(res, 200, { ok: true, user: r.user, csrf: r.csrf }, undefined, { "Set-Cookie": r.cookie });
  }
  if (req.method === "POST" && url === "/api/logout") return send(res, 200, { ok: true }, undefined, { "Set-Cookie": auth.clearCookie(req) });

  if (req.method === "GET" && url === "/api/state") {
    canRead();
    const s = await store.read();
    const date = new URLSearchParams(query).get("date") || dhakaDate();
    const regulars = Object.values(s.customers).sort((a, b) => b.visits - a.visits).slice(0, 10);
    return send(res, 200, {
      shop: s.shop, note: s.note, services: s.services, stylists: s.stylists, summary: summary(s, date),
      appointments: s.appointments.filter((a) => dateOf(a.start) === date).sort((a, b) => minutesOf(a.start) - minutesOf(b.start)),
      customers: regulars,
    });
  }
  if (req.method === "GET" && url === "/api/customer") {
    canRead();
    const s = await store.read();
    const phone = normalizePhone(new URLSearchParams(query).get("phone"), true);
    const c = s.customers[phone];
    return send(res, 200, { customer: c || null, loyaltyDue: !!c && (c.visits + 1) % s.shop.loyaltyEvery === 0 });
  }
  if (req.method === "GET" && url === "/api/export") {
    auth.requireLogin(req);
    return send(res, 200, await store.read(), undefined, { "Content-Disposition": "attachment; filename=salon-backup.json" });
  }
  if (req.method !== "POST") return send(res, 404, { error: "Not found" });

  auth.requireWrite(req);
  const b = await readBody(req);

  if (url === "/api/appointments" || url === "/api/walkins") {
    const walkin = url === "/api/walkins";
    const appt = await store.update((s) => {
      const services = pickServices(s, b.serviceIds);
      const minutes = services.reduce((n, x) => n + x.minutes, 0);
      const start = String(b.start || "");
      minutesOf(start);
      const end = addMinutes(start, minutes);
      const stylist = text(b.stylist, 40) || "Any";
      if (stylist !== "Any" && !s.stylists.includes(stylist)) throw bad("Unknown stylist");
      const hour = (t) => +t.slice(11, 13) + +t.slice(14, 16) / 60;
      if (!walkin && (hour(start) < s.shop.openHour || hour(end) > s.shop.closeHour || dateOf(end) !== dateOf(start))) {
        throw bad(`Appointments must fit between ${s.shop.openHour}:00 and ${s.shop.closeHour}:00`);
      }
      if (!walkin) {
        const clash = conflict(s, stylist, start, end);
        if (clash) throw bad(`${stylist} is already booked ${clash.start.slice(11)} to ${clash.end.slice(11)}`);
      }
      const a = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        type: walkin ? "walkin" : "booked", customerName: text(b.customerName, 60) || (walkin ? "Walk-in" : ""),
        phone: normalizePhone(b.phone, !walkin), serviceIds: services.map((x) => x.id), serviceNames: services.map((x) => x.name),
        stylist, start, end, minutes, total: services.reduce((n, x) => n + x.price, 0),
        status: walkin ? "waiting" : "booked", createdTs: Date.now(),
      };
      if (!a.customerName) throw bad("Customer name is required");
      if (walkin) { const day = dateOf(start); s.tokens[day] = (s.tokens[day] || 0) + 1; a.token = s.tokens[day]; }
      s.appointments.push(a);
      return a;
    });
    return send(res, 201, { ok: true, appointment: appt });
  }

  const m = /^\/api\/appointments\/([\w]+)\/status$/.exec(url);
  if (m) {
    const appt = await store.update((s) => {
      const a = s.appointments.find((x) => x.id === m[1]);
      if (!a) throw bad("Appointment not found", 404);
      const next = String(b.status);
      if (!["completed", "cancelled", "no-show"].includes(next)) throw bad("Invalid status");
      if (!ACTIVE.includes(a.status)) throw bad(`Already ${a.status}`);
      a.status = next;
      if (next === "completed") {
        a.completedTs = Date.now();
        if (a.phone) {
          const c = s.customers[a.phone] || { name: a.customerName, phone: a.phone, visits: 0, totalSpent: 0 };
          c.visits += 1; c.totalSpent += a.total; c.lastVisit = dateOf(a.start); c.name = a.customerName || c.name;
          s.customers[a.phone] = c;
        }
      }
      return a;
    });
    return send(res, 200, { ok: true, appointment: appt });
  }
  return send(res, 404, { error: "Not found" });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  try {
    if (url.startsWith("/api/")) return await api(req, res, req.url);
    if (req.method === "GET" && STATIC[url]) {
      const file = STATIC[url];
      return send(res, 200, fs.readFileSync(path.join(DIR, file)), TYPES[path.extname(file)]);
    }
    return send(res, 404, { error: "Not found" });
  } catch (e) {
    return send(res, e.status || 500, { error: e.status ? e.message : "Server error" });
  }
});

if (require.main === module) {
  const port = process.env.PORT || 3100;
  server.listen(port, () => {
    console.log(`Salon Manager running at http://localhost:${port}`);
    auth.announce();
  });
}
module.exports = { server, normalizePhone, addMinutes, dhakaDate };
