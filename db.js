// Database layer (libSQL)
// - Local / VPS: no env vars → a normal SQLite file at ./data/venue.db
// - Free hosting (e.g. Render free + Turso): set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
// Uploaded photos are stored in the database too, so a server restart never loses them.
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { SETTINGS, TABLES, SEED } = require('./schema');

let url = process.env.TURSO_DATABASE_URL;
if (!url) {
  const dir = process.env.DATA_DIR || path.join(__dirname, 'data');
  fs.mkdirSync(dir, { recursive: true });
  url = 'file:' + path.join(dir, 'venue.db');
}
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

function wrap(ex) {
  const norm = a => a.map(x => (x === undefined ? null : typeof x === 'boolean' ? (x ? 1 : 0) : x));
  const objs = r => r.rows.map(row => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
  return {
    all: async (sql, ...a) => objs(await ex.execute({ sql, args: norm(a) })),
    get: async (sql, ...a) => objs(await ex.execute({ sql, args: norm(a) }))[0],
    run: async (sql, ...a) => { const r = await ex.execute({ sql, args: norm(a) }); return { id: Number(r.lastInsertRowid ?? 0), changes: r.rowsAffected }; },
  };
}
const db = wrap(client);
db.tx = async fn => {
  const t = await client.transaction('write');
  try { const out = await fn(wrap(t)); await t.commit(); return out; }
  catch (e) { await t.rollback().catch(() => {}); throw e; }
  finally { t.close(); }
};

const SETTING_FIELDS = SETTINGS.flatMap(g => g.fields);
const colType = f => (f.type === 'number' ? 'REAL' : f.type === 'bool' ? 'INTEGER' : 'TEXT');
const ARRAY_TYPES = ['images', 'tags', 'lines'];

async function init() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
    `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`,
    `CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS files (name TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS gallery (id INTEGER PRIMARY KEY AUTOINCREMENT, image TEXT NOT NULL, caption TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT DEFAULT '',
      event_type TEXT DEFAULT '', date TEXT NOT NULL, slot TEXT NOT NULL,
      hall_id INTEGER, hall_name TEXT DEFAULT '', guests INTEGER DEFAULT 0,
      package_id INTEGER, package_name TEXT DEFAULT '', per_head REAL DEFAULT 0,
      base_total REAL DEFAULT 0, extras REAL DEFAULT 0, discount REAL DEFAULT 0, total REAL DEFAULT 0,
      notes TEXT DEFAULT '', admin_notes TEXT DEFAULT '', status TEXT DEFAULT 'pending', source TEXT DEFAULT 'website',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX IF NOT EXISTS idx_book_date ON bookings(date, hall_id, slot)`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, type TEXT NOT NULL, category TEXT NOT NULL,
      amount REAL NOT NULL, method TEXT DEFAULT 'Cash', description TEXT DEFAULT '',
      booking_id INTEGER, employee_id INTEGER, salary_payment_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date)`,
    `CREATE TABLE IF NOT EXISTS salary_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL, month TEXT NOT NULL,
      base REAL DEFAULT 0, bonus REAL DEFAULT 0, deduction REAL DEFAULT 0, net REAL DEFAULT 0,
      paid_on TEXT, method TEXT DEFAULT 'Cash', note TEXT DEFAULT '', transaction_id INTEGER,
      UNIQUE(employee_id, month))`,
  ];
  for (const [name, def] of Object.entries(TABLES)) {
    stmts.push(`CREATE TABLE IF NOT EXISTS ${name} (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, ${def.fields.map(f => `${f.key} ${colType(f)}`).join(', ')})`);
  }
  await client.batch(stmts, 'write');

  // add any columns added to schema.js later
  for (const [name, def] of Object.entries(TABLES)) {
    const have = new Set((await db.all(`PRAGMA table_info(${name})`)).map(c => c.name));
    for (const f of def.fields) if (!have.has(f.key)) await db.run(`ALTER TABLE ${name} ADD COLUMN ${f.key} ${colType(f)}`);
  }

  await client.batch(SETTING_FIELDS.map(f => ({ sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', args: [f.key, String(f.default ?? '')] })), 'write');

  for (const [name, rows] of Object.entries(SEED)) {
    if (!rows.length || (await db.get(`SELECT COUNT(*) c FROM ${name}`)).c) continue;
    for (const r of rows) await insertRow(name, r);
  }

  // multi-admin + activity log (also upgrades databases created before this feature)
  const addCol = async (table, col, type) => {
    const have = new Set((await db.all(`PRAGMA table_info(${table})`)).map(c => c.name));
    if (!have.has(col)) await db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  };
  await addCol('admins', 'name', "TEXT DEFAULT ''");
  await addCol('admins', 'role', "TEXT DEFAULT 'admin'");
  await addCol('admins', 'permissions', "TEXT DEFAULT '[]'");
  await addCol('admins', 'active', 'INTEGER DEFAULT 1');
  await addCol('admins', 'last_login', 'TEXT');
  await addCol('admins', 'created_at', 'TEXT');
  await addCol('bookings', 'created_by', "TEXT DEFAULT ''");
  await addCol('bookings', 'status_by', "TEXT DEFAULT ''");
  await addCol('bookings', 'addons', "TEXT DEFAULT '[]'");
  await addCol('bookings', 'menu', "TEXT DEFAULT '[]'");
  await addCol('bookings', 'menu_total', 'REAL DEFAULT 0');
  await addCol('bookings', 'addons_total', 'REAL DEFAULT 0');
  await addCol('transactions', 'purpose', "TEXT DEFAULT ''");
  await addCol('transactions', 'recorded_by', "TEXT DEFAULT ''");
  await addCol('salary_payments', 'paid_by', "TEXT DEFAULT ''");
  await db.run(`CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER, admin_name TEXT, action TEXT, entity TEXT, entity_id INTEGER,
    summary TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_act ON activity(entity, entity_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_act_admin ON activity(admin_id, id)');
  await db.run(`CREATE TABLE IF NOT EXISTS day_closings (
    date TEXT PRIMARY KEY, tx_count INTEGER, income REAL, expense REAL, fingerprint TEXT,
    closed_at TEXT DEFAULT CURRENT_TIMESTAMP, closed_by TEXT)`);

  if (!(await db.get('SELECT COUNT(*) c FROM admins')).c) {
    const u = process.env.ADMIN_USER || 'admin', p = process.env.ADMIN_PASSWORD || 'changeme123';
    await db.run(`INSERT INTO admins (username, password_hash, name, role, active, created_at) VALUES (?, ?, 'Owner', 'owner', 1, CURRENT_TIMESTAMP)`, u, bcrypt.hashSync(p, 10));
    console.log(`\n  Admin account created → username: ${u}\n  (password from ADMIN_PASSWORD, or "changeme123" if not set — change it after logging in)\n`);
  }
  // there is always exactly one owner: the first admin, if none was set yet
  if (!(await db.get(`SELECT COUNT(*) c FROM admins WHERE role = 'owner'`)).c) {
    await db.run(`UPDATE admins SET role = 'owner', active = 1, name = CASE WHEN name IS NULL OR name = '' THEN username ELSE name END WHERE id = (SELECT MIN(id) FROM admins)`);
  }
  await db.run(`UPDATE admins SET name = username WHERE name IS NULL OR name = ''`);
  let secret = process.env.JWT_SECRET || (await db.get(`SELECT value FROM meta WHERE key = 'jwt_secret'`))?.value;
  if (!secret) { secret = crypto.randomBytes(48).toString('hex'); await db.run(`INSERT INTO meta (key, value) VALUES ('jwt_secret', ?)`, secret); }
  return { secret, where: process.env.TURSO_DATABASE_URL ? 'Turso cloud database' : url };
}

// ---------- settings ----------
async function getSettings() {
  const s = {};
  (await db.all('SELECT key, value FROM settings')).forEach(r => (s[r.key] = r.value));
  for (const f of SETTING_FIELDS) {
    if (f.type === 'images') { try { s[f.key] = JSON.parse(s[f.key] || '[]'); } catch { s[f.key] = []; } }
  }
  return s;
}
async function saveSettings(obj) {
  const types = Object.fromEntries(SETTING_FIELDS.map(f => [f.key, f.type]));
  const stmts = [];
  for (let [k, v] of Object.entries(obj)) {
    if (!types[k]) continue;
    if (types[k] === 'images') v = JSON.stringify((Array.isArray(v) ? v : []).filter(x => /^\/uploads\//.test(x)).slice(0, 12));
    else if (Array.isArray(v)) v = v.map(x => String(x).trim()).filter(Boolean).join(types[k] === 'tags' ? ', ' : '\n');
    else if (typeof v === 'boolean') v = v ? '1' : '0';
    stmts.push({ sql: 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', args: [k, String(v ?? '').slice(0, 20000)] });
  }
  if (stmts.length) await client.batch(stmts, 'write');
}

// ---------- generic tables ----------
function clean(name, input) {
  const def = TABLES[name], out = {};
  for (const f of def.fields) {
    let v = input[f.key];
    if (v === undefined && f.default !== undefined) v = f.default;
    switch (f.type) {
      case 'number': v = v === '' || v == null ? null : Number(v); if (Number.isNaN(v)) v = null; break;
      case 'bool': v = v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0; break;
      case 'select': v = f.options.includes(v) ? v : (f.default || f.options[0]); break;
      case 'date': v = /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : ''; break;
      case 'images': v = JSON.stringify((Array.isArray(v) ? v : []).map(String).filter(x => /^\/uploads\//.test(x)).slice(0, 30)); break;
      case 'tags': v = JSON.stringify((Array.isArray(v) ? v : String(v ?? '').split(',')).map(x => String(x).trim()).filter(Boolean).slice(0, 60)); break;
      case 'lines': v = JSON.stringify((Array.isArray(v) ? v : String(v ?? '').split('\n')).map(x => String(x).trim()).filter(Boolean).slice(0, 80)); break;
      default: v = String(v ?? '').trim().slice(0, 5000);
    }
    out[f.key] = v;
  }
  const miss = def.fields.find(f => f.required && (out[f.key] === '' || out[f.key] == null));
  if (miss) throw new Error(`${miss.label} is required`);
  return out;
}
function parseRow(name, r) {
  if (!r) return r;
  const o = { ...r };
  for (const f of TABLES[name].fields) {
    if (ARRAY_TYPES.includes(f.type)) { try { o[f.key] = JSON.parse(o[f.key] || '[]'); } catch { o[f.key] = []; } }
    if (f.type === 'bool') o[f.key] = !!o[f.key];
  }
  return o;
}
async function listRows(name, where = '', ...args) {
  return (await db.all(`SELECT * FROM ${name} ${where} ORDER BY ${TABLES[name].order || 'id'}`, ...args)).map(r => parseRow(name, r));
}
async function getRow(name, id) { return parseRow(name, await db.get(`SELECT * FROM ${name} WHERE id = ?`, id)); }
async function insertRow(name, input) {
  const d = clean(name, input), keys = Object.keys(d);
  return (await db.run(`INSERT INTO ${name} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map(k => d[k]))).id;
}
async function updateRow(name, id, input) {
  const d = clean(name, input), keys = Object.keys(d);
  await db.run(`UPDATE ${name} SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map(k => d[k]), id);
}

module.exports = { db, client, init, getSettings, saveSettings, listRows, getRow, insertRow, updateRow, SETTING_FIELDS };
