// Banco de dados SQLite (módulo nativo node:sqlite — sem dependências nativas para compilar).
// Migrações versionadas e idempotentes. WAL + foreign keys para não perder dados.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { log } from './logger.js';

const MIGRATIONS = [
  // 1 — núcleo
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'estudante',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    answers TEXT NOT NULL DEFAULT '{}',
    onboarding_step INTEGER NOT NULL DEFAULT 0,
    onboarding_done_at TEXT,
    diagnostic_done_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE questions (
    id TEXT PRIMARY KEY,
    discipline TEXT NOT NULL,
    topic TEXT NOT NULL,
    subtopic TEXT,
    difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 4),
    type TEXT NOT NULL DEFAULT 'multipla_escolha',
    origin TEXT NOT NULL CHECK (origin IN ('oficial','adaptada','inedita_ia')),
    style_ref TEXT,
    source TEXT,
    statement TEXT NOT NULL,
    alternatives TEXT,
    answer TEXT,
    expected_answer TEXT,
    explanation TEXT NOT NULL,
    wrong_notes TEXT,
    concept TEXT,
    skills TEXT,
    created_for_user INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ativa',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_q_disc ON questions(discipline, topic, difficulty);

  CREATE TABLE attempts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES questions(id),
    context TEXT NOT NULL,
    context_id INTEGER,
    chosen TEXT,
    correct INTEGER NOT NULL,
    confidence TEXT NOT NULL DEFAULT 'certeza',
    time_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_att_user ON attempts(user_id, created_at);
  CREATE INDEX idx_att_q ON attempts(user_id, question_id);

  CREATE TABLE topic_mastery (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    discipline TEXT NOT NULL,
    topic TEXT NOT NULL,
    theta REAL NOT NULL DEFAULT -0.5,
    attempts INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    guessed_correct INTEGER NOT NULL DEFAULT 0,
    recent TEXT NOT NULL DEFAULT '[]',
    level TEXT NOT NULL DEFAULT 'nao_avaliado',
    lessons_done INTEGER NOT NULL DEFAULT 0,
    last_practice_at TEXT,
    next_review_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, discipline, topic)
  );

  CREATE TABLE saved_questions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES questions(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, question_id)
  );

  CREATE TABLE error_notebook (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES questions(id),
    attempt_id INTEGER REFERENCES attempts(id) ON DELETE SET NULL,
    discipline TEXT NOT NULL,
    topic TEXT NOT NULL,
    chosen TEXT,
    error_type TEXT,
    student_note TEXT,
    analysis TEXT,
    status TEXT NOT NULL DEFAULT 'aberto',
    recovery_question_id TEXT,
    recovery_steps TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  );
  CREATE INDEX idx_err_user ON error_notebook(user_id, status);

  CREATE TABLE diagnostics (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'em_andamento',
    state TEXT NOT NULL,
    report TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
  );

  CREATE TABLE conversations (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    discipline TEXT,
    topic TEXT,
    mode TEXT NOT NULL DEFAULT 'chat',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_conv_user ON conversations(user_id, updated_at);
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content TEXT NOT NULL,
    images TEXT,
    meta TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_msg_conv ON messages(conversation_id, id);

  CREATE TABLE lessons (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    discipline TEXT NOT NULL,
    topic TEXT NOT NULL,
    subtopic TEXT,
    title TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT 'trilha',
    focus TEXT,
    content TEXT,
    status TEXT NOT NULL DEFAULT 'gerando',
    check_result TEXT,
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE exams (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    config TEXT NOT NULL,
    question_ids TEXT NOT NULL,
    answers TEXT NOT NULL DEFAULT '{}',
    flags TEXT NOT NULL DEFAULT '[]',
    time_limit_s INTEGER,
    elapsed_s INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'em_andamento',
    result TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
  );

  CREATE TABLE essays (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT 'ENEM',
    text TEXT NOT NULL,
    from_image INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pendente',
    evaluation TEXT,
    total_estimate INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    evaluated_at TEXT
  );

  CREATE TABLE flashcards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    discipline TEXT NOT NULL,
    topic TEXT,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    ease REAL NOT NULL DEFAULT 2.5,
    interval_days REAL NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    due_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_review_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_fc_due ON flashcards(user_id, due_at);

  CREATE TABLE plan_items (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    start_time TEXT,
    discipline TEXT,
    topic TEXT,
    kind TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente',
    reason TEXT,
    created_by TEXT NOT NULL DEFAULT 'sistema',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_plan_user ON plan_items(user_id, date);

  CREATE TABLE focus_sessions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    discipline TEXT,
    topic TEXT,
    goal TEXT,
    planned_min INTEGER NOT NULL,
    actual_sec INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ativa',
    rating INTEGER,
    note TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT
  );

  CREATE TABLE study_time (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    seconds INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date)
  );

  CREATE TABLE memory_notes (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    discipline TEXT,
    topic TEXT,
    text TEXT NOT NULL,
    source TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE weekly_goals (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start TEXT NOT NULL,
    goals TEXT NOT NULL,
    PRIMARY KEY (user_id, week_start)
  );

  -- Base de conhecimento (RAG)
  CREATE TABLE documents (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    institution TEXT,
    kind TEXT NOT NULL DEFAULT 'pagina_oficial',
    url TEXT,
    source_type TEXT NOT NULL DEFAULT 'oficial',
    reference_period TEXT,
    content_hash TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    added_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE TABLE chunks (
    id INTEGER PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    text TEXT NOT NULL
  );
  CREATE VIRTUAL TABLE chunks_fts USING fts5(text, content='chunks', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
  CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
    INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
  END;
  CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
  END;

  -- Central de Medicina Federal: fatos sempre com fonte e data
  CREATE TABLE uni_facts (
    id INTEGER PRIMARY KEY,
    fact_key TEXT UNIQUE,
    institution TEXT NOT NULL,
    campus TEXT,
    topic TEXT NOT NULL,
    title TEXT NOT NULL,
    value TEXT,
    detail TEXT,
    reference_period TEXT,
    source_url TEXT,
    source_name TEXT,
    source_type TEXT NOT NULL DEFAULT 'oficial',
    verified INTEGER NOT NULL DEFAULT 0,
    collected_at TEXT NOT NULL,
    added_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE TABLE calendar_events (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    institution TEXT,
    date_start TEXT NOT NULL,
    date_end TEXT,
    source_url TEXT,
    source_type TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    event_key TEXT UNIQUE
  );

  CREATE TABLE ai_usage (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    feature TEXT NOT NULL,
    model TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    ok INTEGER NOT NULL DEFAULT 1,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
];

let db;

export function openDb(file = config.dbPath) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new DatabaseSync(file);
  d.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') d.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  d.exec('PRAGMA busy_timeout = 5000;');
  migrate(d);
  return d;
}

function migrate(d) {
  d.exec('CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL)');
  const row = d.prepare('SELECT v FROM schema_version').get();
  let v = row ? row.v : 0;
  if (!row) d.prepare('INSERT INTO schema_version (v) VALUES (0)').run();
  while (v < MIGRATIONS.length) {
    d.exec('BEGIN');
    try {
      d.exec(MIGRATIONS[v]);
      v += 1;
      d.prepare('UPDATE schema_version SET v = ?').run(v);
      d.exec('COMMIT');
      log.info('migração aplicada', { version: v });
    } catch (e) {
      d.exec('ROLLBACK');
      throw e;
    }
  }
}

export function getDb() {
  if (!db) db = openDb();
  return db;
}

/** Usado nos testes para trocar o banco por um em memória/arquivo temporário. */
export function setDb(d) {
  db = d;
}

/** Executa fn dentro de uma transação. */
export function tx(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const r = fn(d);
    d.exec('COMMIT');
    return r;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

export const J = {
  parse(s, fallback = null) {
    if (s === null || s === undefined) return fallback;
    try { return JSON.parse(s); } catch { return fallback; }
  },
  str: (o) => JSON.stringify(o ?? null),
};

export function today(d = new Date()) {
  // Data local (America/Araguaina/Fortaleza ~ UTC-3). Usamos TZ do processo; documentado no README.
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
