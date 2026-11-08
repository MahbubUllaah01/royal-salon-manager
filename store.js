"use strict";
/**
 * Storage for the whole app state.
 * - Default: a JSON file (data.json), created from seed.json on first run.
 * - If DATABASE_URL is set: one JSONB row in PostgreSQL, so data survives restarts and redeploys.
 *   (Set PGSSL=true when the database requires SSL, for example an external connection URL.)
 * Writes are queued so two requests never overwrite each other.
 */
const fs = require("fs");

function fileBackend(file) {
  return {
    async get() { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null; },
    async put(state) { fs.writeFileSync(file + ".tmp", JSON.stringify(state, null, 2)); fs.renameSync(file + ".tmp", file); },
  };
}

function pgBackend(url, injectedPool) {
  let pool = injectedPool, ready;
  const init = () => {
    if (!ready) {
      if (!pool) {
        const { Pool } = require("pg");
        pool = new Pool({ connectionString: url, ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false });
      }
      ready = pool.query("CREATE TABLE IF NOT EXISTS app_state (id INT PRIMARY KEY, data JSONB NOT NULL)");
    }
    return ready;
  };
  return {
    async get() { await init(); const r = await pool.query("SELECT data FROM app_state WHERE id = 1"); return r.rows[0] ? r.rows[0].data : null; },
    async put(state) {
      await init();
      await pool.query("INSERT INTO app_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify(state)]);
    },
  };
}

function createStore({ file, seedFile, prepare, pool }) {
  const url = process.env.DATABASE_URL;
  const backend = url || pool ? pgBackend(url, pool) : fileBackend(file);
  let queue = Promise.resolve();

  async function load() {
    let s = await backend.get();
    if (!s) {
      s = JSON.parse(fs.readFileSync(seedFile, "utf8"));
      if (prepare) s = prepare(s);
      await backend.put(s);
    }
    return s;
  }
  return {
    read: () => queue.then(load, load),
    /** Run fn(state) on the latest state, save the result if fn did not throw, and return fn's value. */
    update(fn) {
      const run = queue.then(async () => {
        const s = await load();
        const out = fn(s);
        await backend.put(s);
        return out;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}
module.exports = { createStore };
