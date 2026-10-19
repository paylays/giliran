-- All times are epoch milliseconds (UTC). service_date is the local date in the business timezone.

CREATE TABLE settings (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  business_name  TEXT NOT NULL,
  timezone       TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  near_threshold INTEGER NOT NULL DEFAULT 3 CHECK (near_threshold BETWEEN 1 AND 20),
  updated_at     INTEGER NOT NULL
);

INSERT INTO settings (id, business_name, timezone, near_threshold, updated_at)
VALUES (1, 'Giliran', 'Asia/Jakarta', 3, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE CHECK (username = lower(username)),
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    INTEGER NOT NULL
);

CREATE TABLE services (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  prefix       TEXT NOT NULL UNIQUE CHECK (prefix = upper(prefix) AND length(prefix) BETWEEN 1 AND 3),
  number_width INTEGER NOT NULL DEFAULT 3 CHECK (number_width BETWEEN 1 AND 6),
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);

CREATE TABLE counters (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE counter_services (
  counter_id INTEGER NOT NULL REFERENCES counters (id),
  service_id INTEGER NOT NULL REFERENCES services (id),
  PRIMARY KEY (counter_id, service_id)
);

CREATE INDEX counter_services_by_service ON counter_services (service_id);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  counter_id INTEGER REFERENCES counters (id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX sessions_by_user ON sessions (user_id);
CREATE INDEX sessions_by_expiry ON sessions (expires_at);

CREATE TABLE daily_sequences (
  service_id   INTEGER NOT NULL REFERENCES services (id),
  service_date TEXT NOT NULL,
  last_number  INTEGER NOT NULL,
  PRIMARY KEY (service_id, service_date)
);

CREATE TABLE tickets (
  id           INTEGER PRIMARY KEY,
  public_token TEXT NOT NULL UNIQUE,
  service_id   INTEGER NOT NULL REFERENCES services (id),
  service_date TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  number       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'called', 'done', 'skipped')),
  counter_id   INTEGER REFERENCES counters (id),
  called_by    INTEGER REFERENCES users (id),
  call_count   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  called_at    INTEGER,
  finished_at  INTEGER,
  UNIQUE (service_id, service_date, seq)
);

-- Backstop: a counter can hold only one called ticket at a time.
CREATE UNIQUE INDEX tickets_one_called_per_counter ON tickets (counter_id) WHERE status = 'called';
CREATE INDEX tickets_by_day_status ON tickets (service_date, status, created_at);
