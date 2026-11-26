// Biznes mantiq: tariflar va ularning imkoniyatlari.
export const DAY = 86400;
export const TRIAL_DAYS = 7;
export const PLAN_DAYS = 30;

export const PLANS = {
  oddiy: {
    title: 'Oddiy', price: 0,
    listings: 1, contacts: false, offers: false, reputation: false, top: false,
    perks: ['1 ta e\'lon', 'Kontaktlar yopiq', 'Zakazlarga taklif yubora olmaydi', 'Reyting va sharhlar yashirin'],
  },
  trial: {
    title: 'Sinov (7 kun)', price: 0,
    listings: 5, contacts: true, offers: true, reputation: true, top: false,
    perks: ['Pro imkoniyatlari 7 kun bepul'],
  },
  pro: {
    title: 'Pro', price: 70000,
    listings: 5, contacts: true, offers: true, reputation: true, top: false,
    perks: ['5 ta e\'lon', 'Kontaktlar ochiq', 'Zakazlarga taklif yuborish', 'Reyting va sharhlar ko\'rinadi', 'Yangi zakazlar Telegramga keladi'],
  },
  vip: {
    title: 'VIP', price: 100000,
    listings: 999, contacts: true, offers: true, reputation: true, top: true,
    perks: ['Cheksiz e\'lon', 'Qidiruvda TOP o\'rin', 'Takliflaringiz birinchi ko\'rinadi', 'Yangi zakazlar Telegramga 10 daqiqa oldin keladi', 'VIP belgisi', 'Pro ning barcha imkoniyatlari'],
  },
};

export const now = () => Math.floor(Date.now() / 1000);

export function effectivePlan(acc, t = now()) {
  if (!acc) return 'oddiy';
  if ((acc.plan === 'pro' || acc.plan === 'vip') && acc.plan_until > t) return acc.plan;
  if (acc.trial_until > t) return 'trial';
  return 'oddiy';
}

export function planInfo(acc) {
  const key = effectivePlan(acc);
  const until = key === 'trial' ? acc.trial_until : key === 'oddiy' ? 0 : acc.plan_until;
  return { key, until, ...PLANS[key] };
}

// YaTT va kichik biznes uchun xizmat kategoriyalari
export const CATEGORIES = [
  { key: 'oylik', title: 'Oylik buxgalteriya xizmati' },
  { key: 'hisobot', title: 'Soliq hisobotlari' },
  { key: 'ochish', title: 'YaTT / MChJ ochish va yopish' },
  { key: '1c', title: '1C dasturi' },
  { key: 'kadr', title: 'Ish haqi va kadrlar' },
  { key: 'tekshiruv', title: 'Soliq tekshiruvi, maslahat' },
  { key: 'ifrs', title: 'Moliyaviy hisobot (MHXS)' },
  { key: 'boshqa', title: 'Boshqa' },
];

export const REGIMES = ['Aylanmadan olinadigan soliq', 'QQS', 'Foyda solig\'i', 'YaTT qat\'iy soliq', 'Jismoniy shaxs (3-JShDS)'];

export const CITIES = ['Toshkent', 'Toshkent viloyati', 'Samarqand', 'Buxoro', 'Andijon', 'Farg\'ona', 'Namangan', 'Qashqadaryo', 'Surxondaryo', 'Xorazm', 'Navoiy', 'Jizzax', 'Sirdaryo', 'Qoraqalpog\'iston', 'Onlayn (masofaviy)'];

export const BUSINESS_TYPES = ['YaTT', 'MChJ', 'Jismoniy shaxs', 'Boshqa'];
