-- Hisobchi-bro: D1 (SQLite) sxemasi
-- Rol: client (fuqaro/YaTT/biznes), accountant (buxgalter), admin

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK (role IN ('client','accountant','admin')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  tg_chat_id INTEGER,                         -- Telegram bot ulangan chat
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

-- Buxgalter profili. Tarif: trial (7 kun, Pro imkoniyatlari) -> oddiy | pro | vip
CREATE TABLE IF NOT EXISTS accountants (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  city TEXT NOT NULL DEFAULT 'Toshkent',
  bio TEXT NOT NULL DEFAULT '',
  experience_years INTEGER NOT NULL DEFAULT 0,
  specializations TEXT NOT NULL DEFAULT '',   -- vergul bilan: kategoriya kalitlari
  tax_regimes TEXT NOT NULL DEFAULT '',       -- vergul bilan: soliq rejimlari
  price_from INTEGER NOT NULL DEFAULT 0,      -- so'm/oy
  telegram TEXT NOT NULL DEFAULT '',
  clients_count INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,        -- admin hujjatni tekshirgan
  verify_note TEXT NOT NULL DEFAULT '',       -- diplom/sertifikat haqida
  plan TEXT NOT NULL DEFAULT 'oddiy' CHECK (plan IN ('oddiy','pro','vip')),
  plan_until INTEGER NOT NULL DEFAULT 0,
  trial_until INTEGER NOT NULL DEFAULT 0,
  rating_sum INTEGER NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  reminded_for INTEGER NOT NULL DEFAULT 0,
  expired_for INTEGER NOT NULL DEFAULT 0
);

-- Buxgalter e'lonlari (xizmat kartochkalari)
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  accountant_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Mijoz zakazlari (birja)
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  budget INTEGER NOT NULL DEFAULT 0,
  city TEXT NOT NULL DEFAULT '',
  business_type TEXT NOT NULL DEFAULT '',     -- YaTT, MChJ, jismoniy shaxs
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','done','closed')),
  accountant_id INTEGER REFERENCES users(id), -- tanlangan buxgalter
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Buxgalter takliflari zakazga
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  accountant_id INTEGER NOT NULL REFERENCES users(id),
  price INTEGER NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','accepted','rejected')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (order_id, accountant_id)
);

-- Sharh faqat platforma orqali yakunlangan zakaz uchun (soxta sharh yo'q)
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
  accountant_id INTEGER NOT NULL REFERENCES users(id),
  client_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Qo'lda tasdiqlanadigan to'lovlar (karta o'tkazma + chek)
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  accountant_id INTEGER NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL CHECK (plan IN ('pro','vip')),
  amount INTEGER NOT NULL,
  receipt_file TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  reviewed_at INTEGER
);

-- Telegram bot: saytdagi hisobni botga ulash uchun bir martalik kodlar
CREATE TABLE IF NOT EXISTS tg_links (
  code TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

-- Mavjud bazaga migratsiya (2026-11-26, allaqachon qo'llangan): Telegram bot
-- ALTER TABLE users ADD COLUMN tg_chat_id INTEGER;
-- ALTER TABLE accountants ADD COLUMN reminded_for INTEGER NOT NULL DEFAULT 0;  -- qaysi muddat tugashi haqida eslatildi
-- ALTER TABLE accountants ADD COLUMN expired_for INTEGER NOT NULL DEFAULT 0;   -- qaysi muddat tugagani haqida xabar berildi

CREATE INDEX IF NOT EXISTS idx_users_tg ON users(tg_chat_id);
CREATE INDEX IF NOT EXISTS idx_listings_acc ON listings(accountant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_offers_order ON offers(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_acc ON reviews(accountant_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
