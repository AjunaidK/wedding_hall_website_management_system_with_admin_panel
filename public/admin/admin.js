// Admin panel — Gul Makkai Palace
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let SC = null, CUR = 'Rs', TODAY = '', ME = null;
const isOwner = () => ME?.role === 'owner';
const can = p => isOwner() || (ME?.permissions || []).includes(p);
// times are stored in UTC; show them in Pakistan time
const when = ts => { if (!ts) return ''; const d = new Date(String(ts).replace(' ', 'T') + (String(ts).endsWith('Z') ? '' : 'Z'));
  return d.toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const VIEW_PERM = { bookings: 'bookings', calendar: 'bookings', cashflow: 'cashflow', reports: 'cashflow', payroll: 'payroll', 't:employees': 'employees', 't:halls': 'website',
  't:packages': 'website', 't:addons': 'website', 't:dishes': 'website', 't:offers': 'website', gallery: 'website', 't:reviews': 'website', settings: 'settings', admins: 'owner' };
const allowed = v => (VIEW_PERM[v] === 'owner' ? isOwner() : !VIEW_PERM[v] || can(VIEW_PERM[v]));
const money = n => `${CUR} ${Math.round(Number(n) || 0).toLocaleString('en-PK')}`;
const pd = d => { if (!d) return ''; const x = new Date(d + 'T12:00:00'); return `${DOW[x.getDay()]} ${x.getDate()} ${MON[x.getMonth()]} ${x.getFullYear()}`; };
const monthName = m => `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const addMonths = (m, n) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
const monthEnd = m => { const [y, mo] = m.split('-').map(Number); return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`; };
const intlPhone = p => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('0') ? '92' + d.slice(1) : d; };

async function api(url, opts = {}) {
  const form = opts.body instanceof FormData;
  const r = await fetch(url, { ...opts, headers: form ? {} : { 'Content-Type': 'application/json' }, body: form ? opts.body : opts.body && JSON.stringify(opts.body) });
  if (r.status === 401 && !url.includes('/login')) { showLogin(); throw new Error('Please log in'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
  return d;
}
let tT;
function toast(m, bad) { const t = $('#toast'); t.textContent = m; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(tT); tT = setTimeout(() => (t.hidden = true), 2800); }
function modal(html) { $('#modalBody').innerHTML = html; $('#modal').hidden = false; return $('#modalBody'); }
const closeModal = () => ($('#modal').hidden = true);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
function topBtn(label, fn, cls = 'primary') {
  // never add the same button twice: if it's already there, just update what it does
  const ex = [...$('#topActions').children].find(x => x.textContent === label);
  if (ex) { ex.onclick = fn; return; }
  const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; $('#topActions').append(b); }
const download = what => (location.href = `/api/admin/export/${what}`);

// ---------- auth + routing ----------
function showLogin() { $('#appView').hidden = true; $('#loginView').hidden = false; }
async function boot() {
  try { await api('/api/admin/me'); } catch { return showLogin(); }
  SC = await api('/api/admin/schema'); CUR = SC.currency; TODAY = SC.today; ME = SC.me;
  $('#loginView').hidden = true; $('#appView').hidden = false;
  $$('#nav a').forEach(a => (a.hidden = !allowed(a.dataset.view)));
  $$('#nav .grp').forEach(g => { let n = g.nextElementSibling, any = false; while (n && n.tagName === 'A') { if (!n.hidden) any = true; n = n.nextElementSibling; } g.hidden = !any; });
  $('#navActivity').textContent = isOwner() ? 'Activity (everyone)' : 'My activity';
  $('#whoami').innerHTML = `${esc(ME.name)}<small>${isOwner() ? 'Owner · grand admin' : 'Admin'}</small>`;
  startLive();
  go(location.hash.slice(1) || 'dashboard');
}
$('#loginForm').onsubmit = async e => {
  e.preventDefault(); $('#lErr').hidden = true;
  try { await api('/api/admin/login', { method: 'POST', body: { username: $('#lUser').value, password: $('#lPass').value } }); boot(); }
  catch (ex) { $('#lErr').textContent = ex.message; $('#lErr').hidden = false; }
};
$('#logout').onclick = async () => { await api('/api/admin/logout', { method: 'POST' }); showLogin(); };
$('#burger').onclick = () => $('#side').classList.toggle('open');
const VIEWS = { dashboard: ['Dashboard', vDashboard], bookings: ['Bookings', vBookings], calendar: ['Calendar', vCalendar], cashflow: ['Cashflow', vCashflow],
  payroll: ['Payroll', vPayroll], gallery: ['Gallery', vGallery], settings: ['Settings', vSettings], account: ['My account', vAccount], admins: ['Admins', vAdmins], activity: ['Activity', vActivity], reports: ['Reports & audit', vReports] };
function go(view) {
  let title, fn;
  if (view.startsWith('t:') && SC.tables[view.slice(2)]) { title = SC.tables[view.slice(2)].label; fn = () => vTable(view.slice(2)); }
  else { if (!VIEWS[view]) view = 'dashboard'; [title, fn] = VIEWS[view]; }
  if (!allowed(view)) { view = 'dashboard'; [title, fn] = VIEWS.dashboard; }
  location.hash = view;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.view === view));
  $('#viewTitle').textContent = title; $('#topActions').innerHTML = ''; $('#side').classList.remove('open');
  $('#view').innerHTML = '<p class="muted">Loading…</p>';
  fn().catch(e => ($('#view').innerHTML = `<p class="err">${esc(e.message)}</p>`));
  refreshPending();
}
const reload = () => go(location.hash.slice(1));
$$('#nav a').forEach(a => (a.onclick = () => go(a.dataset.view)));
async function refreshPending() {
  if (!can('bookings')) return;
  try { const b = await api(`/api/admin/bookings?status=pending&from=${TODAY}`); $('#pendPill').hidden = !b.length; $('#pendPill').textContent = b.length; } catch {}
}

// ---------- form fields (shared) ----------
function field(f, v) {
  const id = 'f_' + f.key, hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : '';
  v = v ?? (f.default ?? '');
  switch (f.type) {
    case 'bool': return `<label class="check"><input type="checkbox" id="${id}" data-k="${f.key}" data-t="bool" ${v === true || v === 1 || v === '1' ? 'checked' : ''}> ${esc(f.label)}</label>`;
    case 'textarea': return `<label for="${id}">${esc(f.label)}${hint}<textarea id="${id}" data-k="${f.key}" rows="3">${esc(v)}</textarea></label>`;
    case 'lines': return `<label for="${id}">${esc(f.label)}${hint}<textarea id="${id}" data-k="${f.key}" data-t="lines" rows="5">${esc(Array.isArray(v) ? v.join('\n') : v)}</textarea></label>`;
    case 'tags': return `<label for="${id}">${esc(f.label)}${hint}<input id="${id}" data-k="${f.key}" data-t="tags" value="${esc(Array.isArray(v) ? v.join(', ') : v)}"></label>`;
    case 'number': return `<label for="${id}">${esc(f.label)}${hint}<input type="number" id="${id}" data-k="${f.key}" value="${esc(v)}"></label>`;
    case 'date': return `<label for="${id}">${esc(f.label)}${hint}<input type="date" id="${id}" data-k="${f.key}" value="${esc(v)}"></label>`;
    case 'color': return `<label for="${id}">${esc(f.label)}<span class="color-row"><input type="color" id="${id}" data-k="${f.key}" value="${esc(v || '#000000')}"><code>${esc(v)}</code></span></label>`;
    case 'select': return `<label for="${id}">${esc(f.label)}${hint}<select id="${id}" data-k="${f.key}">${f.options.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
    case 'image': return `<label>${esc(f.label)}${hint}</label><div class="upl" data-upl="${f.key}"><input type="hidden" data-k="${f.key}" value="${esc(v)}">
      <span class="thumb" style="${v ? `background-image:url('${esc(v)}')` : ''}">${v ? '' : 'No photo'}</span>
      <label class="btn sm" style="margin:0">Upload<input type="file" accept="image/*" hidden></label><button type="button" class="btn sm danger" data-clear>Remove</button></div>`;
    case 'images': { const arr = Array.isArray(v) ? v : []; return `<label>${esc(f.label)}${hint}</label><div data-gal="${f.key}" style="margin:-6px 0 12px"><div class="gal-list">${arr.map(u => galIt(u)).join('')}</div>
      <label class="btn sm" style="margin:0;width:max-content">Add photos<input type="file" accept="image/*" multiple hidden></label></div>`; }
    default: return `<label for="${id}">${esc(f.label)}${hint}<input id="${id}" data-k="${f.key}" value="${esc(v)}"></label>`;
  }
}
const galIt = u => `<span class="gal-it" data-url="${esc(u)}" style="background-image:url('${esc(u)}')"><button type="button" aria-label="Remove">×</button></span>`;
async function uploadOne(file) { const fd = new FormData(); fd.append('file', file); return (await api('/api/admin/upload', { method: 'POST', body: fd })).url; }
function wire(root) {
  root.querySelectorAll('[data-upl]').forEach(box => {
    const h = box.querySelector('input[type=hidden]'), th = box.querySelector('.thumb');
    const paint = u => { h.value = u; th.style.backgroundImage = u ? `url('${u}')` : ''; th.textContent = u ? '' : 'No photo'; };
    box.querySelector('input[type=file]').onchange = async e => { try { toast('Uploading…'); paint(await uploadOne(e.target.files[0])); toast('Uploaded — remember to save'); } catch (ex) { toast(ex.message, true); } e.target.value = ''; };
    box.querySelector('[data-clear]').onclick = () => paint('');
  });
  root.querySelectorAll('[data-gal]').forEach(box => {
    const list = box.querySelector('.gal-list');
    list.onclick = e => { if (e.target.tagName === 'BUTTON') e.target.parentElement.remove(); };
    box.querySelector('input[type=file]').onchange = async e => {
      for (const f of e.target.files) { try { toast(`Uploading ${f.name}…`); list.insertAdjacentHTML('beforeend', galIt(await uploadOne(f))); } catch (ex) { toast(ex.message, true); } }
      toast('Uploaded — remember to save'); e.target.value = '';
    };
  });
  root.querySelectorAll('input[type=color]').forEach(c => (c.oninput = () => (c.nextElementSibling.textContent = c.value)));
}
function read(root) {
  const o = {};
  root.querySelectorAll('[data-k]').forEach(el => {
    const t = el.dataset.t;
    o[el.dataset.k] = t === 'bool' ? el.checked : t === 'lines' ? el.value.split('\n') : t === 'tags' ? el.value.split(',') : el.value;
  });
  root.querySelectorAll('[data-gal]').forEach(b => (o[b.dataset.gal] = [...b.querySelectorAll('.gal-it')].map(x => x.dataset.url)));
  return o;
}

// ---------- dashboard ----------
async function vDashboard() {
  if (can('bookings')) topBtn('+ New booking', () => bookingForm());
  const s = await api('/api/admin/stats');
  const tiles = [];
  if ('pending' in s) tiles.push(`<div class="tile warn"><span>New requests</span><b>${s.pending}</b><small>waiting for a call</small></div>`,
    `<div class="tile"><span>Upcoming events</span><b>${s.upcoming}</b><small>confirmed</small></div>`, `<div class="tile"><span>Events this month</span><b>${s.this_month_events}</b></div>`);
  if ('income_month' in s) { const net = s.income_month - s.expense_month; tiles.push(`<div class="tile good"><span>Income this month</span><b>${money(s.income_month)}</b></div>`,
    `<div class="tile bad"><span>Expenses this month</span><b>${money(s.expense_month)}</b></div>`, `<div class="tile ${net >= 0 ? 'good' : 'bad'}"><span>Net this month</span><b>${money(net)}</b></div>`); }
  if ('outstanding' in s) tiles.push(`<div class="tile warn"><span>Balance to collect</span><b>${money(s.outstanding)}</b><small>from confirmed bookings</small></div>`);
  if (s.staff) tiles.push(`<div class="tile"><span>Active staff</span><b>${s.staff.c}</b><small>${money(s.staff.s)} / month</small></div>`);
  const max = s.months ? Math.max(1, ...s.months.flatMap(m => [m.income, m.expense])) : 1;
  const chart = s.months ? `<div class="panel"><h3>Cashflow, last 6 months</h3>
        <div class="bars">${s.months.map(m => `<div class="pair" title="${monthName(m.month)}: in ${money(m.income)}, out ${money(m.expense)}"><i class="inc" style="height:${(m.income / max) * 100}%"></i><i class="exp" style="height:${(m.expense / max) * 100}%"></i></div>`).join('')}</div>
        <div class="bars-x">${s.months.map(m => `<span>${MON[Number(m.month.slice(5)) - 1]}</span>`).join('')}</div>
        <div class="key"><span><i style="background:var(--good)"></i>Income</span><span><i style="background:#d9826f"></i>Expenses</span></div></div>` : '';
  const events = s.next_events ? `<div class="panel np"><div style="padding:16px 18px 6px"><h3 style="margin:0">Next events</h3></div>
        ${s.next_events.length ? `<table class="tbl">${s.next_events.map(b => `<tr class="click" data-id="${b.id}"><td><b>${pd(b.date)}</b><br><span class="muted small">${esc(b.slot)} · ${esc(b.hall_name)}</span></td>
          <td>${esc(b.customer_name)}<br><span class="muted small">${esc(b.event_type)} · ${b.guests} guests</span></td><td><span class="st ${b.status}">${b.status}</span></td></tr>`).join('')}</table>` : '<p class="empty">No upcoming events yet.</p>'}</div>` : '';
  const recent = `<div class="panel"><h3>${isOwner() ? 'Latest activity (everyone)' : 'My latest activity'}</h3>${actList(s.recent)}<p style="margin:10px 0 0"><a href="#activity" onclick="go('activity');return false" class="small">See all →</a></p></div>`;
  $('#view').innerHTML = `<p class="muted" style="margin:0 0 14px">Assalam o Alaikum, ${esc(ME.name)}.</p>
    ${tiles.length ? `<div class="tiles">${tiles.join('')}</div>` : ''}
    <div class="grid2"><div>${chart}${events && !chart ? events : ''}${!chart && !events ? recent : ''}</div><div>${chart ? events : ''}${chart || events ? recent : ''}</div></div>`;
  $$('#view tr[data-id]').forEach(r => (r.onclick = () => openBooking(r.dataset.id)));
}
function actList(list) {
  if (!list || !list.length) return '<p class="empty">Nothing yet.</p>';
  return `<ul class="hist">${list.map(a => `<li><span class="act ${esc(a.action)}">${esc(a.action)}</span> ${esc(a.summary)}<time>${when(a.created_at)} · <b>${esc(a.admin_name || 'System')}</b></time></li>`).join('')}</ul>`;
}

// ---------- bookings ----------
const bf = { range: 'upcoming', status: 'all', q: '', hall: '' };
async function vBookings() {
  topBtn('Export CSV', () => download('bookings'), '');
  topBtn('+ New booking', () => bookingForm());
  const halls = await api('/api/admin/t/halls');
  $('#view').innerHTML = `<div class="filters">
      <div class="seg" id="bRange">${[['upcoming', 'Upcoming'], ['pending', 'New requests'], ['month', 'This month'], ['past', 'Past'], ['all', 'All']].map(([k, l]) => `<button type="button" data-r="${k}" class="${bf.range === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <select id="bStatus"><option value="all">Any status</option>${['pending', 'confirmed', 'completed', 'cancelled'].map(s => `<option ${bf.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <select id="bHall"><option value="">All halls</option>${halls.map(h => `<option value="${h.id}" ${String(bf.hall) === String(h.id) ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select>
      <input id="bQ" class="grow" placeholder="Search name, phone, reference, event…" value="${esc(bf.q)}">
    </div><div class="panel np scroll" id="bList"></div>`;
  $('#bRange').onclick = e => { const b = e.target.closest('button'); if (!b) return; bf.range = b.dataset.r; if (bf.range === 'pending') bf.status = 'all'; vBookingsList(); $$('#bRange button').forEach(x => x.classList.toggle('on', x === b)); };
  $('#bStatus').onchange = e => { bf.status = e.target.value; vBookingsList(); };
  $('#bHall').onchange = e => { bf.hall = e.target.value; vBookingsList(); };
  let t; $('#bQ').oninput = e => { clearTimeout(t); t = setTimeout(() => { bf.q = e.target.value.trim(); vBookingsList(); }, 300); };
  vBookingsList();
}
async function vBookingsList() {
  const p = new URLSearchParams(), m = TODAY.slice(0, 7);
  if (bf.range === 'upcoming') p.set('from', TODAY);
  if (bf.range === 'pending') { p.set('from', TODAY); p.set('status', 'pending'); }
  if (bf.range === 'month') { p.set('from', m + '-01'); p.set('to', monthEnd(m)); }
  if (bf.range === 'past') { p.set('to', TODAY); p.set('order', 'desc'); }
  if (bf.status !== 'all' && bf.range !== 'pending') p.set('status', bf.status);
  if (bf.hall) p.set('hall_id', bf.hall);
  if (bf.q) p.set('q', bf.q);
  const list = await api('/api/admin/bookings?' + p);
  $('#bList').innerHTML = list.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Customer</th><th>Event</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th><th></th></tr></thead><tbody>
    ${list.map(b => `<tr class="click" data-id="${b.id}">
      <td><b>${pd(b.date)}</b><br><span class="muted small">${esc(b.slot)} · ${esc(b.hall_name)}</span></td>
      <td>${esc(b.customer_name)}<br><span class="muted small">${esc(b.phone)} · ${esc(b.ref)}</span></td>
      <td>${esc(b.event_type)}<br><span class="muted small">${b.guests} guests${b.package_name ? ' · ' + esc(b.package_name) : ''}</span></td>
      <td class="num">${money(b.total)}</td><td class="num in">${money(b.paid)}</td><td class="num ${b.total - b.paid > 0 ? 'out' : ''}">${money(b.total - b.paid)}</td>
      <td><span class="st ${b.status}">${b.status}</span><span class="by">by ${esc(b.status_by || b.created_by || '—')}</span></td>
      <td>${b.status === 'pending' && can('confirm') ? `<button class="btn sm good" data-confirm="${b.id}">Confirm</button>` : ''}</td></tr>`).join('')}</tbody></table>`
    : '<p class="empty">No bookings match.</p>';
  $$('#bList tr[data-id]').forEach(r => (r.onclick = e => { if (!e.target.closest('[data-confirm]')) openBooking(r.dataset.id); }));
  $$('[data-confirm]').forEach(b => (b.onclick = async () => {
    try { await api(`/api/admin/bookings/${b.dataset.confirm}`, { method: 'PATCH', body: { status: 'confirmed' } }); toast('Confirmed'); vBookingsList(); refreshPending(); openBooking(b.dataset.confirm, 'confirmed'); } catch (ex) { toast(ex.message, true); }
  }));
}

async function bookingForm(b = null, preset = {}) {
  const [halls, pkgs, addonList, dishes] = await Promise.all([api('/api/admin/t/halls'), api('/api/admin/t/packages'), api('/api/admin/t/addons'), api('/api/admin/t/dishes')]);
  let curAddons = []; try { curAddons = JSON.parse(b?.addons || '[]'); } catch {}
  const chosen = new Set(curAddons.map(a => a.id));
  const allAddons = [...addonList.filter(a => a.active || chosen.has(a.id))];
  const v = { status: can('confirm') ? 'confirmed' : 'pending', date: preset.date || TODAY, slot: SC.slots[0]?.name, hall_id: halls[0]?.id, package_id: (pkgs.find(p => p.highlight && p.active) || pkgs.find(p => p.active))?.id, ...b };
  const m = modal(`<h3>${b ? 'Edit booking ' + esc(b.ref) : 'New booking'}</h3>
    <form id="bkf">
      <div class="f3">
        <label>Date<input type="date" name="date" value="${esc(v.date)}" required></label>
        <label>Time<select name="slot">${SC.slots.map(s => `<option ${s.name === v.slot ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <label>Hall<select name="hall_id">${halls.map(h => `<option value="${h.id}" ${h.id == v.hall_id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label>
      </div>
      <div class="f3">
        <label>Customer name<input name="customer_name" value="${esc(v.customer_name)}" required></label>
        <label>Phone<input name="phone" value="${esc(v.phone)}"></label>
        <label>Event<select name="event_type">${[...new Set([...SC.event_types, v.event_type].filter(Boolean))].map(t => `<option ${t === v.event_type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      </div>
      <div class="f3">
        <label>Guests<input type="number" name="guests" value="${esc(v.guests ?? '')}" min="0"></label>
        <label>Package<select name="package_id"><option value="">Hall only</option>${pkgs.map(p => `<option value="${p.id}" ${p.id == v.package_id ? 'selected' : ''}>${esc(p.name)} — ${money(p.per_head)}</option>`).join('')}</select></label>
        <label>Status<select name="status">${['pending', 'confirmed', 'completed', 'cancelled'].filter(s => s === v.status || s === 'pending' && !b || (s === 'cancelled' ? can('cancel') : s === 'pending' ? can('confirm') || can('cancel') : can('confirm'))).map(s => `<option ${s === v.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      </div>
      <div id="bkMenuBox" class="menu-box"></div>
      ${allAddons.length ? `<p class="sec-t" style="margin-top:0">Add-ons</p><div class="perm-grid" style="grid-template-columns:repeat(3,1fr)">${allAddons.map(a => `<label><input type="checkbox" name="addon" value="${a.id}" ${chosen.has(a.id) ? 'checked' : ''}><div>${esc(a.name)}<span>${a.price == null ? 'price on request' : money(a.price) + (a.price_type === 'per head' ? ' / head' : '')}</span></div></label>`).join('')}</div>` : ''}
      <div class="f3">
        <label>Other extras / price for "on request" items<input type="number" name="extras" value="${esc(v.extras ?? 0)}"></label>
        <label>Discount<input type="number" name="discount" value="${esc(v.discount ?? 0)}"></label>
        <label>Total <span class="hint">blank = calculate</span><input type="number" name="total" id="bkTotal" value="" placeholder="${b ? money(b.total) : 'Auto'}"></label>
      </div>
      <label>Customer's notes<textarea name="notes" rows="2">${esc(v.notes)}</textarea></label>
      <label>Private notes (only you see these)<textarea name="admin_notes" rows="2">${esc(v.admin_notes)}</textarea></label>
      <p class="muted small" id="bkCalc"></p>
      <div class="mfoot"><span style="flex:1"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save booking</button></div>
    </form>`);
  const f = m.querySelector('#bkf');
  // ----- menu: starts from the package's dishes; admins remove, add and price dishes in a pop-up -----
  const curPkg = () => pkgs.find(x => String(x.id) === f.package_id.value);
  const fromPkg = p => (p?.items || []).map(name => ({ name, course: dishes.find(d => d.name.toLowerCase() === name.toLowerCase())?.course || '', price: 0, price_type: 'per head' }));
  let menu = []; try { menu = JSON.parse(b?.menu || '[]'); } catch {}
  if (!menu.length) menu = fromPkg(curPkg());
  const guestsNow = () => Number(f.guests.value) || 0;
  const mAmt = (d, g = guestsNow()) => (Number(d.price) || 0) * (d.price_type === 'per event' ? 1 : g);
  const menuTotal = () => menu.reduce((t, d) => t + mAmt(d), 0);
  const drawMenuBox = () => {
    const p = curPkg(), box = m.querySelector('#bkMenuBox');
    if (!p) { box.innerHTML = ''; return; }
    const mt = menuTotal();
    box.innerHTML = `<div class="menu-head"><p class="sec-t" style="margin:0">Menu · ${esc(p.name)}</p><button type="button" class="btn sm primary" id="bkMenuBtn">Choose / change dishes</button></div>
      ${menu.length ? `<div class="chips">${menu.map(d => `<span>${esc(d.name)}${Number(d.price) ? ` <b>+${money(d.price)}${d.price_type === 'per event' ? '' : '/head'}</b>` : ''}</span>`).join('')}</div>` : '<p class="muted small" style="margin:0">No dishes chosen yet.</p>'}
      ${mt ? `<p class="small" style="margin:6px 0 0">Menu changes add <b>${money(mt)}</b> to the total.</p>` : ''}`;
    box.querySelector('#bkMenuBtn').onclick = openMenu;
  };
  function openMenu() {
    const p = curPkg(); if (!p) return;
    let draft = menu.map(d => ({ ...d }));
    const ov = document.createElement('div'); ov.className = 'modal subm';
    const courses = [...new Set(dishes.filter(d => d.active).map(d => d.course || 'Other'))];
    ov.innerHTML = `<div class="modal-box" style="width:min(820px,100%)"><button type="button" class="x" data-mclose aria-label="Close">✕</button>
      <h3>Menu · ${esc(p.name)} <span class="muted" style="font-size:1rem;font-family:Jost">${money(p.per_head)} per head</span></h3>
      <p class="muted small" style="margin-top:-6px">These dishes are included in the package price. If the customer wants a change, remove the dish and add the new one. Put any extra charge in the price box and it is added to the total.</p>
      <table class="tbl menu-ed"><thead><tr><th>Dish</th><th style="width:130px">Extra price</th><th style="width:120px">Charged</th><th class="num" style="width:130px">Adds</th><th style="width:40px"></th></tr></thead><tbody id="meRows"></tbody></table>
      <div class="me-add"><input id="meNew" list="meList" placeholder="Add a dish — type a name or pick from the list below"><input id="meNewPrice" type="number" min="0" placeholder="Extra price"><select id="meNewType"><option>per head</option><option>per event</option></select><button type="button" class="btn primary" id="meAddBtn">+ Add dish</button></div>
      <datalist id="meList">${dishes.filter(d => d.active).map(d => `<option value="${esc(d.name)}">${esc(d.course)}${d.price ? ` · +${money(d.price)} ${d.price_type}` : ''}</option>`).join('')}</datalist>
      ${courses.length ? `<p class="sec-t">Quick add from Menu dishes</p><div class="me-pick">${courses.map(c => `<div><b>${esc(c)}</b>${dishes.filter(d => d.active && (d.course || 'Other') === c).map(d => `<button type="button" class="pickd" data-dish="${d.id}">${esc(d.name)}${d.price ? ` <i>+${money(d.price)}${d.price_type === 'per event' ? '' : '/head'}</i>` : ''}</button>`).join('')}</div>`).join('')}</div>` : ''}
      <div class="mfoot"><span id="meSum" style="flex:1"></span><button type="button" class="btn" id="meReset">Reset to package</button><button type="button" class="btn" data-mclose>Cancel</button><button type="button" class="btn primary" id="meSave">Save menu</button></div></div>`;
    document.body.append(ov);
    const rows = ov.querySelector('#meRows');
    const sum = () => { const g = guestsNow(), t = draft.reduce((a, d) => a + mAmt(d, g), 0);
      ov.querySelector('#meSum').innerHTML = `${draft.length} dishes · extra <b>${money(t)}</b>${g ? ` <span class="muted small">(${g.toLocaleString()} guests)</span>` : ' <span class="muted small">— enter guests for per-head charges</span>'}`;
      rows.querySelectorAll('tr').forEach((tr, i) => (tr.querySelector('.amt').textContent = mAmt(draft[i], g) ? '+' + money(mAmt(draft[i], g)) : 'included')); };
    const draw = () => {
      rows.innerHTML = draft.length ? draft.map((d, i) => `<tr data-i="${i}"><td><input class="mn" value="${esc(d.name)}">${d.course ? `<span class="muted small">${esc(d.course)}</span>` : ''}</td>
        <td><input class="mp" type="number" min="0" value="${Number(d.price) || ''}" placeholder="0"></td>
        <td><select class="mt"><option ${d.price_type !== 'per event' ? 'selected' : ''}>per head</option><option ${d.price_type === 'per event' ? 'selected' : ''}>per event</option></select></td>
        <td class="num amt"></td><td><button type="button" class="btn sm danger" data-rm="${i}" title="Remove dish">✕</button></td></tr>`).join('')
        : '<tr><td colspan="5" class="muted">No dishes. Add some below.</td></tr>';
      if (!draft.length) { ov.querySelector('#meSum').textContent = ''; return; }
      sum();
    };
    rows.oninput = e => { const tr = e.target.closest('tr[data-i]'); if (!tr) return; const d = draft[tr.dataset.i];
      d.name = tr.querySelector('.mn').value; d.price = Math.max(0, Number(tr.querySelector('.mp').value) || 0); d.price_type = tr.querySelector('.mt').value; sum(); };
    rows.onclick = e => { const r = e.target.closest('[data-rm]'); if (r) { draft.splice(Number(r.dataset.rm), 1); draw(); } };
    const add = (name, price, type, course) => {
      name = String(name || '').trim(); if (!name) return;
      if (draft.some(d => d.name.toLowerCase() === name.toLowerCase())) { toast(`${name} is already on the menu`, true); return; }
      const lib = dishes.find(d => d.name.toLowerCase() === name.toLowerCase());
      draft.push({ name: lib?.name || name, course: course ?? lib?.course ?? '', price: Math.max(0, Number(price) || 0), price_type: type || 'per head' }); draw();
    };
    const nIn = ov.querySelector('#meNew'), pIn = ov.querySelector('#meNewPrice'), tIn = ov.querySelector('#meNewType');
    nIn.oninput = () => { const lib = dishes.find(d => d.name.toLowerCase() === nIn.value.trim().toLowerCase()); if (lib) { pIn.value = lib.price || ''; tIn.value = lib.price_type || 'per head'; } };
    const addTyped = () => { add(nIn.value, pIn.value, tIn.value); nIn.value = ''; pIn.value = ''; nIn.focus(); };
    ov.querySelector('#meAddBtn').onclick = addTyped;
    nIn.onkeydown = pIn.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } };
    ov.querySelectorAll('[data-dish]').forEach(x => (x.onclick = () => { const d = dishes.find(y => String(y.id) === x.dataset.dish); add(d.name, d.price, d.price_type, d.course); }));
    ov.querySelector('#meReset').onclick = () => { draft = fromPkg(p); draw(); };
    const close = () => ov.remove();
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-mclose]')) close(); });
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    ov.querySelector('#meSave').onclick = () => {
      if (draft.some(d => !String(d.name).trim())) { toast('A dish has no name — type one or remove it', true); return; }
      menu = draft.map(d => ({ ...d, name: String(d.name).trim() })); close(); drawMenuBox(); calc();
    };
    draw();
  }
  let lastPkg = f.package_id.value;
  f.package_id.addEventListener('change', () => {
    if (f.package_id.value === lastPkg) return;
    lastPkg = f.package_id.value; menu = fromPkg(curPkg()); drawMenuBox(); calc();
    if (curPkg()) openMenu();
  });
  f.guests.addEventListener('input', drawMenuBox);
  const calc = () => {
    const fd = Object.fromEntries(new FormData(f)), p = pkgs.find(x => String(x.id) === fd.package_id), h = halls.find(x => String(x.id) === fd.hall_id);
    const g = Number(fd.guests) || 0, ids = new FormData(f).getAll('addon').map(Number);
    const adT = allAddons.filter(a => ids.includes(a.id)).reduce((t, a) => t + (a.price == null ? 0 : a.price_type === 'per head' ? a.price * g : a.price), 0);
    const mT = p ? menuTotal() : 0;
    const base = p ? p.per_head * g : (h?.hire_charge || 0), tot = base + mT + adT + (Number(fd.extras) || 0) - (Number(fd.discount) || 0);
    m.querySelector('#bkCalc').textContent = `Calculated total: ${money(tot)}${p ? ` (${g} × ${money(p.per_head)})` : ''}${mT ? ` + menu changes ${money(mT)}` : ''}${adT ? ` + add-ons ${money(adT)}` : ''}${h?.capacity && Number(fd.guests) > h.capacity ? ` · ⚠ over ${h.name}'s capacity of ${h.capacity}` : ''}`;
  };
  f.oninput = calc; drawMenuBox(); calc();
  if (preset.openMenu && curPkg()) openMenu();
  f.onsubmit = async e => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(f));
    body.addon_ids = new FormData(f).getAll('addon');
    body.menu = curPkg() ? menu : [];
    delete body.addon;
    try {
      if (b) await api(`/api/admin/bookings/${b.id}`, { method: 'PATCH', body });
      else { const r = await api('/api/admin/bookings', { method: 'POST', body }); b = { id: r.id }; }
      toast('Booking saved'); openBooking(b.id); refreshPending();
    } catch (ex) { toast(ex.message, true); }
  };
}

const rcptUrl = (type, id) => `/receipt?type=${type}&id=${id}`;
async function openBooking(id, flash = null) {
  const { booking: b, payments, history } = await api(`/api/admin/bookings/${id}`);
  const bal = b.total - b.paid, adv = Math.round(b.total * (SC.advance_percent || 0) / 100);
  let addons = []; try { addons = JSON.parse(b.addons || '[]'); } catch {}
  let menu = []; try { menu = JSON.parse(b.menu || '[]'); } catch {}
  const purposeOpts = [...SC.purposes.slice(0, 4), ...(b.menu_total ? ['Menu changes'] : []), ...addons.map(a => a.name), ...SC.purposes.slice(4)];
  const defPurpose = b.paid <= 0 ? 'Advance' : 'Remaining balance';
  const suggest = p => p === 'Advance' ? (adv || bal) : p === 'Remaining balance' ? bal : p === 'Full payment' ? b.total : p === 'Menu changes' ? b.menu_total : (addons.find(a => a.name === p)?.amount || '');
  const ph = intlPhone(b.phone);
  const msg = b.status === 'confirmed'
    ? `Assalam o Alaikum ${b.customer_name}, your ${b.event_type || 'event'} at Gul Makkai Palace is CONFIRMED for ${pd(b.date)} (${b.slot}), ${b.hall_name}, ${b.guests} guests. Ref ${b.ref}. Paid ${money(b.paid)}, balance ${money(bal)}.`
    : `Assalam o Alaikum ${b.customer_name}, thank you for your booking request (Ref ${b.ref}) for ${pd(b.date)} (${b.slot}). Please pay an advance of ${money(adv)} to confirm the date.`;
  const banner = flash === 'confirmed'
    ? `<div class="flash">✅ Booking confirmed. <a class="btn sm primary" href="${rcptUrl('booking', b.id)}" target="_blank" rel="noopener">Send confirmation receipt</a> <span class="muted small">Print it, WhatsApp it or email it from there.</span></div>`
    : flash && flash.tx ? `<div class="flash">💰 Payment recorded — receipt ${esc('R-' + String(flash.tx).padStart(6, '0'))}. <a class="btn sm primary" href="${rcptUrl('tx', flash.tx)}" target="_blank" rel="noopener">Open receipt</a> <span class="muted small">Print for signatures or send on WhatsApp.</span></div>` : '';
  const m = modal(`${banner}<h3>${esc(b.customer_name)} <span class="st ${b.status}" style="vertical-align:middle;font-family:Jost">${b.status}</span></h3>
    <p class="muted" style="margin:-8px 0 12px">${esc(b.ref)} · ${pd(b.date)} · ${esc(b.slot)} · ${esc(b.hall_name)} · ${esc(b.event_type)} · ${b.guests} guests${b.package_name ? ' · ' + esc(b.package_name) : ''}</p>
    <div class="money3"><div><span>Total</span><b>${money(b.total)}</b></div><div><span>Paid</span><b style="color:var(--good)">${money(b.paid)}</b></div><div><span>Balance</span><b style="color:${bal > 0 ? 'var(--bad)' : 'var(--good)'}">${money(bal)}</b></div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${b.status === 'pending' && can('confirm') ? '<button class="btn good" data-s="confirmed">Confirm booking</button>' : ''}
      ${b.status === 'confirmed' && b.date <= TODAY && can('confirm') ? '<button class="btn" data-s="completed">Mark completed</button>' : ''}
      ${['pending', 'confirmed'].includes(b.status) && can('cancel') ? '<button class="btn danger" data-s="cancelled">Cancel booking</button>' : ''}
      ${ph ? `<a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/${ph}?text=${encodeURIComponent(msg)}">WhatsApp customer</a><a class="btn" href="tel:${esc(b.phone)}">Call ${esc(b.phone)}</a>` : ''}
      <a class="btn" href="${rcptUrl('booking', b.id)}" target="_blank" rel="noopener">${b.status === 'pending' ? 'Request receipt' : 'Confirmation receipt'}</a>
      <button class="btn" id="bkEdit">Edit details</button>
    </div>
    ${menu.length ? `<div class="menu-head"><p class="sec-t">Menu${b.menu_total ? ` <span class="muted small" style="text-transform:none;letter-spacing:0">· changes add ${money(b.menu_total)}</span>` : ''}</p>${can('bookings') ? '<button class="btn sm" id="bkMenuEdit">Change menu</button>' : ''}</div><div class="chips">${menu.map(d => `<span>${esc(d.name)}${d.amount ? ` · +${money(d.amount)}` : ''}</span>`).join('')}</div>` : (b.package_id ? `<p class="sec-t">Menu</p><button class="btn sm" id="bkMenuEdit">Choose dishes</button>` : '')}
    ${addons.length ? `<p class="sec-t">Add-ons</p><div class="chips">${addons.map(a => `<span>${esc(a.name)} · ${a.price == null && !a.amount ? 'price on request' : money(a.amount)}</span>`).join('')}</div>` : ''}
    ${b.notes ? `<p class="sec-t">Special arrangements / notes</p><p style="margin:0">${esc(b.notes)}</p>` : ''}
    ${b.admin_notes ? `<p class="sec-t">Private notes</p><p style="margin:0">${esc(b.admin_notes)}</p>` : ''}
    <p class="sec-t">Payments</p>
    ${payments.length ? `<table class="tbl"><tbody>${payments.map(p => `<tr><td>${pd(p.date)}</td><td><b>${esc(p.purpose || '—')}</b></td><td>${esc(p.method)}</td><td class="muted small">received by ${esc(p.recorded_by || '—')}</td><td class="num in">${money(p.amount)}</td><td style="white-space:nowrap"><a class="btn sm" href="${rcptUrl('tx', p.id)}" target="_blank" rel="noopener">Receipt</a> ${can('delete') ? `<button class="btn sm danger" data-delpay="${p.id}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small" style="margin:0">No payments yet.</p>'}
    <form class="paybox" id="payf" ${can('payments') ? '' : 'hidden'}>
      <div class="f2" style="align-items:end"><label>Payment for<select name="purpose" id="payFor">${purposeOpts.map(o => `<option ${o === defPurpose ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
      <label>Details <span class="hint">optional, printed on the receipt</span><input name="note" maxlength="200" placeholder="e.g. stage theme, extra 50 guests"></label></div>
      <div class="f3" style="align-items:end">
      <label>Amount<input type="number" name="amount" id="payAmt" min="1" placeholder="${Math.round(suggest(defPurpose) || 0) || ''}" required></label>
      <label>Date<input type="date" name="date" value="${TODAY}"></label>
      <label>Method<select name="method">${SC.methods.map(x => `<option>${esc(x)}</option>`).join('')}</select></label></div>
      <button class="btn primary">Record payment</button> <span class="muted small">Adds it to Cashflow as income.</span></form>
    <p class="sec-t">History</p>${actList(history.slice().reverse())}
    <div class="mfoot">${b.paid || !can('delete') ? '' : '<button class="btn danger" id="bkDel">Delete booking</button>'}<span style="flex:1"></span><button class="btn" data-close>Close</button></div>`);
  m.querySelectorAll('[data-s]').forEach(x => (x.onclick = async () => {
    if (x.dataset.s === 'cancelled' && !confirm('Cancel this booking? The date becomes free again.')) return;
    try { await api(`/api/admin/bookings/${id}`, { method: 'PATCH', body: { status: x.dataset.s } }); toast(`Marked ${x.dataset.s}`); openBooking(id, x.dataset.s === 'confirmed' ? 'confirmed' : null); refreshAfter(); } catch (ex) { toast(ex.message, true); }
  }));
  m.querySelector('#bkEdit').onclick = () => bookingForm(b);
  m.querySelector('#bkMenuEdit')?.addEventListener('click', () => bookingForm(b, { openMenu: true }));
  const pf = m.querySelector('#payFor');
  if (pf) pf.onchange = () => { const s = suggest(pf.value); m.querySelector('#payAmt').placeholder = s ? Math.round(s) : ''; };
  m.querySelector('#payf').onsubmit = async e => {
    e.preventDefault();
    try { const r = await api(`/api/admin/bookings/${id}/payments`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Payment recorded'); openBooking(id, { tx: r.tx_id }); refreshAfter(); } catch (ex) { toast(ex.message, true); }
  };
  m.querySelectorAll('[data-delpay]').forEach(x => (x.onclick = async () => {
    if (!confirm('Delete this payment?')) return;
    await api(`/api/admin/transactions/${x.dataset.delpay}`, { method: 'DELETE' }); toast('Payment deleted'); openBooking(id); refreshAfter();
  }));
  const del = m.querySelector('#bkDel');
  if (del) del.onclick = async () => { if (!confirm('Delete this booking permanently?')) return; try { await api(`/api/admin/bookings/${id}`, { method: 'DELETE' }); closeModal(); toast('Deleted'); refreshAfter(); } catch (ex) { toast(ex.message, true); } };
}
function refreshAfter() { const v = location.hash.slice(1); if (v === 'bookings') vBookingsList(); else if (VIEWS[v]) { $('#topActions').innerHTML = ''; VIEWS[v][1](); } refreshPending(); }

// ---------- calendar ----------
let calMonth = '';
async function vCalendar() {
  $('#topActions').innerHTML = '';
  calMonth = calMonth || TODAY.slice(0, 7);
  topBtn('‹', () => { calMonth = addMonths(calMonth, -1); vCalendar(); }, '');
  topBtn('Today', () => { calMonth = TODAY.slice(0, 7); vCalendar(); }, '');
  topBtn('›', () => { calMonth = addMonths(calMonth, 1); vCalendar(); }, '');
  topBtn('+ New booking', () => bookingForm());
  $('#viewTitle').textContent = 'Calendar · ' + monthName(calMonth);
  const list = await api(`/api/admin/bookings?from=${calMonth}-01&to=${monthEnd(calMonth)}`);
  const lead = (new Date(calMonth + '-01T12:00:00').getDay() + 6) % 7, days = Number(monthEnd(calMonth).slice(8));
  let html = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="dow">${d}</div>`).join('') + '<div class="d blank"></div>'.repeat(lead);
  for (let i = 1; i <= days; i++) {
    const d = `${calMonth}-${String(i).padStart(2, '0')}`, evs = list.filter(b => b.date === d);
    html += `<div class="d ${d < TODAY ? 'past' : ''} ${d === TODAY ? 'today' : ''}" data-d="${d}"><span class="n">${i}</span>
      ${evs.map(b => `<span class="ev ${b.status}" data-id="${b.id}" title="${esc(b.slot)} · ${esc(b.hall_name)} · ${esc(b.customer_name)}">${esc(b.slot)} · ${esc(b.customer_name)}</span>`).join('')}</div>`;
  }
  $('#view').innerHTML = `<div class="cal">${html}</div><div class="key" style="margin-top:14px"><span><i style="background:#f3d9a6"></i>Request</span><span><i style="background:#bfe3cc"></i>Confirmed</span><span><i style="background:#c9d8f3"></i>Completed</span><span><i style="background:#ddd"></i>Cancelled</span><span>Click a day to add a booking.</span></div>`;
  $$('.cal .d[data-d]').forEach(c => (c.onclick = e => { const ev = e.target.closest('.ev'); ev ? openBooking(ev.dataset.id) : bookingForm(null, { date: c.dataset.d }); }));
}

// ---------- generic tables ----------
async function vTable(t) {
  $('#topActions').innerHTML = '';
  const def = SC.tables[t];
  topBtn(`+ Add ${def.singular}`, () => rowForm(t));
  if (t === 'employees') topBtn('Export CSV', () => download('employees'), '');
  const rows = await api('/api/admin/t/' + t);
  const thumb = r => { const u = r.photo || r.image || (r.images || [])[0]; return u ? `<span class="th" style="background-image:url('${esc(u)}')"></span>` : '<span class="th">✦</span>'; };
  const sub = r => t === 'dishes' ? `${esc(r.course || '')} · ${r.price ? `+${money(r.price)} ${r.price_type}` : 'no extra charge'}` : t === 'addons' ? (r.price == null ? 'Price on request' : `${money(r.price)} ${r.price_type}`) + (r.description ? ' · ' + esc(r.description) : '') : t === 'packages' ? `${money(r.per_head)} per head · ${(r.items || []).length} dishes` : t === 'halls' ? `${r.capacity || '?'} guests` : t === 'employees' ? `${esc(r.role || '')} · ${money(r.salary)} / month · ${esc(r.phone || '')}` : t === 'offers' ? (r.valid_until ? `until ${pd(r.valid_until)}` : 'no end date') : esc(r[def.subField] || '');
  const off = r => ('active' in r && !r.active) || r.status === 'left';
  $('#view').innerHTML = rows.length ? `<div class="items">${rows.map(r => `<div class="item ${off(r) ? 'off' : ''}" data-id="${r.id}">${thumb(r)}
      <div class="title"><b>${esc(r[def.titleField])}</b>${r.highlight ? ' <span class="st confirmed">popular</span>' : ''}${t === 'employees' ? ` <span class="st ${r.status}">${r.status}</span>` : ''}${off(r) && t !== 'employees' ? ' <span class="st left">hidden</span>' : ''}<div>${sub(r)}</div></div>
      <span class="muted">Edit →</span></div>`).join('')}</div>`
    : `<div class="panel"><p class="empty">Nothing here yet. Click "+ Add ${esc(def.singular)}".</p></div>`;
  $$('.item').forEach(el => (el.onclick = () => rowForm(t, rows.find(r => String(r.id) === el.dataset.id))));
}
async function rowForm(t, r = null) {
  const def = SC.tables[t];
  const short = def.fields.filter(f => ['text', 'number', 'date', 'select'].includes(f.type)), long = def.fields.filter(f => !short.includes(f));
  const m = modal(`<h3>${r ? 'Edit' : 'New'} ${esc(def.singular)}</h3><form id="rf">
    <div class="f2">${short.map(f => field(f, r?.[f.key])).join('')}</div>${long.map(f => field(f, r?.[f.key])).join('')}
    ${t === 'employees' && r ? '<p class="sec-t">Salary history</p><div id="hist" class="muted small">Loading…</div>' : ''}
    <div class="mfoot">${r && can('delete') ? '<button type="button" class="btn danger" id="rDel">Delete</button>' : ''}<span style="flex:1"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>`);
  const f = m.querySelector('#rf'); wire(f);
  if (t === 'employees' && r) {
    const h = await api(`/api/admin/employees/${r.id}/history`);
    m.querySelector('#hist').innerHTML = h.length ? `<table class="tbl">${h.map(p => `<tr><td>${monthName(p.month)}</td><td>${pd(p.paid_on)}</td><td>${esc(p.method)}</td><td class="muted small">by ${esc(p.paid_by || '—')}</td><td class="num">${money(p.net)}</td></tr>`).join('')}</table>` : 'No salary paid yet.';
  }
  f.onsubmit = async e => {
    e.preventDefault();
    try { await api(r ? `/api/admin/t/${t}/${r.id}` : `/api/admin/t/${t}`, { method: r ? 'PUT' : 'POST', body: read(f) }); closeModal(); toast('Saved'); vTable(t); }
    catch (ex) { toast(ex.message, true); }
  };
  const d = m.querySelector('#rDel');
  if (d) d.onclick = async () => { if (!confirm(`Delete "${r[def.titleField]}"?`)) return; try { await api(`/api/admin/t/${t}/${r.id}`, { method: 'DELETE' }); closeModal(); toast('Deleted'); vTable(t); } catch (ex) { toast(ex.message, true); } };
}

// ---------- gallery ----------
async function vGallery() {
  const list = await api('/api/admin/gallery');
  $('#view').innerHTML = `<label class="drop" id="drop"><input type="file" id="gFiles" accept="image/*" multiple hidden><strong>Click or drop photos here</strong><span class="muted">Phone photos are fine — they're resized automatically</span></label>
    <div class="gal">${list.map(g => `<div class="gi" data-id="${g.id}"><img src="${esc(g.image)}" alt="" loading="lazy"><div class="row"><input value="${esc(g.caption)}" placeholder="Caption"><button class="btn sm danger" type="button">✕</button></div></div>`).join('') || '<p class="empty">No photos yet.</p>'}</div>`;
  const up = async files => { if (!files.length) return; const fd = new FormData(); [...files].forEach(f => fd.append('images', f)); toast(`Uploading ${files.length} photo(s)…`); try { const r = await api('/api/admin/gallery', { method: 'POST', body: fd }); toast(`${r.added} added`); vGallery(); } catch (ex) { toast(ex.message, true); } };
  $('#gFiles').onchange = e => up(e.target.files);
  const dr = $('#drop');
  ['dragenter', 'dragover'].forEach(ev => dr.addEventListener(ev, e => { e.preventDefault(); dr.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dr.addEventListener(ev, e => { e.preventDefault(); dr.classList.remove('over'); }));
  dr.addEventListener('drop', e => up(e.dataTransfer.files));
  $$('.gi').forEach(el => {
    el.querySelector('input').onchange = async e => { await api(`/api/admin/gallery/${el.dataset.id}`, { method: 'PATCH', body: { caption: e.target.value } }); toast('Caption saved'); };
    el.querySelector('button').onclick = async () => { if (!confirm('Delete this photo?')) return; await api(`/api/admin/gallery/${el.dataset.id}`, { method: 'DELETE' }); vGallery(); };
  });
}

// ---------- cashflow ----------
const cf = { range: 'month', from: '', to: '', type: '', category: '', q: '' };
function cfRange() {
  const m = TODAY.slice(0, 7);
  if (cf.range === 'month') return [m + '-01', TODAY];
  if (cf.range === 'last') { const l = addMonths(m, -1); return [l + '-01', monthEnd(l)]; }
  if (cf.range === 'year') return [TODAY.slice(0, 4) + '-01-01', TODAY];
  return [cf.from || m + '-01', cf.to || TODAY];
}
async function vCashflow() {
  $('#topActions').innerHTML = '';
  topBtn('Export CSV', () => download('transactions'), '');
  topBtn('+ Expense', () => txForm(null, 'expense'), '');
  topBtn('+ Income', () => txForm(null, 'income'));
  const [from, to] = cfRange();
  const p = new URLSearchParams({ from, to }); if (cf.type) p.set('type', cf.type); if (cf.category) p.set('category', cf.category); if (cf.q) p.set('q', cf.q);
  const [sum, list] = await Promise.all([api(`/api/admin/finance?from=${from}&to=${to}`), api('/api/admin/transactions?' + p)]);
  const net = sum.income - sum.expense, maxCat = Math.max(1, ...sum.by_category.map(c => c.s));
  $('#view').innerHTML = `<div class="filters">
      <div class="seg" id="cfR">${[['month', 'This month'], ['last', 'Last month'], ['year', 'This year'], ['custom', 'Custom']].map(([k, l]) => `<button type="button" data-r="${k}" class="${cf.range === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <span id="cfCustom" ${cf.range === 'custom' ? '' : 'hidden'}><input type="date" id="cfFrom" value="${from}"> to <input type="date" id="cfTo" value="${to}"></span>
      <span class="muted small">${pd(from)} – ${pd(to)}</span></div>
    <div class="tiles"><div class="tile good"><span>Money in</span><b>${money(sum.income)}</b></div><div class="tile bad"><span>Money out</span><b>${money(sum.expense)}</b></div>
      <div class="tile ${net >= 0 ? 'good' : 'bad'}"><span>Net</span><b>${money(net)}</b></div></div>
    <div class="panel"><h3>By category</h3>${sum.by_category.length ? sum.by_category.map(c => `<div class="catbar"><span>${esc(c.category)}</span><span class="t"><i style="width:${(c.s / maxCat) * 100}%;background:${c.type === 'income' ? 'var(--good)' : '#d9826f'}"></i></span><b class="num" style="text-align:right">${c.type === 'income' ? '+' : '−'}${money(c.s)}</b></div>`).join('') : '<p class="empty">Nothing recorded in this period.</p>'}</div>
    <div class="filters"><select id="cfType"><option value="">In and out</option><option value="income" ${cf.type === 'income' ? 'selected' : ''}>Money in</option><option value="expense" ${cf.type === 'expense' ? 'selected' : ''}>Money out</option></select>
      <select id="cfCat"><option value="">All categories</option>${[...SC.income, ...SC.expense].map(c => `<option ${cf.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <input id="cfQ" class="grow" placeholder="Search description…" value="${esc(cf.q)}"></div>
    <div class="panel np scroll">${list.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Method</th><th>By</th><th class="num">Amount</th></tr></thead><tbody>
      ${list.map(x => `<tr class="click" data-id="${x.id}"><td>${pd(x.date)}</td><td>${esc(x.category)}</td><td>${esc(x.description)}${x.booking_ref ? ` <span class="st confirmed">${esc(x.booking_ref)}</span>` : ''}</td><td>${esc(x.method)}</td><td class="muted small">${esc(x.recorded_by || '—')}<br><a href="${rcptUrl('tx', x.id)}" target="_blank" rel="noopener" data-rc>Receipt</a></td>
      <td class="num ${x.type === 'income' ? 'in' : 'out'}">${x.type === 'income' ? '+' : '−'}${money(x.amount)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No entries.</p>'}</div>`;
  $('#cfR').onclick = e => { const b = e.target.closest('button'); if (!b) return; cf.range = b.dataset.r; vCashflow(); };
  if ($('#cfFrom')) { $('#cfFrom').onchange = e => { cf.from = e.target.value; vCashflow(); }; $('#cfTo').onchange = e => { cf.to = e.target.value; vCashflow(); }; }
  $('#cfType').onchange = e => { cf.type = e.target.value; vCashflow(); };
  $('#cfCat').onchange = e => { cf.category = e.target.value; vCashflow(); };
  let t; $('#cfQ').oninput = e => { clearTimeout(t); t = setTimeout(() => { cf.q = e.target.value.trim(); vCashflow(); }, 400); };
  $$('#view tr[data-id]').forEach(r => (r.onclick = e => { if (!e.target.closest('[data-rc]')) txForm(list.find(x => String(x.id) === r.dataset.id)); }));
  $('#topActions').innerHTML = ''; topBtn('Export CSV', () => download('transactions'), ''); topBtn('+ Expense', () => txForm(null, 'expense'), ''); topBtn('+ Income', () => txForm(null, 'income'));
}
function txForm(x = null, type = 'income') {
  type = x?.type || type;
  if (x?.salary_payment_id) { window.open(rcptUrl('tx', x.id), '_blank'); return toast('Salary entries are edited in Payroll — opened the receipt'); }
  const cats = type === 'income' ? SC.income : SC.expense;
  const m = modal(`<h3>${x ? 'Edit' : 'Add'} ${type === 'income' ? 'money in' : 'money out'}</h3><form id="txf">
    <div class="f2"><label>Amount<input type="number" name="amount" min="1" value="${esc(x?.amount ?? '')}" required></label>
    <label>Date<input type="date" name="date" value="${esc(x?.date || TODAY)}"></label>
    <label>Category<select name="category" ${x?.booking_id ? 'disabled' : ''}>${cats.map(c => `<option ${c === x?.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
    <label>Method<select name="method">${SC.methods.map(c => `<option ${c === x?.method ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label></div>
    <label>Description<input name="description" value="${esc(x?.description)}" placeholder="${type === 'income' ? 'e.g. Parking fees for 12 Nov event' : 'e.g. LESCO bill, 40 kg rice, generator diesel'}"></label>
    <input type="hidden" name="type" value="${type}">
    ${x ? `<p class="muted small">Recorded by ${esc(x.recorded_by || '—')} · receipt R-${String(x.id).padStart(6, '0')} · <a href="${rcptUrl('tx', x.id)}" target="_blank" rel="noopener">Print receipt</a></p>` : ''}<div class="mfoot">${x && can('delete') ? '<button type="button" class="btn danger" id="txDel">Delete</button>' : ''}<span style="flex:1"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>`);
  const f = m.querySelector('#txf');
  f.onsubmit = async e => {
    e.preventDefault();
    try { await api(x ? `/api/admin/transactions/${x.id}` : '/api/admin/transactions', { method: x ? 'PUT' : 'POST', body: Object.fromEntries(new FormData(f)) }); closeModal(); toast('Saved'); vCashflow(); }
    catch (ex) { toast(ex.message, true); }
  };
  const d = m.querySelector('#txDel');
  if (d) d.onclick = async () => { if (!confirm('Delete this entry?')) return; await api(`/api/admin/transactions/${x.id}`, { method: 'DELETE' }); closeModal(); toast('Deleted'); vCashflow(); };
}

// ---------- payroll ----------
let payMonth = '';
async function vPayroll() {
  $('#topActions').innerHTML = '';
  payMonth = payMonth || TODAY.slice(0, 7);
  topBtn('‹', () => { payMonth = addMonths(payMonth, -1); vPayroll(); }, '');
  topBtn('›', () => { payMonth = addMonths(payMonth, 1); vPayroll(); }, '');
  topBtn('Export CSV', () => download('payroll'), '');
  $('#viewTitle').textContent = 'Payroll · ' + monthName(payMonth);
  const { staff } = await api('/api/admin/payroll?month=' + payMonth);
  const paid = staff.filter(s => s.payment_id), due = staff.filter(s => !s.payment_id);
  const totPaid = paid.reduce((a, s) => a + s.net, 0), totDue = due.reduce((a, s) => a + (s.salary || 0), 0);
  $('#view').innerHTML = `<div class="tiles"><div class="tile"><span>Staff</span><b>${staff.length}</b></div><div class="tile good"><span>Paid this month</span><b>${money(totPaid)}</b><small>${paid.length} people</small></div>
    <div class="tile warn"><span>Still to pay</span><b>${money(totDue)}</b><small>${due.length} people</small></div></div>
    ${staff.length ? `<div class="panel np scroll"><table class="tbl"><thead><tr><th>Employee</th><th class="num">Salary</th><th>Bonus</th><th>Deduction / advance</th><th>Method</th><th class="num">Net</th><th></th></tr></thead><tbody>
    ${staff.map(s => s.payment_id ? `<tr><td><b>${esc(s.name)}</b><br><span class="muted small">${esc(s.role || '')}</span></td><td class="num">${money(s.base)}</td><td>${money(s.bonus)}</td><td>${money(s.deduction)}</td><td>${esc(s.method)}<br><span class="muted small">${pd(s.paid_on)} · by ${esc(s.paid_by || '—')}</span></td>
        <td class="num"><b>${money(s.net)}</b></td><td style="white-space:nowrap"><span class="st paid">paid</span> ${s.transaction_id ? `<a class="btn sm" href="${rcptUrl('tx', s.transaction_id)}" target="_blank" rel="noopener">Receipt</a>` : ''} <button class="btn sm danger" data-undo="${s.payment_id}" title="Undo payment">Undo</button></td></tr>`
      : `<tr data-emp="${s.id}"><td><b>${esc(s.name)}</b><br><span class="muted small">${esc(s.role || '')}</span></td><td class="num"><input type="number" class="pb" value="${s.salary || 0}" style="width:110px"></td>
        <td><input type="number" class="pbo" value="0" style="width:100px"></td><td><input type="number" class="pde" value="0" style="width:110px"></td>
        <td><select class="pme">${SC.methods.map(x => `<option>${esc(x)}</option>`).join('')}</select></td><td class="num"><b class="pnet">${money(s.salary)}</b></td>
        <td><button class="btn sm good" data-pay="${s.id}">Pay</button></td></tr>`).join('')}</tbody></table></div>
    <p class="muted small">Paying a salary adds it to Cashflow as an expense under "Salaries". Undo removes both.</p>`
    : `<div class="panel"><p class="empty">No active employees. Add staff under <a href="#t:employees" onclick="go('t:employees');return false">Employees</a> first.</p></div>`}`;
  $$('tr[data-emp]').forEach(tr => {
    const upd = () => (tr.querySelector('.pnet').textContent = money((+tr.querySelector('.pb').value || 0) + (+tr.querySelector('.pbo').value || 0) - (+tr.querySelector('.pde').value || 0)));
    tr.oninput = upd;
    tr.querySelector('[data-pay]').onclick = async () => {
      try {
        await api('/api/admin/payroll', { method: 'POST', body: { employee_id: tr.dataset.emp, month: payMonth, base: tr.querySelector('.pb').value, bonus: tr.querySelector('.pbo').value, deduction: tr.querySelector('.pde').value, method: tr.querySelector('.pme').value } });
        toast('Salary paid and added to Cashflow'); vPayroll();
      } catch (ex) { toast(ex.message, true); }
    };
  });
  $$('[data-undo]').forEach(b => (b.onclick = async () => { if (!confirm('Undo this salary payment? It is also removed from Cashflow.')) return; await api('/api/admin/payroll/' + b.dataset.undo, { method: 'DELETE' }); toast('Payment undone'); vPayroll(); }));
}

// ---------- settings + account ----------
async function vSettings() {
  const s = await api('/api/admin/settings');
  $('#view').innerHTML = `<form id="sf">${SC.settings.map(g => `<div class="panel"><h3>${esc(g.group)}</h3>${g.fields.map(f => field(f, s[f.key])).join('')}</div>`).join('')}
    <div class="savebar"><button class="btn primary">Save settings</button></div></form>`;
  const f = $('#sf'); wire(f);
  f.onsubmit = async e => { e.preventDefault(); try { await api('/api/admin/settings', { method: 'PUT', body: read(f) }); SC = await api('/api/admin/schema'); toast('Saved — refresh the website to see it'); } catch (ex) { toast(ex.message, true); } };
}
async function vAccount() {
  const me = await api('/api/admin/me');
  $('#view').innerHTML = `<form class="panel" id="af" style="max-width:520px"><h3>Login details</h3><p class="muted small" style="margin-top:-6px">Signed in as <b>${esc(me.username)}</b></p>
    <label>Display name <span class="hint">shown next to everything you do</span><input name="name" value="${esc(me.name)}"></label>
    <label>New username <span class="hint">optional</span><input name="new_username" autocomplete="username"></label>
    <label>New password <span class="hint">at least 8 characters</span><input name="new_password" type="password" autocomplete="new-password"></label>
    <label>Current password<input name="current_password" type="password" required autocomplete="current-password"></label>
    <button class="btn primary">Update account</button></form>`;
  $('#af').onsubmit = async e => { e.preventDefault(); try { await api('/api/admin/account', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); ME = (await api('/api/admin/schema')).me; $('#whoami').innerHTML = `${esc(ME.name)}<small>${isOwner() ? 'Owner · grand admin' : 'Admin'}</small>`; toast('Account updated'); vAccount(); } catch (ex) { toast(ex.message, true); } };
}

// ---------- reports & audit ----------
async function vReports() {
  const { closings, today } = await api('/api/admin/closings');
  const y = today.slice(0, 4), m = today.slice(0, 7), lastM = addMonths(m, -1);
  const open = (q) => window.open('/report?' + q, '_blank');
  const changed = closings.filter(c => !c.verified);
  const todayClosed = closings.some(c => c.date === today);
  $('#view').innerHTML = `
    <div class="tiles">
      <div class="tile click" data-r="kind=day&v=${today}"><span>Today's day book</span><b style="font-size:1.2rem">${pd(today)}</b><small>Print at the end of the day</small></div>
      <div class="tile click" data-r="kind=day&v=${addDays(today, -1)}"><span>Yesterday</span><b style="font-size:1.2rem">${pd(addDays(today, -1))}</b><small>Closed and sealed</small></div>
      <div class="tile click" data-r="kind=month&v=${m}"><span>This month</span><b style="font-size:1.2rem">${monthName(m)}</b><small>Monthly report</small></div>
      <div class="tile click" data-r="kind=month&v=${lastM}"><span>Last month</span><b style="font-size:1.2rem">${monthName(lastM)}</b><small>Monthly report</small></div>
      <div class="tile click" data-r="kind=year&v=${y}"><span>This year</span><b style="font-size:1.2rem">${y}</b><small>Annual report for tax / audit</small></div>
    </div>
    <div class="panel"><h3>Any period</h3>
      <div class="filters" style="margin:0"><input type="date" id="rpF" value="${m}-01"> to <input type="date" id="rpT" value="${today}"> <button class="btn primary" id="rpGo">Open report</button>
      <a class="btn" href="/api/admin/export/transactions">Export every entry (CSV)</a><a class="btn" href="/api/admin/export/closings">Export day closings (CSV)</a></div>
      <p class="muted small" style="margin:10px 0 0">Each report lists every entry with its receipt number and who recorded it, totals by category and payment method, events, money still owed, the day-closing audit trail, and lines for signatures. Use "Print / Save as PDF" on the report.</p></div>
    <div class="panel ${changed.length ? '' : ''}"><h3>Day closings</h3>
      <p class="muted small" style="margin-top:-4px">Every night at midnight (Pakistan time) the day is closed automatically: its entries are counted, totalled and sealed. After that, only the owner can add or change entries for that day, and every such change is flagged in the reports.</p>
      ${changed.length ? `<p class="err" style="margin-bottom:10px">⚠ ${changed.length} closed day(s) were changed after closing: ${changed.map(c => pd(c.date)).join(', ')}. Open the report for that day to see what changed and who did it.</p>` : ''}
      ${isOwner() && !todayClosed ? `<p><button class="btn" id="closeToday">Close today now (${pd(today)})</button> <span class="muted small">Optional — use it after the last payment of the day. Otherwise it closes at midnight.</span></p>` : ''}
      ${closings.length ? `<table class="tbl"><thead><tr><th>Day</th><th class="num">Entries</th><th class="num">In</th><th class="num">Out</th><th>Closed by</th><th>Status</th><th></th></tr></thead><tbody>
        ${closings.map(c => `<tr><td>${pd(c.date)}</td><td class="num">${c.tx_count}</td><td class="num in">${money(c.income)}</td><td class="num out">${money(c.expense)}</td><td class="muted small">${esc(c.closed_by)}<br>${when(c.closed_at)}</td>
          <td>${c.verified ? '<span class="st confirmed">✔ unchanged</span>' : '<span class="st cancelled">⚠ changed</span>'}</td><td><button class="btn sm" data-r="kind=day&v=${c.date}">Report</button></td></tr>`).join('')}</tbody></table>`
        : '<p class="empty">No days closed yet. The first close happens tonight at midnight, once there are entries.</p>'}
    </div>`;
  $$('[data-r]').forEach(el => (el.onclick = () => open(el.dataset.r)));
  $('#rpGo').onclick = () => open(`kind=range&from=${$('#rpF').value}&to=${$('#rpT').value}`);
  const ct = $('#closeToday');
  if (ct) ct.onclick = async () => {
    if (!confirm(`Close ${pd(today)} now? After this, only you (the owner) can add or change today's entries, and any change will be flagged.`)) return;
    try { await api('/api/admin/closings/close', { method: 'POST', body: { date: today } }); toast('Today is closed and sealed'); vReports(); } catch (ex) { toast(ex.message, true); }
  };
}
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// ---------- team: admins (owner only) ----------
const PRESETS = { all: () => SC.permissions.map(p => p.key), bookings: () => ['bookings', 'confirm', 'payments'], none: () => [] };
async function vAdmins() {
  topBtn('+ Add admin', () => adminForm());
  const list = await api('/api/admin/admins');
  const label = k => SC.permissions.find(p => p.key === k)?.label || k;
  $('#view').innerHTML = `<p class="muted" style="margin:0 0 14px">Everyone sees the same bookings and records. Each admin only gets the areas you tick, and everything they do is signed with their name.</p>
    <div class="items">${list.map(a => `<div class="item ${a.active ? '' : 'off'}" data-id="${a.id}">
      <span class="th" style="background:${a.role === 'owner' ? 'var(--gold)' : '#e6efe9'};color:var(--em2);font-weight:700">${esc((a.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span>
      <div class="title"><b>${esc(a.name)}</b> <span class="muted small">@${esc(a.username)}</span> ${a.role === 'owner' ? '<span class="st role-owner">Owner</span>' : ''} ${a.active ? '' : '<span class="st left">switched off</span>'}
        <div>${a.role === 'owner' ? 'Full access + manages admins' : `<span class="chips">${a.permissions.length ? a.permissions.map(p => `<span>${esc(label(p))}</span>`).join('') : '<span>No access yet</span>'}</span>`}</div>
        <div>${a.last_login ? 'Last login ' + when(a.last_login) : 'Never logged in'} · ${a.actions} actions</div></div>
      <span class="muted">Manage →</span></div>`).join('')}</div>`;
  $$('.item').forEach(el => (el.onclick = () => adminForm(list.find(a => String(a.id) === el.dataset.id))));
}
function adminForm(a = null) {
  const owner = a?.role === 'owner';
  const perms = new Set(a ? a.permissions : PRESETS.bookings());
  const m = modal(`<h3>${a ? esc(a.name) : 'New admin'}${owner ? ' <span class="st role-owner" style="font-family:Jost">Owner</span>' : ''}</h3>
    <form id="adf">
      <div class="f3"><label>Name<input name="name" value="${esc(a?.name)}" required placeholder="e.g. Imran"></label>
        <label>Username<input name="username" value="${esc(a?.username)}" required autocomplete="off"></label>
        <label>${a ? 'New password <span class="hint">leave blank to keep</span>' : 'Password <span class="hint">min 8 characters</span>'}<input name="password" type="password" autocomplete="new-password" ${a ? '' : 'required'}></label></div>
      ${owner ? '<p class="muted">The owner always has full access and is the only one who can manage admins.</p>' : `
      <p class="sec-t" style="margin-top:4px">What can ${a ? esc(a.name) : 'this admin'} do?</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px"><button type="button" class="btn sm" data-preset="bookings">Bookings, confirming + payments</button><button type="button" class="btn sm" data-preset="all">Everything</button><button type="button" class="btn sm" data-preset="none">Nothing</button></div>
      <div class="perm-grid">${SC.permissions.map(p => `<label><input type="checkbox" name="perm" value="${p.key}" ${perms.has(p.key) ? 'checked' : ''}><div>${esc(p.label)}<span>${esc(p.hint)}</span></div></label>`).join('')}</div>
      ${a ? `<label class="check"><input type="checkbox" name="active" ${a.active ? 'checked' : ''}> Account switched on (untick to block this admin from logging in)</label>` : ''}`}
      ${a ? '<p class="sec-t">Recent activity</p><div id="adAct" class="muted small">Loading…</div>' : ''}
      <div class="mfoot">${a && !owner && a.active ? '<button type="button" class="btn" id="mkOwner">Make owner…</button>' : ''}<span style="flex:1"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${a ? 'Save changes' : 'Add admin'}</button></div>
    </form>`);
  const f = m.querySelector('#adf');
  m.querySelectorAll('[data-preset]').forEach(b => (b.onclick = () => { const on = new Set(PRESETS[b.dataset.preset]()); f.querySelectorAll('[name=perm]').forEach(c => (c.checked = on.has(c.value))); }));
  if (a) api(`/api/admin/activity?admin_id=${a.id}&limit=15`).then(l => (m.querySelector('#adAct').innerHTML = actList(l)));
  f.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(f), body = { name: fd.get('name'), username: fd.get('username'), permissions: fd.getAll('perm') };
    if (fd.get('password')) body.password = fd.get('password');
    if (a && !owner) body.active = !!f.querySelector('[name=active]')?.checked;
    try { await api(a ? `/api/admin/admins/${a.id}` : '/api/admin/admins', { method: a ? 'PUT' : 'POST', body }); closeModal(); toast(a ? 'Saved' : `Admin added. They can log in at ${location.origin}/admin`); vAdmins(); }
    catch (ex) { toast(ex.message, true); }
  };
  const mo = m.querySelector('#mkOwner');
  if (mo) mo.onclick = async () => {
    const pw = prompt(`Hand ownership to ${a.name}? You will become a normal admin with full access.\n\nType YOUR password to confirm:`);
    if (!pw) return;
    try { await api(`/api/admin/admins/${a.id}/make-owner`, { method: 'POST', body: { password: pw } }); toast(`${a.name} is now the owner`); location.reload(); } catch (ex) { toast(ex.message, true); }
  };
}

// ---------- team: activity ----------
const af = { admin: '', entity: '' };
async function vActivity() {
  const p = new URLSearchParams({ limit: 500 });
  let admins = [];
  if (isOwner()) { admins = await api('/api/admin/admins'); p.set('admin_id', af.admin || 'all'); topBtn('Export CSV', () => download('activity'), ''); }
  if (af.entity) p.set('entity', af.entity);
  $('#viewTitle').textContent = isOwner() ? 'Activity' : 'My activity';
  const list = await api('/api/admin/activity?' + p);
  const ents = [['', 'Everything'], ['booking', 'Bookings'], ['payment', 'Payments'], ['transaction', 'Cashflow'], ['employees', 'Staff & payroll'], ['halls', 'Halls'], ['packages', 'Packages'], ['offers', 'Offers'], ['reviews', 'Reviews'], ['gallery', 'Gallery'], ['settings', 'Settings'], ['admin', 'Admins']];
  $('#view').innerHTML = `<div class="filters">
      ${isOwner() ? `<select id="acA"><option value="">All admins</option>${admins.map(a => `<option value="${a.id}" ${String(af.admin) === String(a.id) ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : `<span class="muted">Everything you've done in the admin panel.</span>`}
      <select id="acE">${ents.map(([k, l]) => `<option value="${k}" ${af.entity === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="panel np scroll">${list.length ? `<table class="tbl"><thead><tr><th>When</th>${isOwner() ? '<th>Admin</th>' : ''}<th>Action</th><th>Details</th></tr></thead><tbody>
      ${list.map(a => `<tr><td style="white-space:nowrap">${when(a.created_at)}</td>${isOwner() ? `<td><b>${esc(a.admin_name || 'System')}</b></td>` : ''}<td><span class="act ${esc(a.action)}">${esc(a.action)}</span></td><td>${esc(a.summary)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="empty">No activity yet.</p>'}</div>`;
  if ($('#acA')) $('#acA').onchange = e => { af.admin = e.target.value; reload(); };
  $('#acE').onchange = e => { af.entity = e.target.value; reload(); };
}

// ---------- live updates: check for changes every 5 seconds ----------
const LIVE_MS = 5000;
let lastSeen = null, lastRequest = null, liveTimer = null;
function busy() {
  // don't redraw while the user is in the middle of something
  if (!$('#modal').hidden) return true;
  const a = document.activeElement;
  if (a && a.closest('#view') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;
  return ['settings', 'account'].includes(location.hash.slice(1));
}
async function refreshView() {
  const v = location.hash.slice(1), y = scrollY;
  try {
    if (v === 'bookings') await vBookingsList();
    else if (v.startsWith('t:') && SC.tables[v.slice(2)]) await vTable(v.slice(2));
    else if (VIEWS[v]) await VIEWS[v][1]();
    else await vDashboard();
  } catch {}
  scrollTo(0, y);
}
async function pulse() {
  if (document.hidden || $('#appView').hidden) return;
  let p;
  try { p = await api('/api/admin/pulse'); } catch { return; }
  if ('pending' in p) { $('#pendPill').hidden = !p.pending; $('#pendPill').textContent = p.pending; }
  if (lastSeen === null) { lastSeen = p.last; lastRequest = p.latest_request?.id || 0; return; }
  if (p.latest_request && p.latest_request.id > lastRequest) {
    lastRequest = p.latest_request.id;
    toast('🔔 ' + p.latest_request.summary.replace(/^Booking request /, 'New booking request: '));
    try { document.title = '(new) Admin — Gul Makkai Palace'; setTimeout(() => (document.title = 'Admin — Gul Makkai Palace'), 8000); } catch {}
  }
  if (p.last !== lastSeen && !busy()) { lastSeen = p.last; refreshView(); }
}
function startLive() { if (!liveTimer) liveTimer = setInterval(pulse, LIVE_MS); pulse(); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) pulse(); });

boot();
