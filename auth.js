"use strict";
/**
 * Owner login (no dependencies).
 * - Credentials come from environment variables, never from the code:
 *     ADMIN_USER (default "admin"), ADMIN_PASSWORD, SESSION_SECRET
 * - If ADMIN_PASSWORD is not set, a random temporary one is printed at startup.
 * - Signed HttpOnly session cookie, CSRF header on every write, lockout after repeated failures.
 */
const crypto = require("crypto");

const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;
const err = (status, msg) => Object.assign(new Error(msg), { status });
const eq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

function createAuth(opts = {}) {
  const ttl = opts.ttlMs || 8 * 3600 * 1000;
  const userName = process.env.ADMIN_USER || "admin";
  let password = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!password) { password = crypto.randomBytes(9).toString("base64url"); generated = true; }
  const salt = crypto.randomBytes(16);
  const expected = crypto.scryptSync(password, salt, 64);
  const secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
  const fails = new Map();

  const ip = (req) => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const https = (req) => req.headers["x-forwarded-proto"] === "https" || !!req.socket.encrypted;
  const sign = (data) => crypto.createHmac("sha256", secret).update(data).digest("base64url");
  const cookies = (req) => Object.fromEntries(
    String(req.headers.cookie || "").split(";").map((c) => c.trim().split(/=(.*)/s).slice(0, 2)).filter((p) => p[0])
  );
  const cookieHeader = (req, value, maxAgeSec) =>
    `sid=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${https(req) ? "; Secure" : ""}`;

  function session(req) {
    const token = cookies(req).sid;
    if (!token) return null;
    const [body, sig] = token.split(".");
    if (!body || !sig || !eq(sig, sign(body))) return null;
    try {
      const p = JSON.parse(Buffer.from(body, "base64url").toString());
      return p.exp > Date.now() ? p : null;
    } catch { return null; }
  }

  return {
    announce() {
      if (generated) console.log(`No ADMIN_PASSWORD set. Temporary login -> user: ${userName}  password: ${password}  (changes on every restart)`);
    },
    me(req) {
      const s = session(req);
      return { loggedIn: !!s, user: s ? s.u : null, csrf: s ? s.csrf : null };
    },
    login(req, body) {
      const key = ip(req), f = fails.get(key), active = f && f.until > Date.now();
      if (active && f.n >= MAX_FAILS) throw err(429, "Too many failed attempts. Try again in a few minutes.");
      const userOk = eq(sha(body.username), sha(userName));
      const passOk = crypto.timingSafeEqual(crypto.scryptSync(String(body.password || "").slice(0, 200), salt, 64), expected);
      if (!(userOk && passOk)) {
        fails.set(key, { n: (active ? f.n : 0) + 1, until: Date.now() + LOCK_MS });
        throw err(401, "Invalid username or password.");
      }
      fails.delete(key);
      const payload = { u: userName, csrf: crypto.randomBytes(16).toString("hex"), exp: Date.now() + ttl };
      const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
      return { cookie: cookieHeader(req, `${b64}.${sign(b64)}`, Math.floor(ttl / 1000)), user: userName, csrf: payload.csrf };
    },
    clearCookie: (req) => cookieHeader(req, "", 0),
    requireLogin(req) { if (!session(req)) throw err(401, "Login required"); },
    requireWrite(req) {
      const s = session(req);
      if (!s) throw err(401, "Login required");
      const sent = req.headers["x-csrf-token"];
      if (!sent || !eq(sent, s.csrf)) throw err(403, "Invalid security token. Reload the page and log in again.");
    },
  };
}
module.exports = { createAuth };
