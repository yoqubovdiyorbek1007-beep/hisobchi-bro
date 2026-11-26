// Telegram bot: @BotFather tokeni bilan long polling (webhook kerak emas, tunnel manzili o'zgarsa ham ishlaydi).
// Vazifalari:
//  - saytdagi hisobni botga ulash (/start <kod>)
//  - buxgalterlarga yangi zakazlar (VIP 10 daqiqa oldin, Oddiy tarifga - tarif taklifi bilan)
//  - mijozga yangi taklif, buxgalterga "sizni tanlashdi", sharh, tarif tugashi eslatmalari
//  - adminga to'lov cheki + Tasdiqlash/Rad tugmalari
import fs from 'node:fs';
import path from 'node:path';
import { all, one, run } from './d1.js';
import { CATEGORIES, PLANS, DAY, now, effectivePlan, planInfo } from './plans.js';
import { reviewPayment } from './payments.js';

const TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const SITE = (process.env.SITE_URL || '').trim().replace(/\/?$/, '/');
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads';
const TG = `https://api.telegram.org/bot${TOKEN}`;
export const VIP_HEAD_START_MIN = 10;

export let botUsername = '';

// ---------- yordamchilar ----------
const h = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const som = (n) => (n ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' so\'m' : 'Kelishiladi');
const fmtDate = (t) => new Date(t * 1000).toLocaleDateString('ru-RU', { timeZone: 'Asia/Tashkent' });
const catTitle = (k) => CATEGORIES.find((c) => c.key === k)?.title || k;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const btn = (text, hash) => (SITE.startsWith('https://') ? [[{ text, url: SITE + '#/' + hash }]] : undefined);

// Fon vazifalari: xato bo'lsa ham API so'roviga ta'sir qilmasin
export const fire = (p) => { Promise.resolve(p).catch((e) => console.error('bot:', e.message)); };

async function tg(method, body) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(`${TG}/${method}`, {
    method: 'POST',
    headers: isForm ? undefined : { 'Content-Type': 'application/json' },
    body: isForm ? body : JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || res.status}`);
  return data.result;
}

async function forgetChatIfBlocked(chatId, e) {
  if (/blocked|deactivated|chat not found|kicked/i.test(e.message)) {
    await run('UPDATE users SET tg_chat_id = NULL WHERE tg_chat_id = ?', [chatId]).catch(() => {});
    return true;
  }
  return false;
}

export async function send(chatId, text, keyboard) {
  if (!TOKEN || !chatId) return;
  try {
    await tg('sendMessage', {
      chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true,
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
  } catch (e) {
    if (!(await forgetChatIfBlocked(chatId, e))) console.error(e.message);
  }
}

const chatOf = async (userId) => (await one('SELECT tg_chat_id FROM users WHERE id = ?', [userId]))?.tg_chat_id;

// ---------- xabarnomalar (server.js chaqiradi) ----------
export async function onNewOrder(orderId) {
  if (!TOKEN) return;
  const o = await one('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!o) return;
  const accs = await all('SELECT a.*, u.tg_chat_id FROM accountants a JOIN users u ON u.id = a.user_id WHERE u.tg_chat_id IS NOT NULL');
  // Xizmatlari mos keladiganlar (xizmat tanlamaganlarga hammasi boradi)
  const match = accs.filter((a) => !a.specializations || (',' + a.specializations + ',').includes(',' + o.category + ','));
  const where = [o.business_type, o.city].filter(Boolean).join(' · ');
  const text = `🆕 <b>Yangi zakaz</b> · ${h(catTitle(o.category))}\n\n<b>${h(o.title)}</b>`
    + (o.description ? `\n${h(o.description.slice(0, 400))}` : '')
    + `\n\n💰 Byudjet: ${som(o.budget)}` + (where ? `\n📍 ${h(where)}` : '');
  const vip = []; const paid = []; const free = [];
  for (const a of match) {
    const p = effectivePlan(a);
    (p === 'vip' ? vip : p === 'oddiy' ? free : paid).push(a);
  }
  for (const a of vip) {
    await send(a.tg_chat_id, text + `\n\n⚡ <i>VIP: siz boshqalardan ${VIP_HEAD_START_MIN} daqiqa oldin ko'ryapsiz</i>`, btn('Taklif yuborish', 'z/' + o.id));
    await sleep(40);
  }
  setTimeout(() => fire((async () => {
    const still = await one("SELECT status FROM orders WHERE id = ?", [o.id]);
    if (still?.status !== 'open') return;
    for (const a of paid) { await send(a.tg_chat_id, text, btn('Taklif yuborish', 'z/' + o.id)); await sleep(40); }
    for (const a of free) {
      await send(a.tg_chat_id,
        `🆕 Yangi zakaz: <b>${h(catTitle(o.category))}</b>, byudjet ${som(o.budget)}.\n\n`
        + 'Bu zakazga taklif yuborish uchun <b>Pro</b> yoki <b>VIP</b> tarif kerak. Boshqa buxgalterlar allaqachon taklif yuborishmoqda.',
        btn('Tarifni yoqish', 'tariflar'));
      await sleep(40);
    }
  })()), VIP_HEAD_START_MIN * 60 * 1000);
}

export async function onNewOffer(orderId, accountantId, price) {
  const o = await one('SELECT o.title, u.tg_chat_id FROM orders o JOIN users u ON u.id = o.client_id WHERE o.id = ?', [orderId]);
  if (!o?.tg_chat_id) return;
  const a = await one('SELECT name FROM users WHERE id = ?', [accountantId]);
  const n = (await one('SELECT COUNT(*) AS n FROM offers WHERE order_id = ?', [orderId])).n;
  await send(o.tg_chat_id,
    `💼 <b>Yangi taklif</b> («${h(o.title)}»)\n\n${h(a?.name)}: <b>${som(price)}</b>\nJami takliflar: ${n}`,
    btn('Takliflarni ko\'rish', 'z/' + orderId));
}

export async function onAccepted(orderId) {
  const o = await one(`SELECT o.title, o.accountant_id, c.name AS client_name, c.phone AS client_phone, u.tg_chat_id
    FROM orders o JOIN users c ON c.id = o.client_id JOIN users u ON u.id = o.accountant_id WHERE o.id = ?`, [orderId]);
  if (!o?.tg_chat_id) return;
  await send(o.tg_chat_id,
    `🎉 <b>Sizni tanlashdi!</b>\n«${h(o.title)}»\n\nMijoz: <b>${h(o.client_name)}</b>\n📞 +${h(o.client_phone)}\n\nMijoz bilan bog'laning.`,
    btn('Zakazni ochish', 'z/' + orderId));
}

export async function onDone(orderId) {
  const o = await one('SELECT o.title, u.tg_chat_id FROM orders o JOIN users u ON u.id = o.accountant_id WHERE o.id = ?', [orderId]);
  if (!o?.tg_chat_id) return;
  await send(o.tg_chat_id, `✅ Mijoz «${h(o.title)}» ishini bajarilgan deb belgiladi. Tez orada baho qoldiradi.`);
}

export async function onReview(orderId, rating, text) {
  const o = await one('SELECT o.title, o.accountant_id, u.tg_chat_id FROM orders o JOIN users u ON u.id = o.accountant_id WHERE o.id = ?', [orderId]);
  if (!o?.tg_chat_id) return;
  await send(o.tg_chat_id,
    `⭐ <b>Yangi sharh</b> («${h(o.title)}»)\n${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}` + (text ? `\n\n«${h(text.slice(0, 500))}»` : ''),
    btn('Profilimni ko\'rish', 'b/' + o.accountant_id));
}

export async function onPayment(paymentId) {
  if (!TOKEN) return;
  const p = await one('SELECT p.*, u.name, u.phone FROM payments p JOIN users u ON u.id = p.accountant_id WHERE p.id = ?', [paymentId]);
  if (!p) return;
  const admins = await all("SELECT tg_chat_id FROM users WHERE role = 'admin' AND tg_chat_id IS NOT NULL");
  if (!admins.length) return;
  const caption = `💳 <b>Yangi to'lov #${p.id}</b>\n\n${h(p.name)} (+${h(p.phone)})\nTarif: <b>${p.plan.toUpperCase()}</b>\nSumma: <b>${som(p.amount)}</b>`
    + (p.note ? `\nIzoh: ${h(p.note)}` : '') + '\n\nKartaga pul tushganini tekshiring.';
  const keyboard = [[{ text: '✓ Tasdiqlash', callback_data: `pay:approve:${p.id}` }, { text: '✗ Rad etish', callback_data: `pay:reject:${p.id}` }]];
  const file = path.join(UPLOAD_DIR, path.basename(p.receipt_file));
  const isImage = /\.(png|jpe?g|webp)$/i.test(file);
  const buf = fs.existsSync(file) ? fs.readFileSync(file) : null;
  for (const a of admins) {
    try {
      if (!buf) { await send(a.tg_chat_id, caption, keyboard); continue; }
      const fd = new FormData();
      fd.append('chat_id', String(a.tg_chat_id));
      fd.append('caption', caption);
      fd.append('parse_mode', 'HTML');
      fd.append('reply_markup', JSON.stringify({ inline_keyboard: keyboard }));
      fd.append(isImage ? 'photo' : 'document', new Blob([buf]), path.basename(file));
      await tg(isImage ? 'sendPhoto' : 'sendDocument', fd);
    } catch (e) {
      // Rasm yuborilmasa (masalan, juda katta) - matn ko'rinishida yuboramiz
      if (!(await forgetChatIfBlocked(a.tg_chat_id, e))) await send(a.tg_chat_id, caption, keyboard);
    }
  }
}

export async function onPaymentReviewed(r) {
  const chat = await chatOf(r.accountant_id);
  if (!chat) return;
  if (r.status === 'approved') {
    await send(chat, `✅ <b>To'lov tasdiqlandi!</b>\n${r.plan.toUpperCase()} tarifi ${fmtDate(r.until)} gacha faol.\n\nKontaktlaringiz ochiq, zakazlarga taklif yuborishingiz mumkin.`,
      btn('Ochiq zakazlar', 'zakazlar'));
  } else {
    await send(chat, '❌ To\'lovingiz rad etildi. Chek yoki summa mos kelmadi. Qayta yuboring yoki admin bilan bog\'laning.', btn('Tariflar', 'tariflar'));
  }
}

// ---------- tarif eslatmalari (har soatda) ----------
async function reminders() {
  const t = now();
  const accs = await all('SELECT a.*, u.tg_chat_id FROM accountants a JOIN users u ON u.id = a.user_id WHERE u.tg_chat_id IS NOT NULL');
  for (const a of accs) {
    const p = effectivePlan(a, t);
    if (p === 'oddiy') {
      const ended = Math.max(a.trial_until, a.plan_until);
      if (ended && ended > t - 3 * DAY && a.expired_for !== ended) {
        await send(a.tg_chat_id,
          '⏳ <b>Tarifingiz tugadi.</b>\nKontaktlaringiz va reytingingiz mijozlarga ko\'rinmaydi, zakazlarga taklif yubora olmaysiz.\n\n'
          + `Pro — ${som(PLANS.pro.price)}/oy, VIP — ${som(PLANS.vip.price)}/oy.`, btn('Tarifni yoqish', 'tariflar'));
        await run('UPDATE accountants SET expired_for = ? WHERE user_id = ?', [ended, a.user_id]);
      }
    } else {
      const until = p === 'trial' ? a.trial_until : a.plan_until;
      const windowSec = p === 'trial' ? DAY : 3 * DAY;
      if (until - t <= windowSec && a.reminded_for !== until) {
        const left = Math.max(1, Math.ceil((until - t) / DAY));
        await send(a.tg_chat_id,
          `⏰ ${p === 'trial' ? 'Bepul sinov muddati' : p.toUpperCase() + ' tarifingiz'} <b>${left} kundan keyin</b> tugaydi (${fmtDate(until)}).\n`
          + 'Uzluksiz zakaz olish uchun oldindan uzaytiring: to\'langan kunlar ustiga qo\'shiladi.', btn('Uzaytirish', 'tariflar'));
        await run('UPDATE accountants SET reminded_for = ? WHERE user_id = ?', [until, a.user_id]);
      }
    }
    await sleep(40);
  }
}

// ---------- bot buyruqlari ----------
const ROLE_HINT = {
  accountant: 'Endi yangi zakazlar, mijoz sizni tanlagani va sharhlar haqida shu yerga xabar keladi.',
  client: 'Endi zakazlaringizga buxgalterlar taklif yuborganda shu yerga xabar keladi.',
  admin: 'Endi yangi to\'lov cheklari shu yerga keladi. Tasdiqlash tugmasi bilan tarifni yoqasiz.',
};

async function linkAccount(chatId, code) {
  const l = await one('SELECT user_id FROM tg_links WHERE code = ? AND expires_at > ?', [code, now()]);
  if (!l) return send(chatId, '⚠️ Havola eskirgan yoki noto\'g\'ri. Saytda <b>Kabinet → Telegramni ulash</b> tugmasini qayta bosing.', btn('Saytni ochish', 'kabinet'));
  await run('UPDATE users SET tg_chat_id = NULL WHERE tg_chat_id = ?', [chatId]);
  await run('UPDATE users SET tg_chat_id = ? WHERE id = ?', [chatId, l.user_id]);
  await run('DELETE FROM tg_links WHERE user_id = ?', [l.user_id]);
  const u = await one('SELECT name, role FROM users WHERE id = ?', [l.user_id]);
  await send(chatId, `✅ <b>${h(u.name)}</b>, hisobingiz ulandi!\n\n${ROLE_HINT[u.role]}\n\nBuyruqlar: /zakazlar, /tarif, /uzish`);
}

async function linkedUser(chatId) {
  return one('SELECT id, name, role FROM users WHERE tg_chat_id = ?', [chatId]);
}

async function handleMessage(m) {
  if (!m.text || m.chat.type !== 'private') return;
  const chatId = m.chat.id;
  const [cmdRaw, arg] = m.text.trim().split(/\s+/, 2);
  const cmd = cmdRaw.split('@')[0].toLowerCase();

  if (cmd === '/start' && arg) return linkAccount(chatId, arg);

  if (cmd === '/start' || cmd === '/help') {
    const u = await linkedUser(chatId);
    return send(chatId,
      '👋 <b>Hisobchi-bro</b> — YaTT va kichik biznes uchun buxgalterlar platformasi.\n\n'
      + (u ? `Hisobingiz ulangan: <b>${h(u.name)}</b>.` : 'Xabarnomalar olish uchun saytda ro\'yxatdan o\'ting va <b>Kabinet → Telegramni ulash</b> ni bosing.')
      + '\n\n/zakazlar — so\'nggi ochiq zakazlar\n/tarif — tarifingiz holati\n/uzish — botni hisobdan uzish',
      btn(u ? 'Kabinetni ochish' : 'Ro\'yxatdan o\'tish', u ? 'kabinet' : 'royxat'));
  }

  if (cmd === '/zakazlar') {
    const list = await all("SELECT id, title, category, budget FROM orders WHERE status = 'open' ORDER BY created_at DESC LIMIT 7");
    if (!list.length) return send(chatId, 'Hozircha ochiq zakaz yo\'q.');
    const text = '📋 <b>So\'nggi ochiq zakazlar</b>\n\n' + list.map((o) => `• <b>${h(o.title)}</b>\n  ${h(catTitle(o.category))} · ${som(o.budget)}`).join('\n\n');
    const kb = SITE.startsWith('https://') ? list.map((o) => [{ text: `#${o.id} ${o.title.slice(0, 40)}`, url: SITE + '#/z/' + o.id }]) : undefined;
    return send(chatId, text, kb);
  }

  if (cmd === '/tarif') {
    const u = await linkedUser(chatId);
    if (!u) return send(chatId, 'Avval saytdagi hisobingizni ulang: <b>Kabinet → Telegramni ulash</b>.', btn('Saytni ochish', 'kirish'));
    if (u.role !== 'accountant') return send(chatId, 'Tariflar faqat buxgalterlar uchun. Mijozlar uchun platforma bepul.');
    const p = planInfo(await one('SELECT * FROM accountants WHERE user_id = ?', [u.id]));
    const line = p.key === 'oddiy'
      ? 'Tarif: <b>Oddiy</b>. Kontaktlar yopiq, zakazlarga taklif yubora olmaysiz.'
      : `Tarif: <b>${h(p.title)}</b>, ${fmtDate(p.until)} gacha.`;
    return send(chatId, `${line}\n\n${p.perks.map((x) => '• ' + h(x)).join('\n')}`, btn('Tariflar', 'tariflar'));
  }

  if (cmd === '/uzish' || cmd === '/stop') {
    await run('UPDATE users SET tg_chat_id = NULL WHERE tg_chat_id = ?', [chatId]);
    return send(chatId, 'Bot hisobingizdan uzildi. Qayta ulash: saytda Kabinet → Telegramni ulash.');
  }

  return send(chatId, 'Buyruqlar: /zakazlar, /tarif, /uzish, /help');
}

async function handleCallback(cq) {
  const answer = (text) => tg('answerCallbackQuery', { callback_query_id: cq.id, text, show_alert: false }).catch(() => {});
  const [kind, action, idRaw] = String(cq.data || '').split(':');
  if (kind !== 'pay' || !['approve', 'reject'].includes(action)) return answer('Noma\'lum amal');
  const admin = await one("SELECT id FROM users WHERE tg_chat_id = ? AND role = 'admin'", [cq.from.id]);
  if (!admin) return answer('Ruxsat yo\'q');
  const r = await reviewPayment(parseInt(idRaw, 10), action);
  const msg = cq.message;
  if (!r) {
    await answer('Bu to\'lov allaqachon ko\'rilgan');
  } else {
    fire(onPaymentReviewed(r));
    await answer(r.status === 'approved' ? 'Tasdiqlandi' : 'Rad etildi');
  }
  // Tugmalarni olib tashlab, natijani yozib qo'yamiz
  if (msg) {
    const mark = !r ? '\n\nℹ️ Allaqachon ko\'rilgan' : r.status === 'approved' ? `\n\n✅ Tasdiqlandi: ${fmtDate(r.until)} gacha` : '\n\n❌ Rad etildi';
    const base = { chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: { inline_keyboard: [] } };
    const req = msg.caption !== undefined
      ? tg('editMessageCaption', { ...base, caption: (msg.caption + mark).slice(0, 1024) })
      : tg('editMessageText', { ...base, text: (msg.text + mark).slice(0, 4096) });
    await req.catch((e) => console.error(e.message));
  }
}

async function poll() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await tg('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
      for (const u of updates) {
        offset = u.update_id + 1;
        try {
          if (u.callback_query) await handleCallback(u.callback_query);
          else if (u.message) await handleMessage(u.message);
        } catch (e) { console.error('bot update:', e.message); }
      }
    } catch (e) {
      console.error('bot poll:', e.message);
      await sleep(5000);
    }
  }
}

export async function startBot() {
  if (!TOKEN) { console.log('Telegram bot o\'chiq (TELEGRAM_BOT_TOKEN berilmagan)'); return; }
  try {
    const me = await tg('getMe');
    botUsername = me.username;
    await tg('deleteWebhook', { drop_pending_updates: false });
    await tg('setMyCommands', { commands: [
      { command: 'zakazlar', description: 'So\'nggi ochiq zakazlar' },
      { command: 'tarif', description: 'Tarifim holati' },
      { command: 'uzish', description: 'Botni hisobdan uzish' },
      { command: 'help', description: 'Yordam' },
    ] });
    await tg('setMyShortDescription', { short_description: 'YaTT va kichik biznes uchun buxgalterlar platformasi. Zakazlar va takliflar haqida xabarnomalar.' });
    await tg('setMyDescription', { description: 'Hisobchi-bro: buxgalter toping yoki zakaz oling.\n\nBuxgalterlarga: yangi zakazlar darhol shu yerga keladi.\nMijozlarga: takliflar haqida xabar.\n\nSaytda ro\'yxatdan o\'ting va Kabinet → Telegramni ulash ni bosing.' });
    if (SITE.startsWith('https://')) {
      await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Sayt', web_app: { url: SITE } } });
    }
    console.log(`Telegram bot: @${botUsername}`);
  } catch (e) {
    console.error('Bot sozlashda xato:', e.message);
  }
  poll();
  setTimeout(() => fire(reminders()), 60 * 1000);
  setInterval(() => fire(reminders()), 60 * 60 * 1000);
}
