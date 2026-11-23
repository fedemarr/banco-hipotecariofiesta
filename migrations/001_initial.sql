PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, surname TEXT NOT NULL, dni TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, phone TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS event (id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL, date_text TEXT NOT NULL, time_text TEXT NOT NULL, location TEXT NOT NULL, description TEXT NOT NULL, sales_open INTEGER NOT NULL DEFAULT 1 CHECK(sales_open IN (0,1)));
CREATE TABLE IF NOT EXISTS ticket_types (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, price_cents INTEGER NOT NULL CHECK(price_cents>=0), capacity INTEGER NOT NULL CHECK(capacity>=0));
CREATE TABLE IF NOT EXISTS purchases (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), type_id TEXT NOT NULL REFERENCES ticket_types(id), amount_cents INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')), created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS purchases_user ON purchases(user_id);
CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL UNIQUE REFERENCES purchases(id), token TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','used','revoked')), entered_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, resource TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);
