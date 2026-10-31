// Gul Makkai Palace — website, booking requests and admin panel (bookings, cashflow, employees, payroll)
// Run: npm start  →  site http://localhost:3000   admin http://localhost:3000/admin
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const sharp = require('sharp');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const { SETTINGS, TABLES, PERMISSIONS, INCOME_CATEGORIES, EXPENSE_CATEGORIES, PAY_METHODS, PAYMENT_PURPOSES } = require('./schema');
const { db, init, getSettings, saveSettings, listRows, getRow, insertRow, updateRow } = require('./db');

const PORT = process.env.PORT || 3000;
const TZ = process.env.BUSINESS_TZ || 'Asia/Karachi';
let JWT_SECRET;

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s + 'T12:00:00Z'));
const validMonth = s => /^\d{4}-\d{2}$/.test(s || '');
const cleanPhone = p => String(p || '').replace(/[^\d+]/g, '').slice(0, 20);
const wrapA = fn => (req, res, next) => fn(req, res, next).catch(next);
function today() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const monthEnd = m => { const [y, mo] = m.split('-').map(Number); return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`; };
const addMonths = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const hits = new Map();
function limited(key, max, ms) { const now = Date.now(), a = (hits.get(key) || []).filter(t => now - t < ms); a.push(now); hits.set(key, a); return a.length > max; }
function parseSlots(s) {
  return String(s.slots || '').split('\n').map(l => l.split('|').map(x => x.trim())).filter(p => p[0])
    .map(([name, start = '', end = '']) => ({ name, start, end }));
}
const listSetting = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
async function makeRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const r = 'GM-' + Array.from(crypto.randomBytes(5)).map(b => chars[b % chars.length]).join('');
    if (!(await db.get('SELECT 1 x FROM bookings WHERE ref = ?', r))) return r;
  }
}
// price for a booking: package × guests, or the hall's own charge if no package
async function priceFor(hall, pkgId, guests) {
  const pkg = pkgId ? await getRow('packages', pkgId) : null;
  return { pkg, per_head: pkg ? num(pkg.per_head) : 0, base_total: pkg ? num(pkg.per_head) * num(guests) : num(hall?.hire_charge) };
}
// add-ons chosen for a booking → [{id, name, price, price_type, amount}] and their total.
// Blank price = "price on request" (amount 0 until the owner sets a price on the booking).
async function addonsFor(ids, guests) {
  const want = (Array.isArray(ids) ? ids : []).map(Number).filter(Boolean);
  if (!want.length) return { addons: [], addons_total: 0 };
  const rows = (await listRows('addons')).filter(a => want.includes(a.id));
  const addons = rows.map(a => ({ id: a.id, name: a.name, price: a.price, price_type: a.price_type,
    amount: a.price == null ? 0 : a.price_type === 'per head' ? a.price * num(guests) : a.price }));
  return { addons, addons_total: addons.reduce((t, a) => t + a.amount, 0) };
}
const parseAddons = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };
// booking menu: [{name, course, price, price_type}] — price is the extra charge on top of the package (0 = included)
function cleanMenu(list, guests) {
  const menu = (Array.isArray(list) ? list : []).slice(0, 60).map(d => ({
    name: str(d?.name, 80), course: str(d?.course, 40), price: Math.max(0, num(d?.price)),
    price_type: d?.price_type === 'per event' ? 'per event' : 'per head' })).filter(d => d.name);
  menu.forEach(d => (d.amount = d.price_type === 'per head' ? d.price * num(guests) : d.price));
  return { menu, menu_total: menu.reduce((t, d) => t + d.amount, 0) };
}
// a package's own dishes become the starting menu (all included in the per-head price)
const pkgMenu = pkg => (pkg?.items || []).map(name => ({ name, course: '', price: 0, price_type: 'per head' }));

// is this hall/date/slot already confirmed for someone else?
async function clash(ex, date, hallId, slot, ignoreId = 0) {
  return ex.get(`SELECT id, ref, customer_name FROM bookings WHERE date = ? AND hall_id = ? AND slot = ? AND status IN ('confirmed','completed') AND id != ?`, date, hallId, slot, ignoreId);
}

// ---------- uploads: stored in the database, resized to keep it small ----------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, f, cb) => cb(null, /^image\/(jpeg|png|webp|gif|avif|heic|heif)$/.test(f.mimetype)) });
async function storeImage(file, maxW = 1800) {
  const buf = await sharp(file.buffer).rotate().resize({ width: maxW, height: maxW, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  const name = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}.webp`;
  await db.run('INSERT INTO files (name, mime, data) VALUES (?, ?, ?)', name, 'image/webp', buf);
  return '/uploads/' + name;
}
app.get('/uploads/:name', wrapA(async (req, res) => {
  const f = await db.get('SELECT mime, data FROM files WHERE name = ?', path.basename(req.params.name));
  if (!f) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type(f.mime).send(Buffer.from(f.data));
}));
app.get('/health', (req, res) => res.json({ ok: true }));

// ---------- public API ----------
app.get('/api/site', wrapA(async (req, res) => {
  const s = await getSettings(), t = today();
  res.json({
    settings: s, today: t, slots: parseSlots(s), event_types: listSetting(s.event_types),
    halls: await listRows('halls', 'WHERE active = 1'),
    packages: await listRows('packages', 'WHERE active = 1'),
    addons: await listRows('addons', 'WHERE active = 1'),
    offers: await listRows('offers', `WHERE active = 1 AND (valid_until = '' OR valid_until IS NULL OR valid_until >= ?)`, t),
    reviews: await listRows('reviews', 'WHERE active = 1'),
    gallery: await db.all('SELECT id, image, caption FROM gallery ORDER BY id DESC'),
  });
}));

// availability for a month: per date → per hall → per slot: free | requested | booked | closed
app.get('/api/availability', wrapA(async (req, res) => {
  const month = validMonth(req.query.month) ? req.query.month : today().slice(0, 7);
  const s = await getSettings(), t = today(), maxD = addDays(t, num(s.booking_days_ahead) || 365);
  const slots = parseSlots(s), halls = await listRows('halls', 'WHERE active = 1');
  const closed = listSetting(s.closed_dates);
  const rows = await db.all(`SELECT date, hall_id, slot, status FROM bookings WHERE date BETWEEN ? AND ? AND status IN ('pending','confirmed','completed')`, month + '-01', monthEnd(month));
  const mark = {};
  rows.forEach(r => { const k = `${r.date}|${r.hall_id}|${r.slot}`; mark[k] = r.status === 'pending' ? (mark[k] || 'requested') : 'booked'; });
  const days = {};
  for (let d = month + '-01'; d <= monthEnd(month); d = addDays(d, 1)) {
    const off = d < t || d > maxD || closed.includes(d);
    days[d] = {};
    halls.forEach(h => { days[d][h.id] = {}; slots.forEach(sl => (days[d][h.id][sl.name] = off ? 'closed' : (mark[`${d}|${h.id}|${sl.name}`] || 'free'))); });
  }
  res.json({ month, days });
}));

app.post('/api/bookings', wrapA(async (req, res) => {
  if (limited('book:' + req.ip, 6, 3600e3)) return res.status(429).json({ error: 'Too many requests from this device. Please call us.' });
  const s = await getSettings();
  if (s.booking_enabled !== '1') return res.status(403).json({ error: 'Online requests are paused. Please call us.' });
  const b = req.body || {}, t = today();
  const name = str(b.customer_name, 100), phone = cleanPhone(b.phone);
  if (!name || phone.replace(/\D/g, '').length < 10) return res.status(400).json({ error: 'Please enter your name and a valid phone number.' });
  if (!validDate(b.date) || b.date < t || b.date > addDays(t, num(s.booking_days_ahead) || 365) || listSetting(s.closed_dates).includes(b.date)) return res.status(400).json({ error: 'Please choose an available date.' });
  if (!parseSlots(s).some(x => x.name === b.slot)) return res.status(400).json({ error: 'Please choose lunch or dinner.' });
  const hall = await db.get('SELECT * FROM halls WHERE id = ? AND active = 1', b.hall_id);
  if (!hall) return res.status(400).json({ error: 'Please choose a hall.' });
  const guests = Math.round(num(b.guests));
  if (guests < 1) return res.status(400).json({ error: 'Please enter the number of guests.' });
  if (hall.capacity && guests > hall.capacity) return res.status(400).json({ error: `${hall.name} holds up to ${hall.capacity} guests.` });
  if (await clash(db, b.date, hall.id, b.slot)) return res.status(409).json({ error: 'Sorry, that hall is already booked for this date and time. Please pick another.' });
  const { pkg, per_head, base_total } = await priceFor(hall, b.package_id, guests);
  const ad = await addonsFor((await listRows('addons', 'WHERE active = 1')).filter(a => (b.addon_ids || []).map(Number).includes(a.id)).map(a => a.id), guests);
  const mn = cleanMenu(pkgMenu(pkg), guests);
  const total = base_total + mn.menu_total + ad.addons_total;
  const ref = await makeRef();
  const ins = await db.run(`INSERT INTO bookings (ref, customer_name, phone, email, event_type, date, slot, hall_id, hall_name, guests, package_id, package_name, per_head, base_total, menu, menu_total, addons, addons_total, total, notes, status, source, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending', 'website', 'Customer (website)')`,
    ref, name, phone, str(b.email, 120), str(b.event_type, 60), b.date, b.slot, hall.id, hall.name, guests, pkg?.id || null, pkg?.name || '', per_head, base_total, JSON.stringify(mn.menu), mn.menu_total, JSON.stringify(ad.addons), ad.addons_total, total, str(b.notes, 1000));
  await db.run(`INSERT INTO activity (admin_id, admin_name, action, entity, entity_id, summary) VALUES (NULL, 'Customer (website)', 'requested', 'booking', ?, ?)`,
    ins.id, `Booking request ${ref} · ${name} · ${b.date} ${b.slot} · ${hall.name}`);
  res.json({ ok: true, booking: { ref, date: b.date, slot: b.slot, hall: hall.name, guests, package: pkg?.name || 'Hall only', addons: ad.addons.map(a => a.name), total, advance: Math.round(total * num(s.advance_percent) / 100) } });
}));

app.post('/api/bookings/lookup', wrapA(async (req, res) => {
  if (limited('look:' + req.ip, 20, 900e3)) return res.status(429).json({ error: 'Too many attempts. Try later.' });
  const b = await db.get('SELECT * FROM bookings WHERE ref = ?', str(req.body?.ref, 20).toUpperCase());
  const last10 = p => String(p || '').replace(/\D/g, '').slice(-10);
  if (!b || last10(b.phone) !== last10(req.body?.phone)) return res.status(404).json({ error: 'No booking found with that reference and phone number.' });
  const paid = (await db.get(`SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE booking_id = ? AND type = 'income'`, b.id)).s;
  res.json({ booking: { ref: b.ref, date: b.date, slot: b.slot, hall: b.hall_name, guests: b.guests, package: b.package_name || 'Hall only', menu: parseAddons(b.menu).map(a => a.name), addons: parseAddons(b.addons).map(a => a.name), event_type: b.event_type, status: b.status, total: b.total, paid, balance: b.total - paid } });
}));

// ---------- receipts ----------
// A signed link lets a customer open their own receipt without logging in (sent by WhatsApp / email)
const sign = (kind, id) => crypto.createHmac('sha256', JWT_SECRET).update(`${kind}:${id}`).digest('hex').slice(0, 20);
const venueInfo = s => ({ name: s.business_name, tagline: s.tagline, address: s.address, phone: s.phone, phone2: s.phone2, email: s.email, whatsapp: s.whatsapp,
  logo: s.logo, currency: s.currency || 'Rs', primary: s.primary_color, accent: s.accent_color,
  terms: String(s.receipt_terms || '').split('\n').map(x => x.trim()).filter(Boolean), manager_label: s.receipt_manager_label || 'Manager / Authorised signature' });
const rcptNo = id => 'R-' + String(id).padStart(6, '0');
async function bookingReceipt(id, internal) {
  const b = await db.get(`SELECT b.*, COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.booking_id = b.id AND t.type = 'income'),0) paid FROM bookings b WHERE b.id = ?`, id);
  if (!b) return null;
  const s = await getSettings();
  const slot = parseSlots(s).find(x => x.name === b.slot);
  const payments = (await db.all(`SELECT id, date, amount, method, recorded_by, purpose FROM transactions WHERE booking_id = ? AND type = 'income' ORDER BY date, id`, b.id)).map(p => ({ ...p, no: rcptNo(p.id) }));
  b.addons = parseAddons(b.addons); b.menu = parseAddons(b.menu);
  const out = { kind: 'booking', venue: venueInfo(s), booking: { ...b, slot_time: slot ? `${slot.start}–${slot.end}` : '' }, payments,
    advance_percent: num(s.advance_percent), share: `/r/b/${b.id}/${sign('b', b.id)}` };
  if (!internal) { delete out.booking.admin_notes; delete out.booking.phone_raw; }
  return out;
}
async function txReceipt(id) {
  const t = await db.get(`SELECT t.*, e.name employee_name, e.role employee_role, e.cnic employee_cnic, p.month salary_month, p.base, p.bonus, p.deduction
    FROM transactions t LEFT JOIN employees e ON e.id = t.employee_id LEFT JOIN salary_payments p ON p.id = t.salary_payment_id WHERE t.id = ?`, id);
  if (!t) return null;
  const s = await getSettings();
  const out = { kind: 'payment', venue: venueInfo(s), tx: { ...t, no: rcptNo(t.id) }, share: `/r/p/${t.id}/${sign('p', t.id)}` };
  if (t.booking_id) {
    const b = await db.get('SELECT * FROM bookings WHERE id = ?', t.booking_id);
    const before = (await db.get(`SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE booking_id = ? AND type = 'income' AND (date < ? OR (date = ? AND id < ?))`, b.id, t.date, t.date, t.id)).s;
    const after = before + t.amount;
    out.booking = { ref: b.ref, customer_name: b.customer_name, phone: b.phone, event_type: b.event_type, date: b.date, slot: b.slot, hall_name: b.hall_name, guests: b.guests, package_name: b.package_name, addons: parseAddons(b.addons).map(a => a.name), total: b.total, status: b.status };
    out.paid_before = before; out.paid_after = after; out.balance_after = b.total - after;
    const auto = after >= b.total ? (before === 0 ? 'Full payment' : 'Final payment') : (before === 0 ? 'Advance payment' : 'Part payment');
    const map = { 'Advance': 'Advance payment', 'Remaining balance': 'Remaining balance payment', 'Full payment': 'Full payment', 'Part payment': 'Part payment', 'Special arrangement': 'Special arrangement payment', 'Other': 'Payment' };
    out.label = t.purpose ? (map[t.purpose] || `${t.purpose} payment`) : auto;
  } else if (t.salary_payment_id) out.label = 'Salary payment';
  else out.label = t.type === 'income' ? 'Payment received' : 'Payment made';
  return out;
}
app.get(['/r/b/:id/:sig', '/r/p/:id/:sig'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'receipt.html')));
app.get('/api/receipt/:kind/:id/:sig', wrapA(async (req, res) => {
  const { kind, id, sig } = req.params;
  if (!['b', 'p'].includes(kind) || sig !== sign(kind, id)) return res.status(404).json({ error: 'Receipt not found' });
  const r = kind === 'b' ? await bookingReceipt(id, false) : await txReceipt(id);
  if (!r) return res.status(404).json({ error: 'Receipt not found' });
  if (kind === 'p' && !r.booking) return res.status(404).json({ error: 'Receipt not found' }); // only customer payments are shareable
  res.json(r);
}));

// ---------- audit: nightly day closing ----------
// Each finished day is "closed": its entries are counted, totalled and fingerprinted.
// If anything from a closed day is later added, changed or deleted, the fingerprint no longer matches and reports flag it.
async function dayState(date) {
  const rows = await db.all(`SELECT id, date, type, category, amount, method, description, booking_id, employee_id, salary_payment_id, recorded_by FROM transactions WHERE date = ? ORDER BY id`, date);
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const income = rows.filter(r => r.type === 'income').reduce((a, r) => a + r.amount, 0), expense = rows.filter(r => r.type === 'expense').reduce((a, r) => a + r.amount, 0);
  return { tx_count: rows.length, income, expense, fingerprint };
}
async function closeDay(date, by) {
  if (await db.get('SELECT 1 x FROM day_closings WHERE date = ?', date)) return false;
  const st = await dayState(date);
  await db.run('INSERT INTO day_closings (date, tx_count, income, expense, fingerprint, closed_by) VALUES (?,?,?,?,?,?)', date, st.tx_count, st.income, st.expense, st.fingerprint, by);
  return true;
}
async function autoClose() {
  try {
    const t = today();
    const last = (await db.get('SELECT MAX(date) d FROM day_closings')).d;
    const first = (await db.get('SELECT MIN(date) d FROM transactions')).d;
    let d = last ? addDays(last, 1) : (first || t);
    for (let i = 0; d < t && i < 800; i++, d = addDays(d, 1)) await closeDay(d, 'Automatic (midnight)');
  } catch (e) { console.error('auto close failed', e.message); }
}
const isClosed = async date => !!(await db.get('SELECT 1 x FROM day_closings WHERE date = ?', date));
async function closedGuard(req, res, dates) {
  for (const d of dates.filter(Boolean)) {
    if (await isClosed(d)) {
      if (req.admin.role !== 'owner') { res.status(403).json({ error: `${d} has been closed for audit. Only the owner can add or change entries on a closed day.` }); return false; }
      req.closedNote = ` [closed day ${d} — changed by owner]`;
    }
  }
  return true;
}

// ---------- admin auth: several admins, one owner, per-admin permissions ----------
const ALL_PERMS = PERMISSIONS.map(p => p.key);
const parsePerms = v => { try { return JSON.parse(v || '[]').filter(p => ALL_PERMS.includes(p)); } catch { return []; } };
const publicAdmin = a => ({ id: a.id, username: a.username, name: a.name || a.username, role: a.role, active: !!a.active,
  permissions: a.role === 'owner' ? ALL_PERMS : parsePerms(a.permissions), last_login: a.last_login, created_at: a.created_at });

// Re-read the admin on every request so a removed or restricted admin loses access immediately
async function requireAdmin(req, res, next) {
  try {
    const tok = jwt.verify(req.cookies.gm_admin || '', JWT_SECRET);
    const a = await db.get('SELECT * FROM admins WHERE id = ?', tok.id);
    if (!a || !a.active) return res.status(401).json({ error: 'Not logged in' });
    req.admin = publicAdmin(a);
    next();
  } catch { res.status(401).json({ error: 'Not logged in' }); }
}
const can = (...perms) => (req, res, next) => (req.admin.role === 'owner' || perms.some(p => req.admin.permissions.includes(p)))
  ? next() : res.status(403).json({ error: "You don't have permission for this. Ask the owner." });
const ownerOnly = (req, res, next) => (req.admin.role === 'owner' ? next() : res.status(403).json({ error: 'Only the owner can do this.' }));
const has = (req, p) => req.admin.role === 'owner' || req.admin.permissions.includes(p);

// Every change is signed with who made it
async function log(req, action, entity, entityId, summary, ex = db) {
  await ex.run('INSERT INTO activity (admin_id, admin_name, action, entity, entity_id, summary) VALUES (?,?,?,?,?,?)',
    req.admin.id, req.admin.name, action, entity, entityId ?? null, String(summary).slice(0, 400));
}

const cookieOpts = req => ({ httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 7 * 864e5 });
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.post('/api/admin/login', wrapA(async (req, res) => {
  if (limited('login:' + req.ip, 10, 900e3)) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes.' });
  const u = await db.get('SELECT * FROM admins WHERE username = ? COLLATE NOCASE', str(req.body?.username, 60));
  if (!u || !bcrypt.compareSync(String(req.body?.password || ''), u.password_hash)) return res.status(401).json({ error: 'Wrong username or password' });
  if (!u.active) return res.status(403).json({ error: 'This account has been switched off. Ask the owner.' });
  await db.run('UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?', u.id);
  res.cookie('gm_admin', jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '7d' }), cookieOpts(req)).json({ ok: true });
}));
app.post('/api/admin/logout', (req, res) => res.clearCookie('gm_admin').json({ ok: true }));
app.use('/api/admin', wrapA(requireAdmin));
app.get('/api/admin/me', (req, res) => res.json(req.admin));
app.post('/api/admin/account', wrapA(async (req, res) => {
  const { current_password, new_username, new_password, name } = req.body || {};
  const u = await db.get('SELECT * FROM admins WHERE id = ?', req.admin.id);
  if (!bcrypt.compareSync(String(current_password || ''), u.password_hash)) return res.status(400).json({ error: 'Current password is wrong' });
  if (new_password && String(new_password).length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  const username = str(new_username, 60) || u.username;
  if (username !== u.username && await db.get('SELECT 1 x FROM admins WHERE username = ? COLLATE NOCASE AND id != ?', username, u.id)) return res.status(400).json({ error: 'That username is taken' });
  await db.run('UPDATE admins SET username = ?, name = ?, password_hash = ? WHERE id = ?', username, str(name, 60) || u.name, new_password ? bcrypt.hashSync(String(new_password), 10) : u.password_hash, u.id);
  await log(req, 'updated', 'account', u.id, 'Changed own login details');
  res.json({ ok: true });
}));

// ---------- owner: manage admins ----------
app.get('/api/admin/admins', ownerOnly, wrapA(async (req, res) => {
  const list = await db.all(`SELECT a.*, (SELECT COUNT(*) FROM activity x WHERE x.admin_id = a.id) actions FROM admins a ORDER BY role = 'owner' DESC, name`);
  res.json(list.map(a => ({ ...publicAdmin(a), actions: a.actions })));
}));
app.post('/api/admin/admins', ownerOnly, wrapA(async (req, res) => {
  const b = req.body || {}, username = str(b.username, 60), name = str(b.name, 60);
  if (!name || !username) return res.status(400).json({ error: 'Name and username are required' });
  if (String(b.password || '').length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (await db.get('SELECT 1 x FROM admins WHERE username = ? COLLATE NOCASE', username)) return res.status(400).json({ error: 'That username is taken' });
  const perms = (Array.isArray(b.permissions) ? b.permissions : []).filter(p => ALL_PERMS.includes(p));
  const r = await db.run(`INSERT INTO admins (username, password_hash, name, role, permissions, active, created_at) VALUES (?, ?, ?, 'admin', ?, 1, CURRENT_TIMESTAMP)`,
    username, bcrypt.hashSync(String(b.password), 10), name, JSON.stringify(perms));
  await log(req, 'created', 'admin', r.id, `Added admin ${name} (@${username}) with: ${perms.join(', ') || 'no permissions'}`);
  res.json({ ok: true, id: r.id });
}));
app.put('/api/admin/admins/:id', ownerOnly, wrapA(async (req, res) => {
  const a = await db.get('SELECT * FROM admins WHERE id = ?', req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const name = str(b.name, 60) || a.name, username = str(b.username, 60) || a.username;
  if (username !== a.username && await db.get('SELECT 1 x FROM admins WHERE username = ? COLLATE NOCASE AND id != ?', username, a.id)) return res.status(400).json({ error: 'That username is taken' });
  const isOwner = a.role === 'owner';
  const perms = isOwner ? [] : (Array.isArray(b.permissions) ? b.permissions : parsePerms(a.permissions)).filter(p => ALL_PERMS.includes(p));
  const active = isOwner ? 1 : (b.active === false || b.active === 0 ? 0 : 1);
  if (b.password && String(b.password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  await db.run('UPDATE admins SET name = ?, username = ?, permissions = ?, active = ?, password_hash = ? WHERE id = ?',
    name, username, JSON.stringify(perms), active, b.password ? bcrypt.hashSync(String(b.password), 10) : a.password_hash, a.id);
  const changes = [];
  if (!isOwner && JSON.stringify(perms) !== JSON.stringify(parsePerms(a.permissions))) changes.push(`permissions → ${perms.join(', ') || 'none'}`);
  if (!!active !== !!a.active) changes.push(active ? 'switched on' : 'switched off');
  if (b.password) changes.push('password reset');
  if (name !== a.name || username !== a.username) changes.push(`name/login → ${name} (@${username})`);
  if (changes.length) await log(req, 'updated', 'admin', a.id, `${a.name}: ${changes.join('; ')}`);
  res.json({ ok: true });
}));
app.post('/api/admin/admins/:id/make-owner', ownerOnly, wrapA(async (req, res) => {
  const a = await db.get('SELECT * FROM admins WHERE id = ? AND active = 1', req.params.id);
  if (!a || a.id === req.admin.id) return res.status(400).json({ error: 'Choose another active admin' });
  if (!bcrypt.compareSync(String(req.body?.password || ''), (await db.get('SELECT password_hash FROM admins WHERE id = ?', req.admin.id)).password_hash)) return res.status(400).json({ error: 'Your password is wrong' });
  await db.tx(async tx => {
    await tx.run(`UPDATE admins SET role = 'admin', permissions = ? WHERE id = ?`, JSON.stringify(ALL_PERMS), req.admin.id);
    await tx.run(`UPDATE admins SET role = 'owner' WHERE id = ?`, a.id);
    await log(req, 'updated', 'admin', a.id, `Handed ownership to ${a.name}`, tx);
  });
  res.json({ ok: true });
}));

// ---------- activity ----------
app.get('/api/admin/activity', wrapA(async (req, res) => {
  const q = req.query, w = [], a = [];
  let adminId = q.admin_id === 'all' ? null : Number(q.admin_id) || req.admin.id;
  if (req.admin.role !== 'owner') adminId = req.admin.id;      // admins only see their own
  if (adminId) { w.push('admin_id = ?'); a.push(adminId); }
  if (q.entity) { w.push('entity = ?'); a.push(String(q.entity)); }
  const limit = Math.min(500, Number(q.limit) || 200);
  res.json(await db.all(`SELECT * FROM activity ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC LIMIT ${limit}`, ...a));
}));

// Cheap "has anything changed?" check, polled by the admin panel every few seconds
app.get('/api/admin/pulse', wrapA(async (req, res) => {
  const last = (await db.get('SELECT COALESCE(MAX(id),0) m FROM activity')).m;
  const out = { last };
  if (has(req, 'bookings')) {
    out.pending = (await db.get(`SELECT COUNT(*) c FROM bookings WHERE status = 'pending' AND date >= ?`, today())).c;
    out.latest_request = await db.get(`SELECT id, entity_id, summary FROM activity WHERE action = 'requested' ORDER BY id DESC LIMIT 1`) || null;
  }
  res.json(out);
}));

app.get('/api/admin/schema', wrapA(async (req, res) => {
  const s = await getSettings();
  res.json({ settings: SETTINGS, tables: TABLES, permissions: PERMISSIONS, purposes: PAYMENT_PURPOSES, income: INCOME_CATEGORIES, expense: EXPENSE_CATEGORIES, methods: PAY_METHODS,
    slots: parseSlots(s), event_types: listSetting(s.event_types), currency: s.currency || 'Rs', today: today(), advance_percent: num(s.advance_percent), me: req.admin });
}));

// ---------- dashboard (shows only what this admin is allowed to see) ----------
app.get('/api/admin/stats', wrapA(async (req, res) => {
  const t = today(), m = t.slice(0, 7), out = { today: t };
  if (has(req, 'bookings')) {
    out.pending = (await db.get(`SELECT COUNT(*) c FROM bookings WHERE status = 'pending' AND date >= ?`, t)).c;
    out.upcoming = (await db.get(`SELECT COUNT(*) c FROM bookings WHERE status = 'confirmed' AND date >= ?`, t)).c;
    out.this_month_events = (await db.get(`SELECT COUNT(*) c FROM bookings WHERE status IN ('confirmed','completed') AND date BETWEEN ? AND ?`, m + '-01', monthEnd(m))).c;
    out.next_events = await db.all(`SELECT id, ref, date, slot, hall_name, customer_name, event_type, guests, status FROM bookings WHERE date >= ? AND status IN ('pending','confirmed') ORDER BY date, slot LIMIT 8`, t);
  }
  if (has(req, 'cashflow')) {
    const sum = async (type, from, to) => (await db.get(`SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE type = ? AND date BETWEEN ? AND ?`, type, from, to)).s;
    out.months = [];
    for (let i = 5; i >= 0; i--) { const mm = addMonths(m, -i); out.months.push({ month: mm, income: await sum('income', mm + '-01', monthEnd(mm)), expense: await sum('expense', mm + '-01', monthEnd(mm)) }); }
    out.income_month = out.months.at(-1).income; out.expense_month = out.months.at(-1).expense;
  }
  if (has(req, 'cashflow') || has(req, 'payments')) {
    out.outstanding = (await db.get(`SELECT COALESCE(SUM(b.total - COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.booking_id = b.id AND t.type='income'),0)),0) s FROM bookings b WHERE b.status IN ('confirmed','completed')`)).s;
  }
  if (has(req, 'payroll') || has(req, 'employees')) out.staff = await db.get(`SELECT COUNT(*) c, COALESCE(SUM(salary),0) s FROM employees WHERE status = 'active'`);
  out.recent = await db.all(`SELECT * FROM activity ${req.admin.role === 'owner' ? '' : 'WHERE admin_id = ' + Number(req.admin.id)} ORDER BY id DESC LIMIT 8`);
  res.json(out);
}));

// ---------- bookings ----------
const PAID_SQL = `COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.booking_id = b.id AND t.type = 'income'),0)`;
app.get('/api/admin/bookings', can('bookings'), wrapA(async (req, res) => {
  const q = req.query, w = [], a = [];
  if (validDate(q.from)) { w.push('b.date >= ?'); a.push(q.from); }
  if (validDate(q.to)) { w.push('b.date <= ?'); a.push(q.to); }
  if (q.status && q.status !== 'all') { w.push('b.status = ?'); a.push(q.status); }
  if (q.hall_id) { w.push('b.hall_id = ?'); a.push(q.hall_id); }
  if (q.q) { w.push('(b.customer_name LIKE ? OR b.phone LIKE ? OR b.ref LIKE ? OR b.event_type LIKE ? OR b.created_by LIKE ? OR b.status_by LIKE ?)'); const l = `%${q.q}%`; a.push(l, l, l, l, l, l); }
  const order = q.order === 'desc' ? 'b.date DESC, b.slot' : 'b.date, b.slot';
  res.json(await db.all(`SELECT b.*, ${PAID_SQL} paid FROM bookings b ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY ${order} LIMIT 1000`, ...a));
}));
app.get('/api/admin/bookings/:id', can('bookings'), wrapA(async (req, res) => {
  const b = await db.get(`SELECT b.*, ${PAID_SQL} paid FROM bookings b WHERE id = ?`, req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  res.json({ booking: b,
    payments: await db.all(`SELECT * FROM transactions WHERE booking_id = ? ORDER BY date, id`, b.id),
    history: await db.all(`SELECT admin_name, action, summary, created_at FROM activity WHERE (entity = 'booking' AND entity_id = ?) OR (entity = 'payment' AND entity_id = ?) ORDER BY id`, b.id, b.id) });
}));

async function bookingFromBody(b, existing = {}) {
  const hall = await db.get('SELECT * FROM halls WHERE id = ?', b.hall_id ?? existing.hall_id);
  if (!hall) throw new Error('Choose a hall');
  const date = b.date ?? existing.date, slot = b.slot ?? existing.slot;
  if (!validDate(date)) throw new Error('Choose a date');
  if (!slot) throw new Error('Choose a time slot');
  const guests = Math.round(num(b.guests ?? existing.guests));
  const pkgId = b.package_id === undefined ? existing.package_id : (b.package_id || null);
  const { pkg, per_head, base_total } = await priceFor(hall, pkgId, guests);
  const extras = num(b.extras ?? existing.extras), discount = num(b.discount ?? existing.discount);
  // add-ons: keep the booking's own prices unless the list of add-ons or guests changed
  let addons = parseAddons(existing.addons), addons_total = num(existing.addons_total);
  const ids = Array.isArray(b.addon_ids) ? b.addon_ids.map(Number) : addons.map(a => a.id);
  if (Array.isArray(b.addon_ids) || guests !== Math.round(num(existing.guests))) {
    const fresh = await addonsFor(ids, guests);
    addons = fresh.addons.map(a => { const old = parseAddons(existing.addons).find(o => o.id === a.id); return old && old.price_type !== 'per head' && a.price == null ? old : a; });
    addons_total = addons.reduce((t, a) => t + num(a.amount), 0);
  }
  // menu: sent by the form, else kept; a new package with no menu sent starts from that package's dishes
  let menuList = parseAddons(existing.menu);
  if (Array.isArray(b.menu)) menuList = b.menu;
  else if ((pkg?.id || null) !== (existing.package_id || null) || !existing.id) menuList = pkgMenu(pkg);
  if (!pkg) menuList = [];
  const { menu, menu_total } = cleanMenu(menuList, guests);
  const total = b.total !== undefined && b.total !== '' && b.total !== null ? num(b.total) : base_total + menu_total + addons_total + extras - discount;
  return {
    customer_name: str(b.customer_name ?? existing.customer_name, 100), phone: cleanPhone(b.phone ?? existing.phone), email: str(b.email ?? existing.email, 120),
    event_type: str(b.event_type ?? existing.event_type, 60), date, slot, hall_id: hall.id, hall_name: hall.name, guests,
    package_id: pkg?.id || null, package_name: pkg?.name || '', per_head, base_total, menu: JSON.stringify(menu), menu_total, addons: JSON.stringify(addons), addons_total, extras, discount, total,
    notes: str(b.notes ?? existing.notes, 1000), admin_notes: str(b.admin_notes ?? existing.admin_notes, 2000),
    status: ['pending', 'confirmed', 'completed', 'cancelled'].includes(b.status) ? b.status : (existing.status || 'confirmed'),
  };
}
const bLabel = d => `${d.ref ? d.ref + ' · ' : ''}${d.customer_name} · ${d.event_type || 'event'} ${d.date} ${d.slot} · ${d.hall_name}`;
app.post('/api/admin/bookings', can('bookings'), wrapA(async (req, res) => {
  try {
    const d = await bookingFromBody(req.body || {});
    if (!d.customer_name) return res.status(400).json({ error: 'Customer name is required' });
    if (['confirmed', 'completed'].includes(d.status) && !has(req, 'confirm')) d.status = 'pending';
    if (d.status === 'cancelled' && !has(req, 'cancel')) d.status = 'pending';
    const id = await db.tx(async tx => {
      if (['confirmed', 'completed'].includes(d.status)) { const c = await clash(tx, d.date, d.hall_id, d.slot); if (c) throw new Error(`Already booked by ${c.customer_name} (${c.ref})`); }
      const ref = await makeRef(), keys = Object.keys(d);
      const nid = (await tx.run(`INSERT INTO bookings (ref, source, created_by, status_by, ${keys.join(',')}) VALUES (?, 'admin', ?, ?, ${keys.map(() => '?').join(',')})`, ref, req.admin.name, req.admin.name, ...keys.map(k => d[k]))).id;
      await log(req, 'created', 'booking', nid, `Booked ${bLabel({ ...d, ref })} (${d.status})`, tx);
      return nid;
    });
    res.json({ ok: true, id });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.patch('/api/admin/bookings/:id', can('bookings'), wrapA(async (req, res) => {
  const ex = await db.get('SELECT * FROM bookings WHERE id = ?', req.params.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  try {
    const d = await bookingFromBody(req.body || {}, ex);
    if (d.status !== ex.status) {
      const need = d.status === 'cancelled' ? 'cancel' : 'confirm';   // confirming, completing or re-opening
      if (ex.status === 'cancelled' && !has(req, 'cancel') && !has(req, 'confirm')) return res.status(403).json({ error: "You don't have permission to re-open cancelled bookings. Ask the owner." });
      if (!has(req, need)) return res.status(403).json({ error: need === 'cancel' ? "You don't have permission to cancel bookings. Ask the owner." : "You don't have permission to confirm bookings. Ask the owner." });
    }
    await db.tx(async tx => {
      if (['confirmed', 'completed'].includes(d.status)) { const c = await clash(tx, d.date, d.hall_id, d.slot, ex.id); if (c) throw new Error(`That slot is already booked by ${c.customer_name} (${c.ref})`); }
      const statusChanged = d.status !== ex.status;
      const keys = Object.keys(d).filter(k => !k.startsWith('__'));
      await tx.run(`UPDATE bookings SET ${keys.map(k => `${k} = ?`).join(', ')}${statusChanged ? ', status_by = ?' : ''} WHERE id = ?`, ...keys.map(k => d[k]), ...(statusChanged ? [req.admin.name] : []), ex.id);
      // describe exactly what changed
      const labels = { date: 'date', slot: 'time', hall_name: 'hall', guests: 'guests', package_name: 'package', total: 'total', customer_name: 'name', phone: 'phone', event_type: 'event', extras: 'extras', discount: 'discount' };
      const an = v => parseAddons(v).map(a => a.name).join(', ') || 'none';
      if (an(ex.addons) !== an(d.addons)) labels.__addons = 'add-ons';
      ex.__addons = an(ex.addons); d.__addons = an(d.addons);
      const diffs = Object.entries(labels).filter(([k]) => String(d[k] ?? '') !== String(ex[k] ?? '')).map(([k, l]) => `${l} ${ex[k] || '—'} → ${d[k] || '—'}`);
      if (statusChanged) {
        const verb = { confirmed: 'confirmed', cancelled: 'cancelled', completed: 'completed', pending: 'set back to pending' }[d.status];
        await log(req, d.status, 'booking', ex.id, `${verb[0].toUpperCase() + verb.slice(1)} ${bLabel({ ...ex, ...d })}`, tx);
      }
      const pr = x => (x.price ? `+${x.price}${x.price_type === 'per head' ? '/head' : ''}` : 'included');
      const om = parseAddons(ex.menu), nm = parseAddons(d.menu), key = x => x.name.toLowerCase();
      const rem = om.filter(x => !nm.some(y => key(y) === key(x))).map(x => x.name);
      const add = nm.filter(x => !om.some(y => key(y) === key(x))).map(x => `${x.name}${x.price ? ` (${pr(x)})` : ''}`);
      const chg = nm.filter(x => om.some(y => key(y) === key(x) && pr(y) !== pr(x))).map(x => `${x.name} ${pr(om.find(y => key(y) === key(x)))} → ${pr(x)}`);
      if (d.package_name === ex.package_name && (rem.length || add.length || chg.length))
        diffs.push(!om.length ? `menu set (${nm.length} dishes)` : `menu ${[rem.length ? 'removed ' + rem.join(', ') : '', add.length ? 'added ' + add.join(', ') : '', chg.length ? 'price ' + chg.join(', ') : ''].filter(Boolean).join('; ')}`);
      if (diffs.length) await log(req, 'edited', 'booking', ex.id, `Edited ${ex.ref}: ${diffs.join('; ')}`, tx);
      else if (!statusChanged && (d.notes !== ex.notes || d.admin_notes !== ex.admin_notes)) await log(req, 'edited', 'booking', ex.id, `Edited notes on ${ex.ref}`, tx);
    });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.delete('/api/admin/bookings/:id', can('bookings'), can('delete'), wrapA(async (req, res) => {
  const b = await db.get('SELECT * FROM bookings WHERE id = ?', req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  if ((await db.get('SELECT COUNT(*) c FROM transactions WHERE booking_id = ?', b.id)).c) return res.status(400).json({ error: 'This booking has payments recorded. Cancel it instead, or delete its payments first.' });
  await db.run('DELETE FROM bookings WHERE id = ?', b.id);
  await log(req, 'deleted', 'booking', b.id, `Deleted booking ${bLabel(b)}`);
  res.json({ ok: true });
}));
app.post('/api/admin/bookings/:id/payments', can('payments'), wrapA(async (req, res) => {
  const b = await db.get('SELECT * FROM bookings WHERE id = ?', req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  const amount = num(req.body?.amount);
  if (amount <= 0) return res.status(400).json({ error: 'Enter an amount' });
  const date = validDate(req.body?.date) ? req.body.date : today(), method = PAY_METHODS.includes(req.body?.method) ? req.body.method : 'Cash';
  const allowedFor = [...PAYMENT_PURPOSES, 'Menu changes', ...parseAddons(b.addons).map(a => a.name)];
  const purpose = allowedFor.includes(req.body?.purpose) ? req.body.purpose : '';
  if (!(await closedGuard(req, res, [date]))) return;
  const note = str(req.body?.note, 200);
  const ins = await db.run(`INSERT INTO transactions (date, type, category, amount, method, description, booking_id, recorded_by, purpose) VALUES (?, 'income', 'Booking payment', ?, ?, ?, ?, ?, ?)`,
    date, amount, method, `${purpose ? purpose + ' · ' : ''}${b.ref} · ${b.customer_name} · ${b.event_type || 'event'} ${b.date}${note ? ' · ' + note : ''}`, b.id, req.admin.name, purpose);
  await log(req, 'payment', 'payment', b.id, `Received ${amount.toLocaleString('en-PK')} (${method})${purpose ? ' — ' + purpose : ''} for ${b.ref} · ${b.customer_name} · receipt ${rcptNo(ins.id)}${req.closedNote || ''}`);
  res.json({ ok: true, tx_id: ins.id });
}));

// ---------- generic tables ----------
const TABLE_PERM = { halls: 'website', packages: 'website', addons: 'website', dishes: 'website', offers: 'website', reviews: 'website', employees: 'employees' };
const checkT = (req, res, next) => (TABLES[req.params.t] ? next() : res.status(404).json({ error: 'Unknown section' }));
const canT = (req, res, next) => {
  const p = TABLE_PERM[req.params.t];
  // anyone who takes bookings needs to read halls and packages; payroll needs to read employees
  if (req.method === 'GET' && (p === 'website' ? has(req, 'bookings') : has(req, 'payroll'))) return next();
  return can(p)(req, res, next);
};
const rowName = (t, r) => r?.[TABLES[t].titleField] || `#${r?.id}`;
app.get('/api/admin/t/:t', checkT, canT, wrapA(async (req, res) => res.json(await listRows(req.params.t))));
app.post('/api/admin/t/:t', checkT, canT, wrapA(async (req, res) => {
  try { const id = await insertRow(req.params.t, req.body || {}); await log(req, 'created', req.params.t, id, `Added ${TABLES[req.params.t].singular} "${rowName(req.params.t, await getRow(req.params.t, id))}"`); res.json({ ok: true, id }); }
  catch (e) { res.status(400).json({ error: e.message }); }
}));
app.put('/api/admin/t/:t/:id', checkT, canT, wrapA(async (req, res) => {
  try {
    const before = await getRow(req.params.t, req.params.id);
    await updateRow(req.params.t, req.params.id, req.body || {});
    const after = await getRow(req.params.t, req.params.id);
    let extra = '';
    if (req.params.t === 'employees' && before && after) {
      const ch = [['salary', 'salary'], ['status', 'status'], ['role', 'role']].filter(([k]) => String(before[k] ?? '') !== String(after[k] ?? '')).map(([k, l]) => `${l} ${before[k] ?? '—'} → ${after[k] ?? '—'}`);
      if (ch.length) extra = ` (${ch.join('; ')})`;
    }
    if (req.params.t === 'packages' && before && after && before.per_head !== after.per_head) extra = ` (price ${before.per_head} → ${after.per_head} per head)`;
    await log(req, 'edited', req.params.t, Number(req.params.id), `Edited ${TABLES[req.params.t].singular} "${rowName(req.params.t, after)}"${extra}`);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.delete('/api/admin/t/:t/:id', checkT, canT, can('delete'), wrapA(async (req, res) => {
  if (req.params.t === 'halls' && (await db.get('SELECT COUNT(*) c FROM bookings WHERE hall_id = ?', req.params.id)).c) return res.status(400).json({ error: 'This hall has bookings. Untick "Show on website" to hide it instead.' });
  if (req.params.t === 'employees' && (await db.get('SELECT COUNT(*) c FROM salary_payments WHERE employee_id = ?', req.params.id)).c) return res.status(400).json({ error: 'This employee has salary records. Set their status to "left" instead.' });
  const r = await getRow(req.params.t, req.params.id);
  await db.run(`DELETE FROM ${req.params.t} WHERE id = ?`, req.params.id);
  await log(req, 'deleted', req.params.t, Number(req.params.id), `Deleted ${TABLES[req.params.t].singular} "${rowName(req.params.t, r)}"`);
  res.json({ ok: true });
}));
app.get('/api/admin/employees/:id/history', can('employees', 'payroll'), wrapA(async (req, res) => res.json(await db.all('SELECT * FROM salary_payments WHERE employee_id = ? ORDER BY month DESC', req.params.id))));

// ---------- uploads + gallery ----------
app.post('/api/admin/upload', can('website', 'employees', 'settings'), upload.single('file'), wrapA(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a photo (JPG, PNG, WEBP or HEIC), max 15MB' });
  res.json({ url: await storeImage(req.file) });
}));
app.get('/api/admin/gallery', can('website'), wrapA(async (req, res) => res.json(await db.all('SELECT * FROM gallery ORDER BY id DESC'))));
app.post('/api/admin/gallery', can('website'), upload.array('images', 30), wrapA(async (req, res) => {
  for (const f of req.files || []) await db.run('INSERT INTO gallery (image, caption) VALUES (?, ?)', await storeImage(f), str(req.body.caption, 150));
  if ((req.files || []).length) await log(req, 'created', 'gallery', null, `Uploaded ${req.files.length} gallery photo(s)`);
  res.json({ ok: true, added: (req.files || []).length });
}));
app.patch('/api/admin/gallery/:id', can('website'), wrapA(async (req, res) => { await db.run('UPDATE gallery SET caption = ? WHERE id = ?', str(req.body?.caption, 150), req.params.id); res.json({ ok: true }); }));
app.delete('/api/admin/gallery/:id', can('website'), wrapA(async (req, res) => {
  const g = await db.get('SELECT image FROM gallery WHERE id = ?', req.params.id);
  if (g) await db.run('DELETE FROM files WHERE name = ?', path.basename(g.image));
  await db.run('DELETE FROM gallery WHERE id = ?', req.params.id);
  await log(req, 'deleted', 'gallery', Number(req.params.id), 'Deleted a gallery photo');
  res.json({ ok: true });
}));

// ---------- settings ----------
app.get('/api/admin/settings', can('settings'), wrapA(async (req, res) => res.json(await getSettings())));
app.put('/api/admin/settings', can('settings'), wrapA(async (req, res) => {
  const before = await getSettings();
  await saveSettings(req.body || {});
  const after = await getSettings();
  const labels = Object.fromEntries(SETTINGS.flatMap(g => g.fields).map(f => [f.key, f.label]));
  const changed = Object.keys(labels).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k])).map(k => labels[k]);
  if (changed.length) await log(req, 'edited', 'settings', null, `Changed settings: ${changed.join(', ')}`);
  res.json({ ok: true });
}));

// ---------- cashflow ----------
app.get('/api/admin/transactions', can('cashflow'), wrapA(async (req, res) => {
  const q = req.query, w = [], a = [];
  if (validDate(q.from)) { w.push('t.date >= ?'); a.push(q.from); }
  if (validDate(q.to)) { w.push('t.date <= ?'); a.push(q.to); }
  if (['income', 'expense'].includes(q.type)) { w.push('t.type = ?'); a.push(q.type); }
  if (q.category) { w.push('t.category = ?'); a.push(q.category); }
  if (q.q) { w.push('(t.description LIKE ? OR t.category LIKE ? OR t.recorded_by LIKE ?)'); a.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`); }
  res.json(await db.all(`SELECT t.*, b.ref booking_ref, e.name employee_name FROM transactions t LEFT JOIN bookings b ON b.id = t.booking_id LEFT JOIN employees e ON e.id = t.employee_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY t.date DESC, t.id DESC LIMIT 2000`, ...a));
}));
function txFromBody(b) {
  const type = b.type === 'expense' ? 'expense' : 'income';
  const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const amount = num(b.amount);
  if (amount <= 0) throw new Error('Enter an amount');
  return { date: validDate(b.date) ? b.date : today(), type, category: cats.includes(b.category) ? b.category : cats.at(-1), amount,
    method: PAY_METHODS.includes(b.method) ? b.method : 'Cash', description: str(b.description, 300) };
}
const txLabel = d => `${d.type === 'income' ? 'income' : 'expense'} ${Number(d.amount).toLocaleString('en-PK')} · ${d.category}${d.description ? ' · ' + d.description : ''}`;
app.post('/api/admin/transactions', can('cashflow'), wrapA(async (req, res) => {
  try {
    const d = txFromBody(req.body || {});
    if (!(await closedGuard(req, res, [d.date]))) return;
    const r = await db.run('INSERT INTO transactions (date, type, category, amount, method, description, recorded_by) VALUES (?,?,?,?,?,?,?)', d.date, d.type, d.category, d.amount, d.method, d.description, req.admin.name);
    await log(req, 'created', 'transaction', r.id, `Added ${txLabel(d)} on ${d.date}${req.closedNote || ''}`);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.put('/api/admin/transactions/:id', can('cashflow'), wrapA(async (req, res) => {
  const t = await db.get('SELECT * FROM transactions WHERE id = ?', req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (t.salary_payment_id) return res.status(400).json({ error: 'Salary entries are edited from Payroll.' });
  try {
    const d = txFromBody({ ...req.body, type: t.booking_id ? 'income' : req.body.type });
    if (!(await closedGuard(req, res, [t.date, d.date]))) return;
    await db.run('UPDATE transactions SET date=?, type=?, category=?, amount=?, method=?, description=? WHERE id=?', d.date, d.type, t.booking_id ? 'Booking payment' : d.category, d.amount, d.method, d.description, t.id);
    await log(req, 'edited', 'transaction', t.id, `Edited ${txLabel(t)} → ${Number(d.amount).toLocaleString('en-PK')}${d.description !== t.description ? ' · ' + d.description : ''}${d.date !== t.date ? ' · date ' + t.date + ' → ' + d.date : ''}${req.closedNote || ''}`);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.delete('/api/admin/transactions/:id', can('delete'), wrapA(async (req, res) => {
  const t = await db.get('SELECT * FROM transactions WHERE id = ?', req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (!(has(req, 'cashflow') || (t.booking_id && has(req, 'payments')))) return res.status(403).json({ error: "You don't have permission for this. Ask the owner." });
  if (!(await closedGuard(req, res, [t.date]))) return;
  if (t.salary_payment_id) await db.run('DELETE FROM salary_payments WHERE id = ?', t.salary_payment_id);
  await db.run('DELETE FROM transactions WHERE id = ?', t.id);
  await log(req, 'deleted', t.booking_id ? 'payment' : 'transaction', t.booking_id || t.id, `Deleted ${t.booking_id ? 'payment' : txLabel(t)} ${Number(t.amount).toLocaleString('en-PK')} (${t.date})${req.closedNote || ''}`);
  res.json({ ok: true });
}));
app.get('/api/admin/finance', can('cashflow'), wrapA(async (req, res) => {
  const from = validDate(req.query.from) ? req.query.from : today().slice(0, 7) + '-01', to = validDate(req.query.to) ? req.query.to : today();
  const totals = await db.all(`SELECT type, COALESCE(SUM(amount),0) s FROM transactions WHERE date BETWEEN ? AND ? GROUP BY type`, from, to);
  res.json({ from, to,
    income: totals.find(x => x.type === 'income')?.s || 0, expense: totals.find(x => x.type === 'expense')?.s || 0,
    by_category: await db.all(`SELECT type, category, COALESCE(SUM(amount),0) s, COUNT(*) n FROM transactions WHERE date BETWEEN ? AND ? GROUP BY type, category ORDER BY s DESC`, from, to) });
}));

// ---------- payroll ----------
app.get('/api/admin/payroll', can('payroll'), wrapA(async (req, res) => {
  const month = validMonth(req.query.month) ? req.query.month : today().slice(0, 7);
  const staff = await db.all(`SELECT e.id, e.name, e.role, e.salary, e.status, e.join_date, p.id payment_id, p.base, p.bonus, p.deduction, p.net, p.paid_on, p.method, p.note, p.paid_by, p.transaction_id
    FROM employees e LEFT JOIN salary_payments p ON p.employee_id = e.id AND p.month = ?
    WHERE e.status = 'active' OR p.id IS NOT NULL ORDER BY e.name`, month);
  res.json({ month, staff });
}));
app.post('/api/admin/payroll', can('payroll'), wrapA(async (req, res) => {
  const b = req.body || {};
  const e = await db.get('SELECT * FROM employees WHERE id = ?', b.employee_id);
  if (!e || !validMonth(b.month)) return res.status(400).json({ error: 'Choose an employee and month' });
  const base = b.base !== undefined && b.base !== '' ? num(b.base) : num(e.salary), bonus = num(b.bonus), deduction = num(b.deduction);
  const net = base + bonus - deduction, paid_on = validDate(b.paid_on) ? b.paid_on : today(), method = PAY_METHODS.includes(b.method) ? b.method : 'Cash';
  if (net <= 0) return res.status(400).json({ error: 'Net pay must be more than zero' });
  if (!(await closedGuard(req, res, [paid_on]))) return;
  try {
    await db.tx(async tx => {
      const p = await tx.run('INSERT INTO salary_payments (employee_id, month, base, bonus, deduction, net, paid_on, method, note, paid_by) VALUES (?,?,?,?,?,?,?,?,?,?)', e.id, b.month, base, bonus, deduction, net, paid_on, method, str(b.note, 200), req.admin.name);
      const t = await tx.run(`INSERT INTO transactions (date, type, category, amount, method, description, employee_id, salary_payment_id, recorded_by) VALUES (?, 'expense', 'Salaries', ?, ?, ?, ?, ?, ?)`,
        paid_on, net, method, `Salary ${b.month} · ${e.name}${e.role ? ' (' + e.role + ')' : ''}`, e.id, p.id, req.admin.name);
      await tx.run('UPDATE salary_payments SET transaction_id = ? WHERE id = ?', t.id, p.id);
      await log(req, 'paid', 'employees', e.id, `Paid ${e.name} ${net.toLocaleString('en-PK')} for ${b.month} (${method}${bonus ? ', bonus ' + bonus : ''}${deduction ? ', deduction ' + deduction : ''})${req.closedNote || ''}`, tx);
    });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: /UNIQUE/i.test(err.message) ? `${e.name} has already been paid for ${b.month}.` : err.message }); }
}));
app.delete('/api/admin/payroll/:id', can('payroll'), wrapA(async (req, res) => {
  const p = await db.get('SELECT p.*, e.name FROM salary_payments p JOIN employees e ON e.id = p.employee_id WHERE p.id = ?', req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (!(await closedGuard(req, res, [p.paid_on]))) return;
  await db.run('DELETE FROM transactions WHERE salary_payment_id = ?', p.id);
  await db.run('DELETE FROM salary_payments WHERE id = ?', p.id);
  await log(req, 'undone', 'employees', p.employee_id, `Undid salary for ${p.name}, ${p.month} (${Number(p.net).toLocaleString('en-PK')})`);
  res.json({ ok: true });
}));

// ---------- admin: receipts ----------
app.get('/receipt', (req, res) => res.sendFile(path.join(__dirname, 'public', 'receipt.html')));
app.get('/api/admin/receipt/booking/:id', can('bookings'), wrapA(async (req, res) => {
  const r = await bookingReceipt(req.params.id, true);
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json({ ...r, admin: true });
}));
app.get('/api/admin/receipt/tx/:id', wrapA(async (req, res) => {
  const t = await db.get('SELECT * FROM transactions WHERE id = ?', req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const ok = has(req, 'cashflow') || (t.booking_id && (has(req, 'payments') || has(req, 'bookings'))) || (t.salary_payment_id && has(req, 'payroll'));
  if (!ok) return res.status(403).json({ error: "You don't have permission for this receipt." });
  res.json({ ...(await txReceipt(t.id)), admin: true });
}));
app.post('/api/admin/receipt/log', wrapA(async (req, res) => {
  const b = req.body || {};
  const how = { print: 'Printed', whatsapp: 'Sent on WhatsApp', email: 'Emailed' }[b.how] || 'Shared';
  const entity = b.kind === 'booking' ? 'booking' : b.booking_id ? 'payment' : 'transaction';
  await log(req, 'receipt', entity, Number(b.booking_id || b.id) || null, `${how}: ${str(b.what, 150)}`);
  res.json({ ok: true });
}));

// ---------- audit: closings + financial report ----------
app.get('/report', (req, res) => res.sendFile(path.join(__dirname, 'public', 'report.html')));
async function closingsBetween(from, to) {
  const list = await db.all('SELECT * FROM day_closings WHERE date BETWEEN ? AND ? ORDER BY date DESC', from, to);
  for (const c of list) {
    const now = await dayState(c.date);
    c.verified = now.fingerprint === c.fingerprint;
    if (!c.verified) { c.now = now; c.changes = await db.all(`SELECT admin_name, summary, created_at FROM activity WHERE summary LIKE ? ORDER BY id`, `%closed day ${c.date}%`); }
  }
  return list;
}
app.get('/api/admin/closings', can('cashflow'), wrapA(async (req, res) => {
  const to = validDate(req.query.to) ? req.query.to : today(), from = validDate(req.query.from) ? req.query.from : addDays(to, -60);
  res.json({ today: today(), closings: await closingsBetween(from, to) });
}));
app.post('/api/admin/closings/close', ownerOnly, wrapA(async (req, res) => {
  const d = validDate(req.body?.date) ? req.body.date : today();
  if (d > today()) return res.status(400).json({ error: "You can't close a future day." });
  const ok = await closeDay(d, req.admin.name);
  if (!ok) return res.status(400).json({ error: `${d} is already closed.` });
  const st = await dayState(d);
  await log(req, 'closed', 'closing', null, `Closed ${d} for audit: ${st.tx_count} entries, in ${st.income.toLocaleString('en-PK')}, out ${st.expense.toLocaleString('en-PK')}`);
  res.json({ ok: true });
}));
app.get('/api/admin/report', can('cashflow'), wrapA(async (req, res) => {
  const t = today();
  const from = validDate(req.query.from) ? req.query.from : t, to = validDate(req.query.to) ? req.query.to : from;
  if (from > to) return res.status(400).json({ error: 'Start date is after end date' });
  const s = await getSettings();
  const ledger = await db.all(`SELECT t.*, b.ref booking_ref, b.customer_name, e.name employee_name FROM transactions t
    LEFT JOIN bookings b ON b.id = t.booking_id LEFT JOIN employees e ON e.id = t.employee_id WHERE t.date BETWEEN ? AND ? ORDER BY t.date, t.id`, from, to);
  const sumBy = (key, type) => { const m = {}; ledger.filter(x => x.type === type).forEach(x => (m[x[key] || '—'] = (m[x[key] || '—'] || 0) + x.amount)); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v })); };
  const methods = [...new Set(ledger.map(x => x.method))].map(m => ({ method: m,
    income: ledger.filter(x => x.method === m && x.type === 'income').reduce((a, x) => a + x.amount, 0),
    expense: ledger.filter(x => x.method === m && x.type === 'expense').reduce((a, x) => a + x.amount, 0) }));
  const months = [];
  if (from.slice(0, 7) !== to.slice(0, 7)) {
    for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonths(m, 1)) {
      const rows = ledger.filter(x => x.date.slice(0, 7) === m);
      months.push({ month: m, income: rows.filter(x => x.type === 'income').reduce((a, x) => a + x.amount, 0), expense: rows.filter(x => x.type === 'expense').reduce((a, x) => a + x.amount, 0), count: rows.length });
    }
  }
  res.json({
    venue: venueInfo(s), from, to, generated_by: req.admin.name, generated_at: new Date().toISOString(),
    income: ledger.filter(x => x.type === 'income').reduce((a, x) => a + x.amount, 0),
    expense: ledger.filter(x => x.type === 'expense').reduce((a, x) => a + x.amount, 0),
    income_by_category: sumBy('category', 'income'), expense_by_category: sumBy('category', 'expense'),
    by_method: methods, by_admin: [...new Set(ledger.map(x => x.recorded_by || '—'))].map(n => ({ name: n, count: ledger.filter(x => (x.recorded_by || '—') === n).length,
      income: ledger.filter(x => (x.recorded_by || '—') === n && x.type === 'income').reduce((a, x) => a + x.amount, 0), expense: ledger.filter(x => (x.recorded_by || '—') === n && x.type === 'expense').reduce((a, x) => a + x.amount, 0) })),
    months,
    ledger: ledger.map(x => ({ ...x, no: rcptNo(x.id) })),
    events: await db.all(`SELECT b.ref, b.date, b.slot, b.hall_name, b.customer_name, b.event_type, b.guests, b.total, b.status, ${PAID_SQL} paid FROM bookings b
      WHERE b.date BETWEEN ? AND ? AND b.status IN ('confirmed','completed') ORDER BY b.date, b.slot`, from, to),
    booking_changes: await db.all(`SELECT admin_name, action, summary, created_at FROM activity WHERE entity = 'booking' AND action IN ('confirmed','cancelled','completed','created','requested','deleted')
      AND date(created_at, '+5 hours') BETWEEN ? AND ? ORDER BY id`, from, to),
    outstanding: await db.all(`SELECT b.ref, b.date, b.customer_name, b.phone, b.total, ${PAID_SQL} paid FROM bookings b WHERE b.status IN ('confirmed','completed') AND b.total - ${PAID_SQL} > 0.5 ORDER BY b.date`),
    closings: await closingsBetween(from, to),
    open_days: (await db.all(`SELECT DISTINCT date FROM transactions WHERE date BETWEEN ? AND ? AND date NOT IN (SELECT date FROM day_closings) ORDER BY date`, from, to)).map(r => r.date),
  });
}));

// ---------- CSV exports ----------
const EXPORTS = {
  bookings: ['bookings', `SELECT ref, date, slot, hall_name hall, event_type, customer_name, phone, guests, package_name package, per_head, menu_total menu_extras, addons_total add_ons, extras, discount, total, ${PAID_SQL} paid, status, created_by booked_by, status_by status_changed_by, notes, created_at FROM bookings b ORDER BY date DESC`],
  transactions: ['cashflow', `SELECT 'R-' || substr('000000' || id, -6) receipt_no, date, type, category, purpose payment_for, amount, method, description, recorded_by FROM transactions ORDER BY date DESC, id DESC`],
  closings: ['cashflow', `SELECT date, tx_count, income, expense, fingerprint, closed_at closed_at_utc, closed_by FROM day_closings ORDER BY date DESC`],
  employees: ['employees', `SELECT name, role, phone, cnic, salary, join_date, status, address, emergency_contact, notes FROM employees ORDER BY name`],
  payroll: ['payroll', `SELECT p.month, e.name, e.role, p.base, p.bonus, p.deduction, p.net, p.paid_on, p.method, p.paid_by, p.note FROM salary_payments p JOIN employees e ON e.id = p.employee_id ORDER BY p.month DESC, e.name`],
  activity: ['owner', `SELECT created_at time_utc, admin_name, action, entity, summary FROM activity ORDER BY id DESC`],
};
app.get('/api/admin/export/:what', wrapA(async (req, res) => {
  const e = EXPORTS[req.params.what];
  if (!e) return res.status(404).end();
  if (e[0] === 'owner' ? req.admin.role !== 'owner' : !has(req, e[0])) return res.status(403).json({ error: "You don't have permission for this." });
  const rows = await db.all(e[1]);
  const head = rows.length ? Object.keys(rows[0]) : ['no data'];
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="${req.params.what}-${today()}.csv"`)
    .send('﻿' + [head.join(','), ...rows.map(r => head.map(h => esc(r[h])).join(','))].join('\n'));
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 500).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Photo too large (max 15MB)' : 'Server error' });
});

init().then(({ secret, where }) => {
  JWT_SECRET = secret;
  autoClose(); setInterval(autoClose, 10 * 60 * 1000);   // close finished days at midnight (checked every 10 minutes)
  app.listen(PORT, () => console.log(`Gul Makkai Palace running → http://localhost:${PORT}  (admin: /admin) · data: ${where}`));
}).catch(e => { console.error('Could not start:', e); process.exit(1); });
