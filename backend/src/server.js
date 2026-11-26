import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { all, one, run } from './d1.js';
import {
  PLANS, CATEGORIES, REGIMES, CITIES, BUSINESS_TYPES,
  DAY, TRIAL_DAYS, PLAN_DAYS, now, effectivePlan, planInfo,
} from './plans.js';

const PORT = Number(process.env.PORT || 3000);
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads';
const CARD_NUMBER = process.env.PAY_CARD_NUMBER || '8600 0000 0000 0000';
const CARD_OWNER = process.env.PAY_CARD_OWNER || 'Hisobchi-bro';
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '200kb' }));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase().slice(0, 6)),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^(image\/(png|jpe?g|webp)|application\/pdf)$/.test(file.mimetype)),
});

// ---------- yordamchilar ----------
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : 0; };
const normPhone = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length === 9 ? '998' + d : d; };
const catKeys = new Set(CATEGORIES.map((c) => c.key));

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function checkPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const h = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}
async function newSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [token, userId, now() + 30 * DAY]);
  return token;
}

// Auth middleware: req.user ni o'rnatadi (bo'lsa)
app.use(wrap(async (req, _res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (token) {
    req.user = await one(
      'SELECT u.id, u.role, u.name, u.phone FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?',
      [token, now()],
    );
    req.token = token;
  }
  next();
}));
const need = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Avval tizimga kiring'));
  if (roles.length && !roles.includes(req.user.role)) return next(new HttpError(403, 'Ruxsat yo\'q'));
  next();
};
const getAcc = (id) => one('SELECT * FROM accountants WHERE user_id = ?', [id]);

// ---------- umumiy ----------
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/meta', (_req, res) => {
  res.json({
    categories: CATEGORIES, regimes: REGIMES, cities: CITIES, businessTypes: BUSINESS_TYPES,
    plans: PLANS, trialDays: TRIAL_DAYS, card: { number: CARD_NUMBER, owner: CARD_OWNER },
  });
});

app.get('/api/stats', wrap(async (_req, res) => {
  const r = await one(`SELECT
    (SELECT COUNT(*) FROM accountants) AS accountants,
    (SELECT COUNT(*) FROM orders) AS orders,
    (SELECT COUNT(*) FROM orders WHERE status = 'done') AS done`);
  res.json(r);
}));

// ---------- auth ----------
app.post('/api/auth/register', wrap(async (req, res) => {
  const role = req.body.role === 'accountant' ? 'accountant' : 'client';
  const name = str(req.body.name, 80);
  const phone = normPhone(req.body.phone);
  const password = String(req.body.password || '');
  if (name.length < 2) fail(400, 'Ismingizni kiriting');
  if (!/^998\d{9}$/.test(phone)) fail(400, 'Telefon raqam noto\'g\'ri (masalan: 90 123 45 67)');
  if (password.length < 6) fail(400, 'Parol kamida 6 ta belgi bo\'lsin');
  if (await one('SELECT id FROM users WHERE phone = ?', [phone])) fail(409, 'Bu raqam allaqachon ro\'yxatdan o\'tgan');
  const { last_row_id: id } = await run(
    'INSERT INTO users (role, name, phone, password_hash) VALUES (?, ?, ?, ?)', [role, name, phone, hashPassword(password)]);
  if (role === 'accountant') {
    await run('INSERT INTO accountants (user_id, trial_until) VALUES (?, ?)', [id, now() + TRIAL_DAYS * DAY]);
  }
  res.json({ token: await newSession(id) });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const u = await one('SELECT id, password_hash FROM users WHERE phone = ?', [normPhone(req.body.phone)]);
  if (!u || !checkPassword(String(req.body.password || ''), u.password_hash)) fail(401, 'Telefon yoki parol noto\'g\'ri');
  res.json({ token: await newSession(u.id) });
}));

app.post('/api/auth/logout', need(), wrap(async (req, res) => {
  await run('DELETE FROM sessions WHERE token = ?', [req.token]);
  res.json({ ok: true });
}));

app.get('/api/me', need(), wrap(async (req, res) => {
  const out = { user: req.user };
  if (req.user.role === 'accountant') {
    const acc = await getAcc(req.user.id);
    out.accountant = acc;
    out.plan = planInfo(acc);
    out.listingsUsed = (await one('SELECT COUNT(*) AS n FROM listings WHERE accountant_id = ? AND active = 1', [req.user.id])).n;
  }
  res.json(out);
}));

// ---------- buxgalterlar katalogi ----------
function publicAccountant(a, { full = false } = {}) {
  const p = planInfo(a);
  const o = {
    id: a.user_id, name: a.name, city: a.city, bio: full ? a.bio : a.bio.slice(0, 220),
    experience_years: a.experience_years, specializations: a.specializations ? a.specializations.split(',') : [],
    tax_regimes: a.tax_regimes ? a.tax_regimes.split(',') : [], price_from: a.price_from,
    clients_count: a.clients_count, verified: !!a.verified, plan: p.key,
    active: p.key !== 'oddiy',
  };
  // Retention mantiqi: reyting va sharhlar faqat faol tarifda ko'rinadi
  if (p.reputation) {
    o.rating = a.rating_count ? +(a.rating_sum / a.rating_count).toFixed(1) : null;
    o.rating_count = a.rating_count;
  }
  if (full && p.contacts) o.contacts = { phone: '+' + a.phone, telegram: a.telegram };
  return o;
}

app.get('/api/accountants', wrap(async (req, res) => {
  const where = ['1=1'];
  const params = [];
  if (catKeys.has(req.query.category)) { where.push("(',' || a.specializations || ',') LIKE ?"); params.push(`%,${req.query.category},%`); }
  if (req.query.city) { where.push('a.city = ?'); params.push(str(req.query.city, 60)); }
  if (req.query.regime) { where.push("(',' || a.tax_regimes || ',') LIKE ?"); params.push(`%,${str(req.query.regime, 60)},%`); }
  if (req.query.q) { where.push('(u.name LIKE ? OR a.bio LIKE ?)'); const s = `%${str(req.query.q, 60)}%`; params.push(s, s); }
  const rows = await all(
    `SELECT a.*, u.name, u.phone FROM accountants a JOIN users u ON u.id = a.user_id WHERE ${where.join(' AND ')} LIMIT 500`, params);
  const rank = { vip: 3, pro: 2, trial: 2, oddiy: 0 };
  const list = rows.map((a) => publicAccountant(a)).sort((x, y) =>
    (rank[y.plan] - rank[x.plan]) || (y.verified - x.verified) || ((y.rating || 0) - (x.rating || 0)) || ((y.rating_count || 0) - (x.rating_count || 0)));
  res.json(list);
}));

app.get('/api/accountants/:id', wrap(async (req, res) => {
  const a = await one('SELECT a.*, u.name, u.phone FROM accountants a JOIN users u ON u.id = a.user_id WHERE a.user_id = ?', [int(req.params.id)]);
  if (!a) fail(404, 'Buxgalter topilmadi');
  const p = planInfo(a);
  const out = publicAccountant(a, { full: true });
  // Tarif limitidan ortiq e'lonlar ko'rinmaydi
  out.listings = await all('SELECT id, category, title, description, price FROM listings WHERE accountant_id = ? AND active = 1 ORDER BY created_at LIMIT ?', [a.user_id, p.listings]);
  out.reviews = p.reputation
    ? await all('SELECT r.rating, r.text, r.created_at, u.name AS client_name FROM reviews r JOIN users u ON u.id = r.client_id WHERE r.accountant_id = ? ORDER BY r.created_at DESC LIMIT 50', [a.user_id])
    : [];
  res.json(out);
}));

app.put('/api/me/profile', need('accountant'), wrap(async (req, res) => {
  const b = req.body;
  const specs = (Array.isArray(b.specializations) ? b.specializations : []).filter((k) => catKeys.has(k)).join(',');
  const regs = (Array.isArray(b.tax_regimes) ? b.tax_regimes : []).filter((r) => REGIMES.includes(r)).join(',');
  await run(`UPDATE accountants SET city = ?, bio = ?, experience_years = ?, specializations = ?, tax_regimes = ?,
             price_from = ?, telegram = ?, clients_count = ?, verify_note = ? WHERE user_id = ?`,
  [str(b.city, 60) || 'Toshkent', str(b.bio, 2000), int(b.experience_years), specs, regs, int(b.price_from),
    str(b.telegram, 60).replace(/^@?/, '@').replace(/^@$/, ''), int(b.clients_count), str(b.verify_note, 500), req.user.id]);
  if (b.name) await run('UPDATE users SET name = ? WHERE id = ?', [str(b.name, 80), req.user.id]);
  res.json({ ok: true });
}));

// ---------- e'lonlar ----------
app.get('/api/me/listings', need('accountant'), wrap(async (req, res) => {
  res.json(await all('SELECT * FROM listings WHERE accountant_id = ? AND active = 1 ORDER BY created_at', [req.user.id]));
}));

app.post('/api/listings', need('accountant'), wrap(async (req, res) => {
  const p = planInfo(await getAcc(req.user.id));
  const { n } = await one('SELECT COUNT(*) AS n FROM listings WHERE accountant_id = ? AND active = 1', [req.user.id]);
  if (n >= p.listings) fail(402, `"${p.title}" tarifida ${p.listings} ta e'lon mumkin. Ko'proq e'lon uchun tarifni oshiring.`);
  const title = str(req.body.title, 120);
  if (title.length < 5) fail(400, 'Sarlavha juda qisqa');
  const category = catKeys.has(req.body.category) ? req.body.category : 'boshqa';
  const { last_row_id } = await run('INSERT INTO listings (accountant_id, category, title, description, price) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, category, title, str(req.body.description, 2000), int(req.body.price)]);
  res.json({ id: last_row_id });
}));

app.delete('/api/listings/:id', need('accountant'), wrap(async (req, res) => {
  await run('UPDATE listings SET active = 0 WHERE id = ? AND accountant_id = ?', [int(req.params.id), req.user.id]);
  res.json({ ok: true });
}));

// ---------- zakazlar birjasi ----------
app.get('/api/orders', wrap(async (req, res) => {
  const params = [];
  let extra = '';
  if (catKeys.has(req.query.category)) { extra = ' AND o.category = ?'; params.push(req.query.category); }
  res.json(await all(
    `SELECT o.id, o.category, o.title, o.description, o.budget, o.city, o.business_type, o.created_at,
       (SELECT COUNT(*) FROM offers f WHERE f.order_id = o.id) AS offers_count
     FROM orders o WHERE o.status = 'open'${extra} ORDER BY o.created_at DESC LIMIT 200`, params));
}));

app.post('/api/orders', need('client'), wrap(async (req, res) => {
  const title = str(req.body.title, 120);
  if (title.length < 5) fail(400, 'Vazifani qisqacha yozing (kamida 5 belgi)');
  const { n } = await one("SELECT COUNT(*) AS n FROM orders WHERE client_id = ? AND status = 'open'", [req.user.id]);
  if (n >= 10) fail(429, 'Bir vaqtda 10 tadan ortiq ochiq zakaz bo\'lishi mumkin emas');
  const { last_row_id } = await run(
    'INSERT INTO orders (client_id, category, title, description, budget, city, business_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.user.id, catKeys.has(req.body.category) ? req.body.category : 'boshqa', title, str(req.body.description, 3000),
      int(req.body.budget), str(req.body.city, 60), BUSINESS_TYPES.includes(req.body.business_type) ? req.body.business_type : '']);
  res.json({ id: last_row_id });
}));

app.get('/api/orders/:id', wrap(async (req, res) => {
  const o = await one('SELECT * FROM orders WHERE id = ?', [int(req.params.id)]);
  if (!o) fail(404, 'Zakaz topilmadi');
  const u = req.user;
  const isOwner = u && u.id === o.client_id;
  const isAssigned = u && u.id === o.accountant_id;
  if (o.status !== 'open' && !isOwner && !isAssigned && u?.role !== 'admin') fail(404, 'Zakaz yopilgan');
  const out = { ...o, is_owner: !!isOwner, is_assigned: !!isAssigned };
  delete out.client_id;
  if (isOwner) {
    const offers = await all(
      `SELECT f.*, u.name, u.phone, a.* FROM offers f JOIN users u ON u.id = f.accountant_id
       JOIN accountants a ON a.user_id = f.accountant_id WHERE f.order_id = ?`, [o.id]);
    const rank = { vip: 3, pro: 2, trial: 2, oddiy: 0 };
    out.offers = offers.map((f) => {
      const acc = publicAccountant(f);
      return { id: f.id, price: f.price, message: f.message, status: f.status, created_at: f.created_at, accountant: acc,
        phone: f.status === 'accepted' ? '+' + f.phone : undefined, telegram: f.status === 'accepted' ? f.telegram : undefined };
    }).sort((x, y) => (rank[y.accountant.plan] - rank[x.accountant.plan]) || ((y.accountant.rating || 0) - (x.accountant.rating || 0)));
    out.review = await one('SELECT rating, text FROM reviews WHERE order_id = ?', [o.id]);
  } else if (u?.role === 'accountant') {
    out.my_offer = await one('SELECT price, message, status FROM offers WHERE order_id = ? AND accountant_id = ?', [o.id, u.id]);
  }
  if (isAssigned) {
    const c = await one('SELECT name, phone FROM users WHERE id = ?', [o.client_id]);
    out.client = { name: c.name, phone: '+' + c.phone };
  }
  res.json(out);
}));

app.post('/api/orders/:id/offers', need('accountant'), wrap(async (req, res) => {
  const p = planInfo(await getAcc(req.user.id));
  if (!p.offers) fail(402, 'Zakazlarga taklif yuborish uchun Pro yoki VIP tarif kerak');
  const o = await one("SELECT id FROM orders WHERE id = ? AND status = 'open'", [int(req.params.id)]);
  if (!o) fail(404, 'Zakaz yopilgan yoki topilmadi');
  const price = int(req.body.price);
  if (!price) fail(400, 'Narxni kiriting');
  try {
    await run('INSERT INTO offers (order_id, accountant_id, price, message) VALUES (?, ?, ?, ?)',
      [o.id, req.user.id, price, str(req.body.message, 1500)]);
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) fail(409, 'Bu zakazga allaqachon taklif yuborgansiz');
    throw e;
  }
  res.json({ ok: true });
}));

async function ownOrder(req, status) {
  const o = await one('SELECT * FROM orders WHERE id = ? AND client_id = ?', [int(req.params.id), req.user.id]);
  if (!o) fail(404, 'Zakaz topilmadi');
  if (status && o.status !== status) fail(400, 'Zakaz holati bu amalga mos emas');
  return o;
}

app.post('/api/orders/:id/accept', need('client'), wrap(async (req, res) => {
  const o = await ownOrder(req, 'open');
  const f = await one('SELECT * FROM offers WHERE id = ? AND order_id = ?', [int(req.body.offer_id), o.id]);
  if (!f) fail(404, 'Taklif topilmadi');
  await run("UPDATE orders SET status = 'assigned', accountant_id = ? WHERE id = ?", [f.accountant_id, o.id]);
  await run("UPDATE offers SET status = CASE WHEN id = ? THEN 'accepted' ELSE 'rejected' END WHERE order_id = ?", [f.id, o.id]);
  res.json({ ok: true });
}));

app.post('/api/orders/:id/done', need('client'), wrap(async (req, res) => {
  const o = await ownOrder(req, 'assigned');
  await run("UPDATE orders SET status = 'done' WHERE id = ?", [o.id]);
  res.json({ ok: true });
}));

app.post('/api/orders/:id/close', need('client'), wrap(async (req, res) => {
  const o = await ownOrder(req, 'open');
  await run("UPDATE orders SET status = 'closed' WHERE id = ?", [o.id]);
  res.json({ ok: true });
}));

// Sharh: faqat yakunlangan zakaz egasi, bir marta
app.post('/api/orders/:id/review', need('client'), wrap(async (req, res) => {
  const o = await ownOrder(req, 'done');
  const rating = int(req.body.rating);
  if (rating < 1 || rating > 5) fail(400, 'Bahoni 1 dan 5 gacha tanlang');
  try {
    await run('INSERT INTO reviews (order_id, accountant_id, client_id, rating, text) VALUES (?, ?, ?, ?, ?)',
      [o.id, o.accountant_id, req.user.id, rating, str(req.body.text, 1500)]);
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) fail(409, 'Sharh allaqachon qoldirilgan');
    throw e;
  }
  await run('UPDATE accountants SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE user_id = ?', [rating, o.accountant_id]);
  res.json({ ok: true });
}));

app.get('/api/me/orders', need('client', 'accountant'), wrap(async (req, res) => {
  if (req.user.role === 'client') {
    return res.json(await all(
      `SELECT o.*, (SELECT COUNT(*) FROM offers f WHERE f.order_id = o.id) AS offers_count
       FROM orders o WHERE o.client_id = ? ORDER BY o.created_at DESC`, [req.user.id]));
  }
  res.json(await all(
    `SELECT o.id, o.title, o.category, o.budget, o.status, o.created_at, f.price AS my_price, f.status AS offer_status
     FROM offers f JOIN orders o ON o.id = f.order_id WHERE f.accountant_id = ? ORDER BY f.created_at DESC`, [req.user.id]));
}));

// ---------- to'lovlar (qo'lda tasdiqlash) ----------
app.post('/api/payments', need('accountant'), upload.single('receipt'), wrap(async (req, res) => {
  const plan = req.body.plan;
  if (!['pro', 'vip'].includes(plan)) fail(400, 'Tarifni tanlang');
  if (!req.file) fail(400, 'To\'lov cheki rasmini yuklang (PNG/JPG/PDF, 5MB gacha)');
  const pending = await one("SELECT id FROM payments WHERE accountant_id = ? AND status = 'pending'", [req.user.id]);
  if (pending) { fs.rmSync(req.file.path, { force: true }); fail(409, 'Oldingi to\'lovingiz hali tekshirilmoqda'); }
  await run('INSERT INTO payments (accountant_id, plan, amount, receipt_file, note) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, plan, PLANS[plan].price, req.file.filename, str(req.body.note, 300)]);
  res.json({ ok: true });
}));

app.get('/api/me/payments', need('accountant'), wrap(async (req, res) => {
  res.json(await all('SELECT id, plan, amount, status, created_at, reviewed_at FROM payments WHERE accountant_id = ? ORDER BY created_at DESC', [req.user.id]));
}));

// ---------- admin ----------
app.get('/api/admin/stats', need('admin'), wrap(async (_req, res) => {
  const t = now();
  const month = t - 30 * DAY;
  res.json(await one(`SELECT
    (SELECT COUNT(*) FROM accountants) AS accountants,
    (SELECT COUNT(*) FROM accountants WHERE plan IN ('pro','vip') AND plan_until > ?) AS paying,
    (SELECT COUNT(*) FROM accountants WHERE trial_until > ? AND NOT (plan IN ('pro','vip') AND plan_until > ?)) AS on_trial,
    (SELECT COUNT(*) FROM users WHERE role = 'client') AS clients,
    (SELECT COUNT(*) FROM orders) AS orders,
    (SELECT COUNT(*) FROM payments WHERE status = 'pending') AS pending_payments,
    (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status = 'approved' AND reviewed_at > ?) AS revenue_30d`, [t, t, t, month]));
}));

app.get('/api/admin/payments', need('admin'), wrap(async (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  res.json(await all(
    `SELECT p.*, u.name, u.phone FROM payments p JOIN users u ON u.id = p.accountant_id
     WHERE p.status = ? ORDER BY p.created_at DESC LIMIT 200`, [status]));
}));

app.get('/api/admin/payments/:id/receipt', need('admin'), wrap(async (req, res) => {
  const p = await one('SELECT receipt_file FROM payments WHERE id = ?', [int(req.params.id)]);
  if (!p) fail(404, 'Topilmadi');
  res.sendFile(path.join(UPLOAD_DIR, path.basename(p.receipt_file)));
}));

app.post('/api/admin/payments/:id/:action(approve|reject)', need('admin'), wrap(async (req, res) => {
  const p = await one("SELECT * FROM payments WHERE id = ? AND status = 'pending'", [int(req.params.id)]);
  if (!p) fail(404, 'To\'lov topilmadi yoki allaqachon ko\'rilgan');
  const t = now();
  if (req.params.action === 'approve') {
    const acc = await getAcc(p.accountant_id);
    // Faol tarif bo'lsa ustiga 30 kun qo'shiladi
    const base = effectivePlan(acc, t) === 'pro' || effectivePlan(acc, t) === 'vip' ? acc.plan_until : t;
    await run('UPDATE accountants SET plan = ?, plan_until = ? WHERE user_id = ?', [p.plan, base + PLAN_DAYS * DAY, p.accountant_id]);
  }
  await run('UPDATE payments SET status = ?, reviewed_at = ? WHERE id = ?', [req.params.action === 'approve' ? 'approved' : 'rejected', t, p.id]);
  res.json({ ok: true });
}));

app.get('/api/admin/accountants', need('admin'), wrap(async (_req, res) => {
  const rows = await all('SELECT a.*, u.name, u.phone, u.created_at FROM accountants a JOIN users u ON u.id = a.user_id ORDER BY u.created_at DESC LIMIT 500');
  res.json(rows.map((a) => ({ ...a, effective_plan: effectivePlan(a) })));
}));

app.post('/api/admin/accountants/:id/verify', need('admin'), wrap(async (req, res) => {
  await run('UPDATE accountants SET verified = ? WHERE user_id = ?', [req.body.verified ? 1 : 0, int(req.params.id)]);
  res.json({ ok: true });
}));

// ---------- xatolar ----------
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: 'Fayl juda katta yoki noto\'g\'ri' });
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return res.status(400).json({ error: 'So\'rov noto\'g\'ri formatda' });
  console.error(err);
  res.status(500).json({ error: 'Serverda xatolik. Keyinroq urinib ko\'ring.' });
});

// Admin hisobini .env dan yaratish
async function seedAdmin() {
  const phone = normPhone(process.env.ADMIN_PHONE);
  const pw = process.env.ADMIN_PASSWORD;
  if (!phone || !pw) return;
  const u = await one('SELECT id FROM users WHERE phone = ?', [phone]);
  if (!u) {
    await run("INSERT INTO users (role, name, phone, password_hash) VALUES ('admin', 'Admin', ?, ?)", [phone, hashPassword(pw)]);
    console.log('Admin yaratildi:', phone);
  }
}

seedAdmin().catch((e) => console.error('Admin seed xatosi:', e.message));
app.listen(PORT, () => console.log(`Hisobchi-bro API :${PORT} da ishlayapti`));
