import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

const dataDir = path.join('server', 'data')
const preferredDbPath = path.join(dataDir, 'online-disaster-relief.db')
const legacyDbPath = path.join(dataDir, 'beacon.db')
const dbPath = fs.existsSync(preferredDbPath)
  ? preferredDbPath
  : fs.existsSync(legacyDbPath)
    ? legacyDbPath
    : preferredDbPath

const db = new DatabaseSync(dbPath)
const table = process.argv[2] || 'all'

if (table === 'posts' || table === 'all') {
  console.log('=== posts ===')
  console.log(JSON.stringify(db.prepare('SELECT * FROM posts').all(), null, 2))
}

if (table === 'messages' || table === 'all') {
  console.log('=== messages ===')
  console.log(JSON.stringify(db.prepare('SELECT * FROM messages').all(), null, 2))
}
