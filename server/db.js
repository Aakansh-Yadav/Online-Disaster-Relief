import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, 'data')
const preferredDbPath = path.join(dataDir, 'online-disaster-relief.db')
const legacyDbPath = path.join(dataDir, 'beacon.db')
const dbPath = fs.existsSync(preferredDbPath)
  ? preferredDbPath
  : fs.existsSync(legacyDbPath)
    ? legacyDbPath
    : preferredDbPath

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

export const db = new DatabaseSync(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('need', 'offer')),
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    area TEXT NOT NULL,
    contact TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    lat REAL,
    lng REAL,
    accepted_by_id TEXT,
    accepted_by_name TEXT,
    accepted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_posts_kind ON posts(kind);
  CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
  CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
`)

function ensureColumn(column, type) {
  const columns = db.prepare('PRAGMA table_info(posts)').all()
  if (!columns.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE posts ADD COLUMN ${column} ${type}`)
  }
}

ensureColumn('lat', 'REAL')
ensureColumn('lng', 'REAL')
ensureColumn('accepted_by_id', 'TEXT')
ensureColumn('accepted_by_name', 'TEXT')
ensureColumn('accepted_at', 'TEXT')
ensureColumn('accepted_by_lat', 'REAL')
ensureColumn('accepted_by_lng', 'REAL')
ensureColumn('accepted_by_area', 'TEXT')
ensureColumn('created_by_id', 'TEXT')
ensureColumn('created_by_name', 'TEXT')

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts(id)
  );
  CREATE INDEX IF NOT EXISTS idx_messages_post_created
    ON messages(post_id, created_at);
`)

/**
 * Older DBs had a CHECK that blocked status='accepted'. Rebuild once if needed.
 */
function migrateStatusConstraintIfNeeded() {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='posts'`)
    .get()
  if (!row?.sql) return
  if (!String(row.sql).includes("'fulfilled', 'cancelled'")) return
  if (String(row.sql).includes("'accepted'")) return

  db.exec(`
    BEGIN;
    CREATE TABLE posts_new (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('need', 'offer')),
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      area TEXT NOT NULL,
      contact TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      lat REAL,
      lng REAL,
      accepted_by_id TEXT,
      accepted_by_name TEXT,
      accepted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO posts_new (
      id, kind, category, title, detail, area, contact, status, lat, lng,
      accepted_by_id, accepted_by_name, accepted_at, created_at, updated_at
    )
    SELECT
      id, kind, category, title, detail, area, contact, status, lat, lng,
      NULL, NULL, NULL, created_at, updated_at
    FROM posts;
    DROP TABLE posts;
    ALTER TABLE posts_new RENAME TO posts;
    CREATE INDEX IF NOT EXISTS idx_posts_kind ON posts(kind);
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
    COMMIT;
  `)
}

try {
  migrateStatusConstraintIfNeeded()
} catch (error) {
  console.warn('[db] status constraint migration skipped:', error)
}

export function mapPost(row) {
  if (!row) return null
  const acceptedBy =
    row.accepted_by_id && row.accepted_at
      ? {
          id: row.accepted_by_id,
          name: row.accepted_by_name || 'Helper',
          timestamp: row.accepted_at,
          lat: row.accepted_by_lat ?? null,
          lng: row.accepted_by_lng ?? null,
          area: row.accepted_by_area || null,
        }
      : null

  return {
    id: row.id,
    kind: row.kind,
    category: row.category,
    title: row.title,
    detail: row.detail,
    area: row.area,
    contact: row.contact ?? '',
    createdByName: row.created_by_name || '',
    status: row.status,
    acceptedBy,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMessage(row) {
  if (!row) return null
  return {
    id: row.id,
    postId: row.post_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    body: row.body,
    createdAt: row.created_at,
  }
}
