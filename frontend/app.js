/* Hisobchi-bro frontend: oddiy SPA (hash routing), framework'siz */
const API = (window.API_BASE || '').replace(/\/$/, '');
const $app = document.getElementById('app');
let META = null;
let ME = null;

// ---------- yordamchilar ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const som = (n) => (n ? Number(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' so\'m' : 'Kelishiladi');
const date = (t) => new Date(t * 1000).toLocaleDateString('ru-RU');
const daysLeft = (t) => Math.max(0, Math.ceil((t * 1000 - Date.now()) / 86400000));
const catTitle = (k) => META?.categories.find((c) => c.key === k)?.title || k;
const token = () => { try { return localStorage.getItem('hb_token') || ''; } catch { return ''; } };
const setToken = (t) => { try { t ? localStorage.setItem('hb_token', t) : localStorage.removeItem('hb_token'); } catch {} };

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 3200);
}

async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (token()) headers.Authorization = 'Bearer ' + token();
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token()) { setToken(''); ME = null; }
    throw new Error(data.error || 'Xatolik yuz berdi');
  }
  return data;
}

const go = (h) => { location.hash = h; };
const formData = (f) => Object.fromEntries(new FormData(f).entries());
const opts = (arr, sel, empty) => (empty ? `<option value="">${empty}</option>` : '') +
  arr.map((x) => { const v = typeof x === 'string' ? x : x.key; const t = typeof x === 'string' ? x : x.title;
    return `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(t)}</option>`; }).join('');

function planBadge(p) {
  if (p === 'vip') return '<span class="badge vip">★ VIP</span>';
  if (p === 'pro' || p === 'trial') return '<span class="badge pro">PRO</span>';
  return '';
}
function stars(r, n) {
  if (r == null) return n === undefined ? '' : '<span class="muted small">Hali sharh yo\'q</span>';
  return `<span class="stars">★ ${r}</span> <span class="muted small">(${n} sharh)</span>`;
}

function accCard(a) {
  return `<a class="card link ${a.plan === 'vip' ? 'vip' : ''}" href="#/b/${a.id}">
    <div class="row"><h3>${esc(a.name)}</h3><div>${planBadge(a.plan)}${a.verified ? '<span class="badge ok">✓ Tasdiqlangan</span>' : ''}</div></div>
    <div class="muted small">${esc(a.city)} · ${a.experience_years} yil tajriba${a.clients_count ? ` · ${a.clients_count} mijoz` : ''}</div>
    <div style="margin:6px 0">${a.rating !== undefined ? stars(a.rating, a.rating_count) : ''}</div>
    <div class="small">${esc(a.bio || 'Ma\'lumot kiritilmagan')}</div>
    <div class="tags">${a.specializations.slice(0, 4).map((s) => `<span class="badge">${esc(catTitle(s))}</span>`).join('')}</div>
    ${a.price_from ? `<div class="price" style="margin-top:8px">${som(a.price_from)} dan / oy</div>` : ''}
  </a>`;
}

function orderCard(o) {
  return `<a class="card link" href="#/z/${o.id}">
    <div class="row"><span class="badge">${esc(catTitle(o.category))}</span><span class="muted small">${date(o.created_at)}</span></div>
    <h3 style="margin-top:8px">${esc(o.title)}</h3>
    <div class="small muted">${esc((o.description || '').slice(0, 160))}</div>
    <div class="row" style="margin-top:10px"><span class="price">${som(o.budget)}</span>
    <span class="muted small">${o.business_type ? esc(o.business_type) + ' · ' : ''}${esc(o.city || '')} · ${o.offers_count} taklif</span></div>
  </a>`;
}

function renderNav() {
  const h = location.hash || '#/';
  const link = (href, t, cls = '') => `<a href="${href}" class="${cls} ${h === href ? 'on' : ''}">${t}</a>`;
  let html = link('#/buxgalterlar', 'Buxgalterlar') + link('#/zakazlar', 'Zakazlar') + link('#/kalkulyator', 'Soliq kalkulyatori') + link('#/tariflar', 'Tariflar');
  if (!ME) html += link('#/kirish', 'Kirish') + link('#/royxat', 'Ro\'yxatdan o\'tish', 'btn');
  else {
    if (ME.user.role === 'admin') html += link('#/admin', 'Admin');
    html += link('#/kabinet', 'Kabinet', 'btn');
  }
  document.getElementById('nav').innerHTML = html;
}
document.getElementById('burger').onclick = () => document.getElementById('nav').classList.toggle('open');

// ---------- sahifalar ----------
const routes = {};

routes[''] = async () => {
  const [stats, accs] = await Promise.all([api('/api/stats'), api('/api/accountants')]);
  $app.innerHTML = `
  <section class="hero">
    <div>
      <h1>Biznesingiz uchun ishonchli buxgalterni 1 kunda toping</h1>
      <p>YaTT va kichik biznes uchun: oylik buxgalteriya, soliq hisobotlari, 1C. Vazifangizni yozing, buxgalterlar o'z narxini taklif qiladi, siz reyting va haqiqiy sharhlar bo'yicha tanlaysiz.</p>
      <div class="actions">
        <a class="btn" href="#/zakaz-berish">Bepul zakaz berish</a>
        <a class="btn ghost" href="#/buxgalterlar">Buxgalterlarni ko'rish</a>
      </div>
      <div class="stats">
        <div><b>${stats.accountants}</b><span>buxgalter</span></div>
        <div><b>${stats.orders}</b><span>zakaz</span></div>
        <div><b>${stats.done}</b><span>bajarilgan ish</span></div>
      </div>
    </div>
    <div class="hero-card">
      <h3 style="margin-top:0">Qanday ishlaydi?</h3>
      <p class="muted">1. Vazifani yozasiz: "YaTT, oylik hisobot kerak"<br>2. Buxgalterlar narx va muddat taklif qiladi<br>3. Reyting va sharhlarga qarab tanlaysiz<br>4. Ish bitgach, baho qoldirasiz</p>
      <p class="small muted">Sharhlarni faqat platformada ish bitkazgan mijozlar qoldira oladi, shuning uchun soxta sharh bo'lmaydi.</p>
    </div>
  </section>
  <h2>Xizmatlar</h2>
  <div class="grid">${META.categories.map((c) => `<a class="card link cat" href="#/buxgalterlar?category=${c.key}">${esc(c.title)}</a>`).join('')}</div>
  <h2>Top buxgalterlar</h2>
  <div class="grid">${accs.slice(0, 6).map(accCard).join('') || '<div class="empty">Hozircha buxgalterlar yo\'q. Birinchi bo\'ling!</div>'}</div>
  <div class="card" style="margin-top:36px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
    <div><h3 style="margin:0">Siz buxgaltermisiz?</h3><div class="muted">Profil oching, ${META.trialDays} kun bepul Pro bilan zakazlar oling.</div></div>
    <a class="btn" href="#/royxat?role=accountant">Buxgalter sifatida qo'shilish</a>
  </div>`;
};

routes['buxgalterlar'] = async (qs) => {
  $app.innerHTML = `<h1>Buxgalterlar</h1>
  <form class="filters" id="f">
    <input name="q" placeholder="Ism yoki kalit so'z" value="${esc(qs.get('q') || '')}">
    <select name="category">${opts(META.categories, qs.get('category'), 'Barcha xizmatlar')}</select>
    <select name="city">${opts(META.cities, qs.get('city'), 'Barcha shaharlar')}</select>
    <select name="regime">${opts(META.regimes, qs.get('regime'), 'Soliq rejimi')}</select>
  </form>
  <div class="grid" id="list"><div class="empty">Yuklanmoqda...</div></div>`;
  const f = document.getElementById('f');
  const load = async () => {
    const p = new URLSearchParams(Object.entries(formData(f)).filter(([, v]) => v));
    history.replaceState(null, '', '#/buxgalterlar' + (p.toString() ? '?' + p : ''));
    const list = await api('/api/accountants?' + p);
    document.getElementById('list').innerHTML = list.map(accCard).join('') || '<div class="empty">Mos buxgalter topilmadi</div>';
  };
  f.onchange = load; f.onsubmit = (e) => { e.preventDefault(); load(); };
  f.q.oninput = () => { clearTimeout(load.t); load.t = setTimeout(load, 400); };
  load();
};

routes['b'] = async (qs, id) => {
  const a = await api('/api/accountants/' + id);
  $app.innerHTML = `
  <div class="card ${a.plan === 'vip' ? 'vip' : ''}">
    <div class="row"><h1 style="margin:0">${esc(a.name)}</h1><div>${planBadge(a.plan)}${a.verified ? '<span class="badge ok">✓ Tasdiqlangan</span>' : ''}</div></div>
    <div class="muted">${esc(a.city)} · ${a.experience_years} yil tajriba${a.clients_count ? ` · ${a.clients_count} ta doimiy mijoz` : ''}</div>
    <div style="margin:8px 0">${a.rating !== undefined ? stars(a.rating, a.rating_count) : ''}</div>
    <p style="white-space:pre-line">${esc(a.bio || 'Ma\'lumot kiritilmagan')}</p>
    <div class="tags">${a.specializations.map((s) => `<span class="badge">${esc(catTitle(s))}</span>`).join('')}</div>
    ${a.tax_regimes.length ? `<div class="small muted" style="margin-top:8px">Soliq rejimlari: ${a.tax_regimes.map(esc).join(', ')}</div>` : ''}
    ${a.price_from ? `<div class="price" style="margin-top:8px">${som(a.price_from)} dan / oy</div>` : ''}
    <div style="margin-top:16px">${a.contacts
      ? `<div class="row" style="justify-content:flex-start"><a class="btn" href="tel:${esc(a.contacts.phone)}">📞 ${esc(a.contacts.phone)}</a>
         ${a.contacts.telegram ? `<a class="btn ghost" target="_blank" rel="noopener" href="https://t.me/${esc(a.contacts.telegram.replace('@', ''))}">Telegram ${esc(a.contacts.telegram)}</a>` : ''}</div>`
      : `<div class="notice">Bu buxgalterning kontaktlari hozircha yopiq. Unga <a href="#/zakaz-berish">zakaz bering</a>, u taklif yuborganda bog'lana olasiz.</div>`}</div>
  </div>
  <h2>Xizmatlar</h2>
  <div class="grid">${a.listings.map((l) => `<div class="card"><span class="badge">${esc(catTitle(l.category))}</span><h3 style="margin-top:8px">${esc(l.title)}</h3>
    <div class="small muted" style="white-space:pre-line">${esc(l.description)}</div><div class="price" style="margin-top:8px">${som(l.price)}</div></div>`).join('') || '<div class="muted">E\'lonlar yo\'q</div>'}</div>
  ${a.rating !== undefined ? `<h2>Sharhlar</h2>${a.reviews.map((r) => `<div class="card" style="margin-bottom:10px"><div class="row"><b>${esc(r.client_name)}</b><span class="stars">${'★'.repeat(r.rating)}</span></div>
    <div>${esc(r.text)}</div><div class="small muted">${date(r.created_at)}</div></div>`).join('') || '<div class="muted">Hali sharh yo\'q</div>'}` : ''}`;
};

routes['zakazlar'] = async (qs) => {
  const cat = qs.get('category') || '';
  const list = await api('/api/orders' + (cat ? '?category=' + cat : ''));
  $app.innerHTML = `<div class="row"><h1>Ochiq zakazlar</h1><a class="btn" href="#/zakaz-berish">+ Zakaz berish</a></div>
  <div class="tabs">${[{ key: '', title: 'Hammasi' }, ...META.categories].map((c) =>
    `<button class="${c.key === cat ? 'on' : ''}" onclick="go('#/zakazlar${c.key ? '?category=' + c.key : ''}')">${esc(c.title)}</button>`).join('')}</div>
  ${ME?.user.role === 'accountant' && !ME.plan.offers ? '<div class="notice">Zakazlarga taklif yuborish uchun <a href="#/tariflar">Pro yoki VIP tarif</a> kerak.</div>' : ''}
  <div class="grid">${list.map(orderCard).join('') || '<div class="empty">Hozircha ochiq zakaz yo\'q</div>'}</div>`;
};

routes['zakaz-berish'] = async () => {
  if (!ME) { toast('Zakaz berish uchun ro\'yxatdan o\'ting'); return go('#/royxat?role=client&next=zakaz-berish'); }
  if (ME.user.role !== 'client') { $app.innerHTML = '<div class="notice">Zakazni faqat mijoz hisobidan berish mumkin.</div>'; return; }
  $app.innerHTML = `<h1>Zakaz berish</h1><p class="muted">Bepul. Buxgalterlar sizga narx va shartlarini taklif qiladi.</p>
  <form class="form card" id="f">
    <label>Qanday xizmat kerak?</label><select name="category">${opts(META.categories)}</select>
    <label>Qisqacha vazifa</label><input name="title" required placeholder="Masalan: YaTT uchun oylik soliq hisobotlari">
    <label>Batafsil</label><textarea name="description" placeholder="Faoliyat turi, xodimlar soni, oylik aylanma, muddatlar..."></textarea>
    <div class="two">
      <div><label>Biznes turi</label><select name="business_type">${opts(META.businessTypes)}</select></div>
      <div><label>Shahar</label><select name="city">${opts(META.cities)}</select></div>
    </div>
    <label>Byudjet (so'm, ixtiyoriy)</label><input name="budget" type="number" min="0" step="10000" placeholder="500000">
    <div style="margin-top:16px"><button class="btn">Zakazni joylash</button></div>
  </form>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api('/api/orders', { method: 'POST', body: formData(e.target) }); toast('Zakaz joylandi!'); go('#/z/' + r.id); }
    catch (err) { toast(err.message); }
  };
};

routes['z'] = async (qs, id) => {
  const o = await api('/api/orders/' + id);
  const statusT = { open: 'Ochiq', assigned: 'Ijrochi tanlangan', done: 'Bajarilgan', closed: 'Yopilgan' }[o.status];
  let side = '';
  if (o.is_owner) {
    if (o.status === 'open') {
      side = `<h2>Takliflar (${o.offers.length})</h2>` + (o.offers.map((f) => `<div class="card ${f.accountant.plan === 'vip' ? 'vip' : ''}" style="margin-bottom:10px">
        <div class="row"><a href="#/b/${f.accountant.id}"><b>${esc(f.accountant.name)}</b></a><div>${planBadge(f.accountant.plan)}${f.accountant.verified ? '<span class="badge ok">✓</span>' : ''}</div></div>
        <div>${stars(f.accountant.rating, f.accountant.rating_count)}</div>
        <div class="price" style="margin:6px 0">${som(f.price)}</div><div style="white-space:pre-line">${esc(f.message)}</div>
        <button class="btn sm" style="margin-top:10px" onclick="acceptOffer(${o.id}, ${f.id})">Shu buxgalterni tanlash</button></div>`).join('')
        || '<div class="muted">Hozircha taklif yo\'q. Buxgalterlar tez orada javob beradi.</div>')
        + `<button class="btn ghost sm" style="margin-top:14px" onclick="orderAct(${o.id}, 'close')">Zakazni yopish</button>`;
    } else {
      const f = o.offers.find((x) => x.status === 'accepted');
      side = f ? `<h2>Tanlangan buxgalter</h2><div class="card"><a href="#/b/${f.accountant.id}"><b>${esc(f.accountant.name)}</b></a>
        <div class="price">${som(f.price)}</div><div>📞 <a href="tel:${esc(f.phone)}">${esc(f.phone)}</a> ${f.telegram ? ' · ' + esc(f.telegram) : ''}</div>
        ${o.status === 'assigned' ? `<button class="btn sm" style="margin-top:10px" onclick="orderAct(${o.id}, 'done')">Ish bajarildi ✓</button>` : ''}</div>` : '';
      if (o.status === 'done') {
        side += o.review ? `<div class="notice ok" style="margin-top:14px">Bahoyingiz: ${'★'.repeat(o.review.rating)} — rahmat!</div>`
          : `<h2>Baho qoldiring</h2><form class="card form" id="rv"><div class="rate" id="rate">${[1, 2, 3, 4, 5].map((n) =>
            `<label data-n="${n}">★<input type="radio" name="rating" value="${n}"></label>`).join('')}</div>
            <textarea name="text" placeholder="Ish sifati, muddatlar, muomala..."></textarea><button class="btn" style="margin-top:10px">Yuborish</button></form>`;
      }
    }
  } else if (ME?.user.role === 'accountant') {
    if (o.is_assigned) side = `<div class="notice ok">Siz tanlandingiz! Mijoz: <b>${esc(o.client.name)}</b>, <a href="tel:${esc(o.client.phone)}">${esc(o.client.phone)}</a></div>`;
    else if (o.my_offer) side = `<div class="notice ok">Taklifingiz yuborilgan: ${som(o.my_offer.price)}</div>`;
    else if (!ME.plan.offers) side = '<div class="notice">Taklif yuborish uchun <a href="#/tariflar">Pro yoki VIP tarif</a> kerak.</div>';
    else side = `<h2>Taklif yuborish</h2><form class="card form" id="of">
      <label>Narxingiz (so'm)</label><input name="price" type="number" min="1000" step="10000" required>
      <label>Xabar</label><textarea name="message" placeholder="Tajribangiz, muddat, nimalar kiradi..."></textarea>
      <button class="btn" style="margin-top:10px">Yuborish</button></form>`;
  } else if (!ME) side = '<div class="notice">Buxgalter bo\'lsangiz, taklif yuborish uchun <a href="#/kirish">kiring</a>.</div>';

  $app.innerHTML = `<div class="card"><div class="row"><span class="badge">${esc(catTitle(o.category))}</span><span class="badge">${statusT}</span></div>
    <h1 style="margin:10px 0">${esc(o.title)}</h1><p style="white-space:pre-line">${esc(o.description)}</p>
    <div class="muted">${o.business_type ? esc(o.business_type) + ' · ' : ''}${esc(o.city)} · ${date(o.created_at)}</div>
    <div class="price" style="margin-top:8px">Byudjet: ${som(o.budget)}</div></div>${side}`;

  const of = document.getElementById('of');
  if (of) of.onsubmit = async (e) => { e.preventDefault();
    try { await api(`/api/orders/${o.id}/offers`, { method: 'POST', body: formData(of) }); toast('Taklif yuborildi'); render(); } catch (err) { toast(err.message); } };
  const rv = document.getElementById('rv');
  if (rv) {
    rv.querySelectorAll('#rate label').forEach((l) => l.onclick = () => rv.querySelectorAll('#rate label').forEach((x) => x.classList.toggle('on', +x.dataset.n <= +l.dataset.n)));
    rv.onsubmit = async (e) => { e.preventDefault();
      try { await api(`/api/orders/${o.id}/review`, { method: 'POST', body: formData(rv) }); toast('Rahmat!'); render(); } catch (err) { toast(err.message); } };
  }
};
window.acceptOffer = async (oid, fid) => {
  if (!confirm('Shu buxgalterni tanlaysizmi? Boshqa takliflar rad etiladi.')) return;
  try { await api(`/api/orders/${oid}/accept`, { method: 'POST', body: { offer_id: fid } }); toast('Buxgalter tanlandi, kontaktlari ochildi'); render(); } catch (e) { toast(e.message); }
};
window.orderAct = async (oid, act) => {
  try { await api(`/api/orders/${oid}/${act}`, { method: 'POST', body: {} }); render(); } catch (e) { toast(e.message); }
};
window.go = go;

function authForm(mode, qs) {
  const reg = mode === 'reg';
  const role = qs.get('role') || 'client';
  $app.innerHTML = `<div class="card form" style="margin:20px auto">
    <h1 style="margin-top:0">${reg ? 'Ro\'yxatdan o\'tish' : 'Kirish'}</h1>
    <form id="f">
      ${reg ? `<div class="tabs" id="roles"><button type="button" data-r="client" class="${role === 'client' ? 'on' : ''}">Menga buxgalter kerak</button>
        <button type="button" data-r="accountant" class="${role === 'accountant' ? 'on' : ''}">Men buxgalterman</button></div>
        <input type="hidden" name="role" value="${esc(role)}">
        <div id="trialNote" class="notice ok" style="${role === 'accountant' ? '' : 'display:none'}">${META.trialDays} kun Pro tarif bepul: kontaktlar ochiq, zakazlarga taklif yuborasiz.</div>
        <label>Ism</label><input name="name" required>` : ''}
      <label>Telefon</label><input name="phone" required placeholder="90 123 45 67" inputmode="tel">
      <label>Parol</label><input name="password" type="password" required minlength="6">
      <div style="margin-top:16px"><button class="btn" style="width:100%">${reg ? 'Davom etish' : 'Kirish'}</button></div>
    </form>
    <p class="muted small">${reg ? 'Hisobingiz bormi? <a href="#/kirish">Kirish</a>' : 'Hisobingiz yo\'qmi? <a href="#/royxat">Ro\'yxatdan o\'ting</a>'}</p></div>`;
  const f = document.getElementById('f');
  document.querySelectorAll('#roles button').forEach((b) => b.onclick = () => {
    f.role.value = b.dataset.r;
    document.querySelectorAll('#roles button').forEach((x) => x.classList.toggle('on', x === b));
    document.getElementById('trialNote').style.display = b.dataset.r === 'accountant' ? '' : 'none';
  });
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api(reg ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: formData(f) });
      setToken(r.token); await loadMe();
      go(qs.get('next') ? '#/' + qs.get('next') : '#/kabinet');
    } catch (err) { toast(err.message); }
  };
}
routes['kirish'] = (qs) => authForm('login', qs);
routes['royxat'] = (qs) => authForm('reg', qs);

routes['kabinet'] = async (qs) => {
  if (!ME) return go('#/kirish');
  const head = `<div class="row"><h1>Salom, ${esc(ME.user.name)}!</h1><button class="btn ghost sm" id="out">Chiqish</button></div>`;
  if (ME.user.role === 'admin') { $app.innerHTML = head + '<a class="btn" href="#/admin">Admin panel</a>'; }
  else if (ME.user.role === 'client') {
    const list = await api('/api/me/orders');
    const st = { open: 'Ochiq', assigned: 'Ijrochi tanlangan', done: 'Bajarilgan', closed: 'Yopilgan' };
    $app.innerHTML = head + `<div class="row"><h2>Mening zakazlarim</h2><a class="btn" href="#/zakaz-berish">+ Yangi zakaz</a></div>
      <div class="grid">${list.map((o) => `<a class="card link" href="#/z/${o.id}"><div class="row"><span class="badge">${st[o.status]}</span><span class="small muted">${date(o.created_at)}</span></div>
        <h3 style="margin-top:8px">${esc(o.title)}</h3><div class="muted small">${o.offers_count} ta taklif</div></a>`).join('') || '<div class="empty">Hali zakaz bermagansiz</div>'}</div>`;
  } else await accountantCabinet(head, qs);
  document.getElementById('out').onclick = async () => { try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch {} setToken(''); ME = null; go('#/'); };
};

async function accountantCabinet(head, qs) {
  const tab = qs.get('t') || 'profil';
  const a = ME.accountant; const p = ME.plan;
  const planLine = p.key === 'oddiy'
    ? `<div class="notice"><b>Tarif: Oddiy.</b> Kontaktlaringiz yopiq, reytingingiz ko'rinmaydi, zakazlarga taklif yubora olmaysiz. <a href="#/tariflar">Pro yoki VIP ni yoqing →</a></div>`
    : `<div class="notice ok"><b>Tarif: ${esc(p.title)}</b> · ${daysLeft(p.until)} kun qoldi (${date(p.until)} gacha). ${p.key === 'trial' ? '<a href="#/tariflar">Pro ga o\'tish →</a>' : ''}</div>`;
  const tabs = [['profil', 'Profil'], ['elonlar', 'E\'lonlar'], ['takliflar', 'Takliflarim'], ['tolovlar', 'To\'lovlar']];
  $app.innerHTML = head + planLine + `<div class="tabs">${tabs.map(([k, t]) => `<button class="${k === tab ? 'on' : ''}" onclick="go('#/kabinet?t=${k}')">${t}</button>`).join('')}
    <button onclick="go('#/b/${ME.user.id}')">Profilim qanday ko'rinadi →</button></div><div id="tab"></div>`;
  const el = document.getElementById('tab');

  if (tab === 'profil') {
    const specs = (a.specializations || '').split(','); const regs = (a.tax_regimes || '').split(',');
    el.innerHTML = `<form class="card form" id="pf">
      <label>Ism familiya</label><input name="name" value="${esc(ME.user.name)}">
      <div class="two"><div><label>Shahar</label><select name="city">${opts(META.cities, a.city)}</select></div>
      <div><label>Tajriba (yil)</label><input name="experience_years" type="number" min="0" value="${a.experience_years}"></div></div>
      <label>O'zingiz haqingizda</label><textarea name="bio" placeholder="Qaysi sohalarda ishlagansiz, qanday mijozlar bilan...">${esc(a.bio)}</textarea>
      <label>Xizmatlar</label><div class="checks">${META.categories.map((c) => `<label><input type="checkbox" name="spec" value="${c.key}" ${specs.includes(c.key) ? 'checked' : ''}>${esc(c.title)}</label>`).join('')}</div>
      <label>Soliq rejimlari</label><div class="checks">${META.regimes.map((r) => `<label><input type="checkbox" name="reg" value="${esc(r)}" ${regs.includes(r) ? 'checked' : ''}>${esc(r)}</label>`).join('')}</div>
      <div class="two"><div><label>Narx (so'm/oy dan)</label><input name="price_from" type="number" min="0" step="10000" value="${a.price_from || ''}"></div>
      <div><label>Doimiy mijozlar soni</label><input name="clients_count" type="number" min="0" value="${a.clients_count || ''}"></div></div>
      <label>Telegram</label><input name="telegram" placeholder="@username" value="${esc(a.telegram)}">
      <label>Diplom / sertifikat (tasdiqlash uchun)</label><input name="verify_note" placeholder="Masalan: CIPA sertifikati №..., TDIU 2015" value="${esc(a.verify_note)}">
      <div class="small muted">${a.verified ? '✓ Profilingiz tasdiqlangan' : 'Admin tekshirgach "Tasdiqlangan" belgisi beriladi. Bu mijozlar ishonchini oshiradi.'}</div>
      <div style="margin-top:16px"><button class="btn">Saqlash</button></div></form>`;
    document.getElementById('pf').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target; const d = formData(f);
      d.specializations = [...f.querySelectorAll('[name=spec]:checked')].map((x) => x.value);
      d.tax_regimes = [...f.querySelectorAll('[name=reg]:checked')].map((x) => x.value);
      try { await api('/api/me/profile', { method: 'PUT', body: d }); await loadMe(); toast('Saqlandi'); } catch (err) { toast(err.message); }
    };
  }

  if (tab === 'elonlar') {
    const list = await api('/api/me/listings');
    const full = list.length >= p.listings;
    el.innerHTML = `<p class="muted">E'lonlar: ${list.length} / ${p.listings >= 999 ? '∞' : p.listings}</p>
      <div class="grid">${list.map((l, i) => `<div class="card" ${i >= p.listings ? 'style="opacity:.5"' : ''}><span class="badge">${esc(catTitle(l.category))}</span>
        <h3 style="margin-top:8px">${esc(l.title)}</h3><div class="price">${som(l.price)}</div>
        ${i >= p.listings ? '<div class="small muted">Tarif limitidan tashqari, ko\'rinmaydi</div>' : ''}
        <button class="btn ghost sm" style="margin-top:8px" onclick="delListing(${l.id})">O'chirish</button></div>`).join('')}</div>
      ${full ? `<div class="notice" style="margin-top:16px">Limitga yetdingiz. <a href="#/tariflar">Ko'proq e'lon uchun tarifni oshiring →</a></div>` : `
      <h2>Yangi e'lon</h2><form class="card form" id="lf">
        <label>Xizmat</label><select name="category">${opts(META.categories)}</select>
        <label>Sarlavha</label><input name="title" required placeholder="YaTT uchun to'liq buxgalteriya">
        <label>Tavsif</label><textarea name="description" placeholder="Nimalar kiradi, muddatlar..."></textarea>
        <label>Narx (so'm)</label><input name="price" type="number" min="0" step="10000">
        <div style="margin-top:14px"><button class="btn">Joylash</button></div></form>`}`;
    const lf = document.getElementById('lf');
    if (lf) lf.onsubmit = async (e) => { e.preventDefault();
      try { await api('/api/listings', { method: 'POST', body: formData(lf) }); toast('E\'lon joylandi'); render(); } catch (err) { toast(err.message); } };
  }

  if (tab === 'takliflar') {
    const list = await api('/api/me/orders');
    const st = { sent: 'Kutilmoqda', accepted: '✓ Tanlandingiz', rejected: 'Rad etildi' };
    el.innerHTML = `<div class="grid">${list.map((o) => `<a class="card link" href="#/z/${o.id}"><span class="badge ${o.offer_status === 'accepted' ? 'ok' : ''}">${st[o.offer_status]}</span>
      <h3 style="margin-top:8px">${esc(o.title)}</h3><div class="muted small">Taklifingiz: ${som(o.my_price)}</div></a>`).join('')
      || `<div class="empty">Hali taklif yubormagansiz. <a href="#/zakazlar">Ochiq zakazlar →</a></div>`}</div>`;
  }

  if (tab === 'tolovlar') {
    const list = await api('/api/me/payments');
    const st = { pending: 'Tekshirilmoqda', approved: '✓ Tasdiqlandi', rejected: 'Rad etildi' };
    el.innerHTML = `<div class="tbl"><table><tr><th>Sana</th><th>Tarif</th><th>Summa</th><th>Holat</th></tr>
      ${list.map((x) => `<tr><td>${date(x.created_at)}</td><td>${x.plan.toUpperCase()}</td><td>${som(x.amount)}</td><td>${st[x.status]}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">To\'lovlar yo\'q</td></tr>'}
      </table></div><p><a class="btn" href="#/tariflar">Tarif sotib olish</a></p>`;
  }
}
window.delListing = async (id) => { if (!confirm('O\'chirilsinmi?')) return; try { await api('/api/listings/' + id, { method: 'DELETE' }); render(); } catch (e) { toast(e.message); } };

routes['tariflar'] = async () => {
  const P = META.plans;
  const card = (k, featured) => `<div class="card plan ${featured ? 'vip' : ''}"><h3>${P[k].title}</h3>
    <div class="amount">${P[k].price ? som(P[k].price) : 'Bepul'}<span class="muted small">${P[k].price ? ' / oy' : ''}</span></div>
    <ul>${P[k].perks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    ${P[k].price ? `<button class="btn ${featured ? 'gold' : ''}" style="width:100%" onclick="buy('${k}')">${k.toUpperCase()} ni yoqish</button>` : ''}</div>`;
  $app.innerHTML = `<h1>Buxgalterlar uchun tariflar</h1>
    <p class="muted">Ro'yxatdan o'tgach ${META.trialDays} kun Pro bepul. Keyin Oddiy tarifga o'tasiz: profilingiz qoladi, lekin kontaktlar va reyting yopiladi. Mijozlar faol tarifdagi buxgalterlarni tanlaydi.</p>
    <div class="plans">${card('oddiy')}${card('pro')}${card('vip', true)}</div><div id="pay"></div>`;
};
window.buy = (plan) => {
  if (!ME) return go('#/royxat?role=accountant');
  if (ME.user.role !== 'accountant') return toast('Tariflar faqat buxgalterlar uchun');
  const P = META.plans[plan];
  const el = document.getElementById('pay');
  el.innerHTML = `<h2>${P.title} — to'lov</h2><div class="card form">
    <p>1. <b>${som(P.price)}</b> ni quyidagi kartaga o'tkazing:</p>
    <div class="card" style="font-size:20px;font-weight:700;letter-spacing:1px">${esc(META.card.number)}<div class="small muted" style="letter-spacing:0">${esc(META.card.owner)}</div></div>
    <p>2. To'lov chekining skrinshotini yuklang. Admin tekshirgach tarifingiz 30 kunga yoqiladi (odatda 1 soat ichida).</p>
    <form id="pf"><input type="hidden" name="plan" value="${plan}">
      <label>Chek (rasm yoki PDF)</label><input type="file" name="receipt" accept="image/*,application/pdf" required>
      <label>Izoh (ixtiyoriy)</label><input name="note" placeholder="Karta oxirgi 4 raqami, vaqt">
      <div style="margin-top:14px"><button class="btn">Yuborish</button></div></form></div>`;
  el.scrollIntoView({ behavior: 'smooth' });
  document.getElementById('pf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/api/payments', { method: 'POST', form: new FormData(e.target) }); toast('Chek yuborildi, tekshirilmoqda'); go('#/kabinet?t=tolovlar'); }
    catch (err) { toast(err.message); }
  };
};

// Bepul vosita — SEO va trafik uchun
routes['kalkulyator'] = async () => {
  $app.innerHTML = `<h1>Soliq kalkulyatori (taxminiy)</h1>
  <p class="muted">Aylanmadan olinadigan soliqni tez hisoblang. Stavkalar o'zgarishi mumkin, aniq hisob uchun buxgalterga murojaat qiling.</p>
  <div class="card form"><form id="f">
    <label>Oylik aylanma (tushum), so'm</label><input name="rev" type="number" min="0" step="100000" value="50000000">
    <label>Soliq stavkasi, %</label><input name="rate" type="number" min="0" max="100" step="0.5" value="4">
    <label>Ish haqi fondi, so'm/oy</label><input name="pay" type="number" min="0" step="100000" value="0">
    <label>Ijtimoiy soliq, %</label><input name="soc" type="number" min="0" max="100" step="0.5" value="12">
  </form><div id="out" style="margin-top:16px"></div></div>
  <div class="card" style="margin-top:16px" ><b>Hisob-kitob va hisobotlarni buxgalterga topshiring.</b>
  <div class="muted">Bir necha daqiqada takliflar oling.</div><a class="btn" style="margin-top:10px" href="#/zakaz-berish">Buxgalter topish</a></div>`;
  const f = document.getElementById('f');
  const calc = () => {
    const d = formData(f); const t = (+d.rev * +d.rate) / 100; const s = (+d.pay * +d.soc) / 100;
    document.getElementById('out').innerHTML = `<div class="row"><span>Aylanma solig'i / oy</span><b>${som(Math.round(t)) }</b></div>
      <div class="row"><span>Ijtimoiy soliq / oy</span><b>${som(Math.round(s))}</b></div>
      <div class="row" style="border-top:1px solid var(--line);margin-top:8px;padding-top:8px"><span>Jami / yil</span><b>${som(Math.round((t + s) * 12))}</b></div>`;
  };
  f.oninput = calc; calc();
};

routes['admin'] = async (qs) => {
  if (ME?.user.role !== 'admin') return go('#/kirish');
  const tab = qs.get('t') || 'tolovlar';
  const s = await api('/api/admin/stats');
  $app.innerHTML = `<h1>Admin panel</h1>
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr))">
    ${[['Daromad (30 kun)', som(s.revenue_30d)], ['Pullik buxgalterlar', s.paying], ['Sinovda', s.on_trial], ['Jami buxgalter', s.accountants], ['Mijozlar', s.clients], ['Zakazlar', s.orders], ['Kutilayotgan to\'lov', s.pending_payments]]
      .map(([t, v]) => `<div class="card"><div class="muted small">${t}</div><b style="font-size:22px">${v}</b></div>`).join('')}
  </div>
  <div class="tabs" style="margin-top:20px">${[['tolovlar', 'To\'lovlar'], ['buxgalterlar', 'Buxgalterlar']].map(([k, t]) => `<button class="${k === tab ? 'on' : ''}" onclick="go('#/admin?t=${k}')">${t}</button>`).join('')}</div>
  <div id="tab"></div>`;
  const el = document.getElementById('tab');
  if (tab === 'tolovlar') {
    const list = await api('/api/admin/payments?status=pending');
    el.innerHTML = `<div class="tbl"><table><tr><th>Sana</th><th>Buxgalter</th><th>Tarif</th><th>Summa</th><th>Izoh</th><th>Chek</th><th></th></tr>
      ${list.map((p) => `<tr><td>${date(p.created_at)}</td><td>${esc(p.name)}<br><span class="small muted">+${esc(p.phone)}</span></td><td>${p.plan.toUpperCase()}</td>
        <td>${som(p.amount)}</td><td>${esc(p.note)}</td><td><button class="btn ghost sm" onclick="viewReceipt(${p.id})">Ko'rish</button></td>
        <td><button class="btn sm" onclick="payAct(${p.id},'approve')">✓ Tasdiqlash</button> <button class="btn danger sm" onclick="payAct(${p.id},'reject')">Rad</button></td></tr>`).join('')
        || '<tr><td colspan="7" class="muted">Kutilayotgan to\'lov yo\'q</td></tr>'}</table></div>`;
  } else {
    const list = await api('/api/admin/accountants');
    el.innerHTML = `<div class="tbl"><table><tr><th>Ism</th><th>Telefon</th><th>Tarif</th><th>Diplom/sertifikat</th><th>Tasdiq</th></tr>
      ${list.map((a) => `<tr><td><a href="#/b/${a.user_id}">${esc(a.name)}</a></td><td>+${esc(a.phone)}</td><td>${a.effective_plan.toUpperCase()}</td>
        <td class="small">${esc(a.verify_note) || '<span class="muted">—</span>'}</td>
        <td><button class="btn sm ${a.verified ? 'ghost' : ''}" onclick="verifyAcc(${a.user_id}, ${a.verified ? 0 : 1})">${a.verified ? 'Bekor qilish' : 'Tasdiqlash'}</button></td></tr>`).join('')}</table></div>`;
  }
};
window.payAct = async (id, act) => { try { await api(`/api/admin/payments/${id}/${act}`, { method: 'POST', body: {} }); toast('Bajarildi'); render(); } catch (e) { toast(e.message); } };
window.verifyAcc = async (id, v) => { try { await api(`/api/admin/accountants/${id}/verify`, { method: 'POST', body: { verified: v } }); render(); } catch (e) { toast(e.message); } };
window.viewReceipt = async (id) => {
  const res = await fetch(`${API}/api/admin/payments/${id}/receipt`, { headers: { Authorization: 'Bearer ' + token() } });
  if (!res.ok) return toast('Chek topilmadi');
  window.open(URL.createObjectURL(await res.blob()), '_blank');
};

// ---------- router ----------
async function loadMe() {
  ME = null;
  if (token()) { try { ME = await api('/api/me'); } catch { ME = null; } }
}
async function render() {
  const [pathPart, query = ''] = (location.hash.slice(2) || '').split('?');
  const [name, id] = pathPart.split('/');
  const fn = routes[name] || routes[''];
  renderNav();
  document.getElementById('nav').classList.remove('open');
  try { await fn(new URLSearchParams(query), id); }
  catch (e) { $app.innerHTML = `<div class="empty">⚠️ ${esc(e.message)}<br><br><a href="#/">Bosh sahifa</a></div>`; }
  window.scrollTo(0, 0);
}
window.render = render;
window.addEventListener('hashchange', render);

(async () => {
  try { META = await api('/api/meta'); }
  catch { $app.innerHTML = '<div class="empty">⚠️ Server bilan aloqa yo\'q. Birozdan so\'ng qayta urinib ko\'ring.</div>'; return; }
  await loadMe();
  render();
})();
