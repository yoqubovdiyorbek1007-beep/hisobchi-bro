// Cloudflare D1 ga REST API orqali ulanish (bepul tarif).
const ACCOUNT = process.env.CF_ACCOUNT_ID;
const DB = process.env.D1_DATABASE_ID;
const TOKEN = process.env.CF_API_TOKEN;

if (!ACCOUNT || !DB || !TOKEN) {
  console.error('XATO: CF_ACCOUNT_ID, D1_DATABASE_ID, CF_API_TOKEN .env da berilishi shart');
  process.exit(1);
}

const URL_ = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`;

export async function q(sql, params = []) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params: params.map((p) => (p === undefined ? null : p)) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    const msg = data?.errors?.map((e) => e.message).join('; ') || res.statusText;
    throw new Error('D1: ' + msg);
  }
  const r = data.result[0];
  return { rows: r.results || [], meta: r.meta || {} };
}

export async function all(sql, params) {
  return (await q(sql, params)).rows;
}

export async function one(sql, params) {
  return (await q(sql, params)).rows[0] || null;
}

export async function run(sql, params) {
  return (await q(sql, params)).meta; // { last_row_id, changes }
}
