// To'lovni tasdiqlash/rad etish. Sayt admin paneli va Telegram bot tugmalari shu funksiyani ishlatadi.
import { one, run } from './d1.js';
import { DAY, PLAN_DAYS, now, effectivePlan } from './plans.js';

// Natija: { ...payment, status, until } yoki null (topilmadi / allaqachon ko'rilgan)
export async function reviewPayment(id, action) {
  const status = action === 'approve' ? 'approved' : 'rejected';
  const p = await one("SELECT * FROM payments WHERE id = ? AND status = 'pending'", [id]);
  if (!p) return null;
  const t = now();
  // Avval holatni shartli o'zgartiramiz: ikki admin bir vaqtda bossa, tarif ikki marta uzaymasin
  const { changes } = await run("UPDATE payments SET status = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'", [status, t, id]);
  if (!changes) return null;
  let until = 0;
  if (status === 'approved') {
    const acc = await one('SELECT * FROM accountants WHERE user_id = ?', [p.accountant_id]);
    const ep = effectivePlan(acc, t);
    // Faol pullik tarif bo'lsa, ustiga 30 kun qo'shiladi
    const base = ep === 'pro' || ep === 'vip' ? acc.plan_until : t;
    until = base + PLAN_DAYS * DAY;
    await run('UPDATE accountants SET plan = ?, plan_until = ? WHERE user_id = ?', [p.plan, until, p.accountant_id]);
  }
  return { ...p, status, until };
}
