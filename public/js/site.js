// Public website
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const lines = v => String(v || '').split('\n').map(x => x.trim()).filter(Boolean);
let S, SITE, CUR = 'Rs', viewMonth, avail = {}, selDate = null;

const money = n => `${CUR} ${Math.round(Number(n) || 0).toLocaleString('en-PK')}`;
const nice = d => { const x = new Date(d + 'T12:00:00'); return `${DOW[x.getDay()]}, ${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`; };
const fmt12 = t => { if (!/^\d{1,2}:\d{2}$/.test(t || '')) return t || ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`; };
const slotLabel = sl => `${sl.name}${sl.start ? ` (${fmt12(sl.start)}–${fmt12(sl.end)})` : ''}`;
const wa = (num, text) => `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
async function api(url, opts = {}) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong. Please call us.');
  return d;
}

async function init() {
  SITE = await api('/api/site'); S = SITE.settings; CUR = S.currency || 'Rs';
  const root = document.documentElement.style;
  if (/^#[0-9a-f]{6}$/i.test(S.primary_color)) root.setProperty('--emerald', S.primary_color);
  if (/^#[0-9a-f]{6}$/i.test(S.accent_color)) root.setProperty('--gold', S.accent_color);
  document.title = `${S.business_name} — Wedding & Event Venue, Peshawar`;
  $('#bizName').textContent = S.business_name; $('#bizTag').textContent = S.tagline; $('#footName').textContent = S.business_name;
  if (S.logo) $('#brandMark').innerHTML = `<img src="${esc(S.logo)}" alt="">`;
  if (S.announcement) { $('#announce').textContent = S.announcement; $('#announce').hidden = false; }

  // hero: italicise the last word for a little ceremony
  $('#heroTitle').innerHTML = esc(S.hero_title).replace(/(\S+)$/, '<em>$1</em>');
  $('#heroSub').textContent = S.hero_subtitle;
  const maxCap = Math.max(0, ...SITE.halls.map(h => h.capacity || 0));
  $('#facts').innerHTML = [
    maxCap ? [`${maxCap.toLocaleString()}+`, 'guests in the main hall'] : null,
    [SITE.halls.length, SITE.halls.length === 1 ? 'grand hall' : 'halls'],
    [SITE.slots.map(s => s.name).join(' & '), 'two functions a day'],
  ].filter(Boolean).map(([b, s]) => `<li><b>${esc(b)}</b><span>${esc(s)}</span></li>`).join('');
  const imgs = S.hero_images || [];
  $('#heroSlides').innerHTML = imgs.length ? imgs.map((u, i) => `<img src="${esc(u)}" alt="" class="${i ? '' : 'on'}">`).join('')
    : `<div class="arch-empty"><div><b>✦</b><span>${esc(S.business_name)}</span></div></div>`;
  if (imgs.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let i = 0; setInterval(() => { const all = document.querySelectorAll('#heroSlides img'); all[i].classList.remove('on'); i = (i + 1) % all.length; all[i].classList.add('on'); }, 5000);
  }
  $('#qDate').min = SITE.today; $('#fDate').min = SITE.today;

  $('#aboutTitle').textContent = S.about_title; $('#aboutText').textContent = S.about_text;
  $('#facilities').innerHTML = lines(S.facilities).map(f => `<li>${esc(f)}</li>`).join('');
  renderHalls(); renderPackages(); renderOffers(); renderGallery(); renderReviews(); renderVisit(); setupForm();
  viewMonth = SITE.today.slice(0, 7); await loadMonth();
}

function renderHalls() {
  $('#hallList').innerHTML = SITE.halls.map(h => `
    <article class="hall">
      <div class="arch">${(h.images || [])[0] ? `<img src="${esc(h.images[0])}" alt="${esc(h.name)}" loading="lazy">` : '✦'}</div>
      <div>
        <h3>${esc(h.name)}</h3>
        ${h.capacity ? `<div class="cap"><b>${Number(h.capacity).toLocaleString()}</b> guests${h.min_guests ? ` · from ${h.min_guests}` : ''}</div>` : ''}
        <p class="muted" style="margin:0">${esc(h.description)}</p>
        ${(h.facilities || []).length ? `<div class="chips">${h.facilities.map(f => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
        <button class="btn emerald sm" type="button" data-hall="${h.id}">Check dates for this hall</button>
      </div>
    </article>`).join('');
  document.querySelectorAll('[data-hall]').forEach(b => (b.onclick = () => { $('#fHall').value = b.dataset.hall; updateEstimate(); $('#book').scrollIntoView(); }));
}

function renderPackages() {
  if (!SITE.packages.length) { $('#packages').hidden = true; return; }
  $('#pkgList').innerHTML = SITE.packages.map(p => `
    <article class="pkg ${p.highlight ? 'hot' : ''}">
      ${p.highlight ? '<span class="tag">Most popular</span>' : ''}
      <h3>${esc(p.name)}</h3>
      <p class="desc">${esc(p.description)}</p>
      <div class="price">${money(p.per_head)}<small>per head${p.min_guests ? ` · min ${p.min_guests} guests` : ''}</small></div>
      <ul class="menu">${(p.items || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
      <button class="btn ${p.highlight ? 'gold' : 'outline-gold'} block" type="button" data-pkg="${p.id}">Choose ${esc(p.name)}</button>
    </article>`).join('');
  document.querySelectorAll('[data-pkg]').forEach(b => (b.onclick = () => { $('#fPkg').value = b.dataset.pkg; updateEstimate(); $('#book').scrollIntoView(); }));
  if ((SITE.addons || []).length) $('#pkgList').insertAdjacentHTML('afterend', `<div style="margin-top:34px;text-align:center"><p class="eyebrow light">Add to any package</p>
    <ul class="add-list" style="text-align:left;max-width:760px;margin:0 auto">${SITE.addons.map(a => `<li>${esc(a.name)}<b>${addonPrice(a)}</b></li>`).join('')}</ul></div>`);
}

function renderOffers() {
  if (!SITE.offers.length) return;
  $('#offers').hidden = false;
  $('#offerList').innerHTML = SITE.offers.map(o => `<article class="offer">${o.image ? `<img src="${esc(o.image)}" alt="" loading="lazy">` : ''}
    ${o.badge ? `<span class="badge">${esc(o.badge)}</span>` : ''}<h3>${esc(o.title)}</h3><p>${esc(o.description)}</p>
    ${o.valid_until ? `<div class="until">Valid until ${nice(o.valid_until)}</div>` : ''}</article>`).join('');
}

function renderGallery() {
  if (!SITE.gallery.length) { $('#navGallery').hidden = true; return; }
  $('#gallery').hidden = false;
  $('#galList').innerHTML = SITE.gallery.map(g => `<figure data-src="${esc(g.image)}" data-cap="${esc(g.caption)}"><img src="${esc(g.image)}" alt="${esc(g.caption)}" loading="lazy">${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}</figure>`).join('');
  $('#galList').onclick = e => { const f = e.target.closest('figure'); if (!f) return; $('#lbImg').src = f.dataset.src; $('#lbCap').textContent = f.dataset.cap; $('#lightbox').hidden = false; };
  $('#lightbox').onclick = () => ($('#lightbox').hidden = true);
}

function renderReviews() {
  if (!SITE.reviews.length) return;
  $('#reviews').hidden = false;
  $('#revList').innerHTML = SITE.reviews.map(r => `<figure class="review" style="margin:0"><div class="stars" aria-label="${r.rating || 5} out of 5">${'★'.repeat(Math.max(1, Math.min(5, r.rating || 5)))}</div>
    <blockquote>${esc(r.quote)}</blockquote><b>${esc(r.name)}</b><span>${esc(r.event)}</span></figure>`).join('');
}

function renderVisit() {
  $('#addr').textContent = S.address;
  const c = [];
  if (S.phone) c.push(`<a href="tel:${esc(S.phone.replace(/\s/g, ''))}"><i>☏</i>${esc(S.phone)}</a>`);
  if (S.phone2) c.push(`<a href="tel:${esc(S.phone2.replace(/\s/g, ''))}"><i>☏</i>${esc(S.phone2)}</a>`);
  if (S.whatsapp) c.push(`<a href="${wa(S.whatsapp, `Assalam o Alaikum, I'd like to ask about booking ${S.business_name}.`)}" target="_blank" rel="noopener"><i>✆</i>WhatsApp us</a>`);
  if (S.email) c.push(`<a href="mailto:${esc(S.email)}"><i>@</i>${esc(S.email)}</a>`);
  $('#contacts').innerHTML = c.join('');
  $('#map').src = `https://maps.google.com/maps?q=${S.map_lat},${S.map_lng}&z=16&output=embed`;
  $('#dirBtn').href = `https://www.google.com/maps/dir/?api=1&destination=${S.map_lat},${S.map_lng}`;
  $('#yr').textContent = new Date().getFullYear();
  $('#socials').innerHTML = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok']].filter(([k]) => safeUrl(S[k])).map(([k, l]) => `<a href="${esc(S[k])}" target="_blank" rel="noopener">${l}</a>`).join('');
  if (S.whatsapp) { $('#waFloat').href = wa(S.whatsapp, `Assalam o Alaikum, I'd like to ask about ${S.business_name}.`); $('#waFloat').hidden = false; }
}

// ---------- calendar ----------
async function loadMonth() {
  $('#calTitle').textContent = `${MONTHS[Number(viewMonth.slice(5)) - 1]} ${viewMonth.slice(0, 4)}`;
  $('#prevM').disabled = viewMonth <= SITE.today.slice(0, 7);
  try { avail = (await api('/api/availability?month=' + viewMonth)).days; } catch { avail = {}; }
  const first = new Date(viewMonth + '-01T12:00:00'), lead = (first.getDay() + 6) % 7;
  const days = Object.keys(avail).sort();
  let html = '<span class="day blank"></span>'.repeat(lead);
  for (const d of days) {
    const states = Object.values(avail[d]).flatMap(h => Object.values(h));
    const off = !states.length || states.every(x => x === 'closed');
    const booked = states.filter(x => x === 'booked').length;
    const cls = off ? 'off' : booked === states.length ? 'full' : booked ? 'part' : '';
    html += `<button type="button" class="day ${cls} ${d === selDate ? 'sel' : ''} ${d === SITE.today ? 'today' : ''}" data-d="${d}" ${off ? 'disabled' : ''} aria-label="${nice(d)}">${Number(d.slice(8))}</button>`;
  }
  $('#calGrid').innerHTML = html;
  if (selDate && avail[selDate]) showDay(selDate);
}
$('#prevM').onclick = () => { const [y, m] = viewMonth.split('-').map(Number); viewMonth = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7); loadMonth(); };
$('#nextM').onclick = () => { const [y, m] = viewMonth.split('-').map(Number); viewMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); loadMonth(); };
$('#calGrid').onclick = e => { const b = e.target.closest('.day[data-d]'); if (b && !b.disabled) selectDate(b.dataset.d); };

function selectDate(d) {
  selDate = d;
  document.querySelectorAll('.day').forEach(x => x.classList.toggle('sel', x.dataset.d === d));
  $('#fDate').value = d;
  showDay(d);
}
function showDay(d) {
  const day = avail[d] || {};
  const label = { free: 'Available', requested: 'Requested — ask us', booked: 'Booked', closed: 'Closed' };
  $('#dayDetail').innerHTML = `<h4>${nice(d)}</h4>
    <table class="slot-table"><thead><tr><th>Hall</th>${SITE.slots.map(s => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>
    ${SITE.halls.map(h => `<tr><td>${esc(h.name)}</td>${SITE.slots.map(s => { const st = day[h.id]?.[s.name] || 'closed';
      return `<td><button type="button" class="pill ${st}" ${['free', 'requested'].includes(st) ? `data-pick="${h.id}|${esc(s.name)}"` : 'disabled'}>${label[st]}</button></td>`; }).join('')}</tr>`).join('')}
    </tbody></table><p class="muted" style="font-size:.85rem;margin:10px 0 0">Tap an available slot to fill in the form.</p>`;
  $('#dayDetail').querySelectorAll('[data-pick]').forEach(b => (b.onclick = () => {
    const [h, s] = b.dataset.pick.split('|'); $('#fHall').value = h; $('#fSlot').value = s; updateEstimate();
    if (innerWidth < 960) $('#bform').scrollIntoView({ behavior: 'smooth' }); else $('#fGuests').focus();
  }));
}
$('#quick').onsubmit = async e => {
  e.preventDefault();
  const d = $('#qDate').value; if (!d) return;
  viewMonth = d.slice(0, 7); await loadMonth(); selectDate(d);
  $('#book').scrollIntoView();
};

// ---------- booking form ----------
function setupForm() {
  $('#fSlot').innerHTML = SITE.slots.map(s => `<option value="${esc(s.name)}">${esc(slotLabel(s))}</option>`).join('');
  $('#fHall').innerHTML = SITE.halls.map(h => `<option value="${h.id}">${esc(h.name)}${h.capacity ? ` (up to ${h.capacity})` : ''}</option>`).join('');
  $('#fEvent').innerHTML = SITE.event_types.map(t => `<option>${esc(t)}</option>`).join('');
  $('#fPkg').innerHTML = SITE.packages.map(p => `<option value="${p.id}" ${p.highlight ? 'selected' : ''}>${esc(p.name)} — ${money(p.per_head)}/head</option>`).join('') + '<option value="">Hall only (no catering)</option>';
  const ads = SITE.addons || [];
  $('#fAddonsBox').hidden = !ads.length;
  $('#fAddons').innerHTML = ads.map(a => `<label class="addon"><input type="checkbox" value="${a.id}" name="addon"><div>${esc(a.name)}${a.description ? `<small>${esc(a.description)}</small>` : ''}</div><b>${addonPrice(a)}</b></label>`).join('');
  $('#fAddons').addEventListener('change', updateEstimate);
  ['#fGuests', '#fPkg', '#fHall'].forEach(s => $(s).addEventListener('input', updateEstimate));
  $('#fDate').addEventListener('change', async () => {
    const d = $('#fDate').value; if (!d) return;
    if (d.slice(0, 7) !== viewMonth) { viewMonth = d.slice(0, 7); await loadMonth(); }
    if (avail[d]) selectDate(d);
  });
  if (S.booking_enabled !== '1') { $('#bSend').disabled = true; $('#bookSub').textContent = 'Online requests are paused right now — please call us to book.'; }
  $('#bform').onsubmit = submit;
}
const addonPrice = a => (a.price == null || a.price === '' ? 'Price on request' : `${money(a.price)}${a.price_type === 'per head' ? ' / head' : ''}`);
const chosenAddons = () => [...document.querySelectorAll('#fAddons input:checked')].map(i => SITE.addons.find(a => String(a.id) === i.value)).filter(Boolean);
function updateEstimate() {
  const g = Number($('#fGuests').value) || 0, p = SITE.packages.find(x => String(x.id) === $('#fPkg').value), h = SITE.halls.find(x => String(x.id) === $('#fHall').value);
  const el = $('#estimate');
  if (!g && p) { el.hidden = true; return; }
  const ads = chosenAddons();
  const adTotal = ads.reduce((t, a) => t + (a.price == null ? 0 : a.price_type === 'per head' ? a.price * g : a.price), 0);
  const onRequest = ads.filter(a => a.price == null).map(a => a.name);
  const total = (p ? p.per_head * g : (h?.hire_charge || 0)) + adTotal;
  if (!total && !ads.length) { el.hidden = true; return; }
  const adv = Math.round(total * (Number(S.advance_percent) || 0) / 100);
  el.hidden = false;
  el.innerHTML = `Estimated total <b>${money(total)}</b>${p ? `<br><span class="muted">${g.toLocaleString()} guests × ${money(p.per_head)}</span>` : ''}${adTotal ? `<br><span class="muted">Extras: ${money(adTotal)}</span>` : ''}${onRequest.length ? `<br><span class="muted">${esc(onRequest.join(', '))}: price confirmed when we call you</span>` : ''}${adv ? `<br><span class="muted">Advance to confirm: ${money(adv)} (${S.advance_percent}%)</span>` : ''}`
    + (h?.capacity && g > h.capacity ? `<br><span style="color:var(--red)">${esc(h.name)} holds up to ${h.capacity} guests.</span>` : '');
}
async function submit(e) {
  e.preventDefault();
  const err = $('#bErr'); err.hidden = true;
  const body = { date: $('#fDate').value, slot: $('#fSlot').value, hall_id: $('#fHall').value, guests: $('#fGuests').value, event_type: $('#fEvent').value,
    package_id: $('#fPkg').value, addon_ids: chosenAddons().map(a => a.id), customer_name: $('#fName').value, phone: $('#fPhone').value, notes: $('#fNotes').value };
  const miss = !body.date ? 'a date' : !body.guests ? 'the number of guests' : !body.customer_name.trim() ? 'your name' : !body.phone.trim() ? 'your phone number' : '';
  if (miss) { err.textContent = `Please add ${miss}.`; err.hidden = false; return; }
  const btn = $('#bSend'); btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const { booking: b } = await api('/api/bookings', { method: 'POST', body: JSON.stringify(body) });
    $('#dRef').textContent = b.ref;
    const sl = SITE.slots.find(s => s.name === b.slot);
    $('#dSum').innerHTML = [['Date', nice(b.date)], ['Time', sl ? slotLabel(sl) : b.slot], ['Hall', b.hall], ['Guests', b.guests.toLocaleString()], ['Package', b.package], b.addons?.length ? ['Extras', b.addons.join(', ')] : null,
      b.total ? ['Estimate', money(b.total)] : null, b.advance ? ['Advance', money(b.advance)] : null].filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
    if (S.whatsapp) { $('#dWa').hidden = false; $('#dWa').href = wa(S.whatsapp, `Assalam o Alaikum! I sent a booking request.\nRef: ${b.ref}\n${nice(b.date)} · ${b.slot}\n${b.hall} · ${b.guests} guests · ${b.package}${b.addons?.length ? '\nExtras: ' + b.addons.join(', ') : ''}\nName: ${body.customer_name}`); }
    $('#doneModal').hidden = false;
    e.target.reset(); setupForm(); $('#estimate').hidden = true; await loadMonth();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; await loadMonth(); }
  finally { btn.disabled = S.booking_enabled !== '1'; btn.textContent = 'Send booking request'; }
}

// ---------- lookup ----------
$('#lkForm').onsubmit = async e => {
  e.preventDefault();
  const out = $('#lkOut');
  try {
    const { booking: b } = await api('/api/bookings/lookup', { method: 'POST', body: JSON.stringify({ ref: $('#lkRef').value.trim(), phone: $('#lkPhone').value }) });
    out.innerHTML = `<dl class="sum"><dt>Status</dt><dd><span class="status ${b.status}">${b.status}</span></dd><dt>Date</dt><dd>${esc(nice(b.date))} · ${esc(b.slot)}</dd>
      <dt>Hall</dt><dd>${esc(b.hall)}</dd><dt>Guests</dt><dd>${b.guests}</dd><dt>Package</dt><dd>${esc(b.package)}</dd>${b.menu?.length ? `<dt>Menu</dt><dd>${esc(b.menu.join(", "))}</dd>` : ""}${b.addons?.length ? `<dt>Extras</dt><dd>${esc(b.addons.join(', '))}</dd>` : ''}
      ${b.total ? `<dt>Total</dt><dd>${money(b.total)}</dd><dt>Paid</dt><dd>${money(b.paid)}</dd><dt>Balance</dt><dd>${money(b.balance)}</dd>` : ''}</dl>`;
  } catch (ex) { out.innerHTML = `<p class="err" style="margin-top:14px">${esc(ex.message)}</p>`; }
};

// ---------- modals + nav ----------
document.querySelectorAll('[data-open="lookup"]').forEach(b => (b.onclick = () => { $('#links').classList.remove('open'); $('#lookupModal').hidden = false; }));
document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) m.hidden = true; }));
addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal, .lightbox').forEach(m => (m.hidden = true)); });
$('#burger').onclick = () => $('#links').classList.toggle('open');
$('#links').addEventListener('click', e => { if (e.target.tagName === 'A') $('#links').classList.remove('open'); });

init().catch(e => { console.error(e); document.body.insertAdjacentHTML('afterbegin', '<p class="err" style="margin:0">Could not load the site. Please refresh.</p>'); });
