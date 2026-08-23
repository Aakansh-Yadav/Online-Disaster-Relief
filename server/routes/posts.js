import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { db, mapMessage, mapPost } from '../db.js'
import {
  buildMatches,
  geocodePlace,
  parseCoordinate,
  reverseGeocode,
} from '../geo.js'
import {
  emitChatMessage,
  emitPostCreated,
  emitPostDeleted,
  emitPostUpdated,
} from '../realtime.js'
import { authorizeChat, parseDeviceId } from '../chat.js'

const router = Router()

const CATEGORIES = new Set([
  'Shelter',
  'Medicine',
  'Food',
  'Water',
  'Transport',
  'Other',
])
const KINDS = new Set(['need', 'offer'])
const STATUSES = new Set(['open', 'accepted', 'fulfilled', 'cancelled'])

function trim(value, max) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function parseAcceptedBy(value) {
  if (value == null) return { acceptedBy: null }
  if (value === null) return { acceptedBy: null }
  if (typeof value !== 'object') {
    return { error: 'acceptedBy must be an object or null' }
  }
  const id = trim(String(value.id ?? ''), 64)
  const name = trim(String(value.name ?? value.label ?? ''), 80)
  const timestamp =
    typeof value.timestamp === 'string' && value.timestamp
      ? value.timestamp
      : new Date().toISOString()
  if (!id) return { error: 'acceptedBy.id is required' }
  if (name.length < 2) return { error: 'acceptedBy.name is required' }

  let lat = null
  let lng = null
  if (value.lat != null && value.lng != null) {
    const latN = Number(value.lat)
    const lngN = Number(value.lng)
    if (
      Number.isFinite(latN) &&
      Number.isFinite(lngN) &&
      Math.abs(latN) <= 90 &&
      Math.abs(lngN) <= 180
    ) {
      lat = latN
      lng = lngN
    }
  }

  const area = trim(String(value.area ?? ''), 120) || null

  return { acceptedBy: { id, name, timestamp, lat, lng, area } }
}

async function withHelperLocation(acceptedBy, areaHint, near = null) {
  if (!acceptedBy) return acceptedBy
  const next = { ...acceptedBy }
  const gpsLat = next.lat
  const gpsLng = next.lng

  if (next.area) {
    const place = await geocodePlace(next.area, areaHint, near)
    if (place) {
      next.lat = place.lat
      next.lng = place.lng
    }
  }

  if (
    (next.lat == null || next.lng == null) &&
    gpsLat != null &&
    gpsLng != null
  ) {
    next.lat = gpsLat
    next.lng = gpsLng
  }

  if (!next.area && next.lat != null && next.lng != null) {
    const area = await reverseGeocode(next.lat, next.lng)
    if (area) next.area = area
  }

  return next
}

async function fillMissingCoordinates(row) {
  if (!row) return row

  let lat = row.lat ?? null
  let lng = row.lng ?? null
  let helperLat = row.accepted_by_lat ?? null
  let helperLng = row.accepted_by_lng ?? null
  let changed = false

  if ((lat == null || lng == null) && row.area) {
    const coords = await geocodePlace(row.area)
    if (coords) {
      lat = coords.lat
      lng = coords.lng
      changed = true
    }
  }

  if (
    row.accepted_by_id &&
    (helperLat == null || helperLng == null) &&
    row.accepted_by_area
  ) {
    const near =
      lat != null && lng != null ? { lat, lng } : null
    const coords = await geocodePlace(row.accepted_by_area, row.area, near)
    if (coords) {
      helperLat = coords.lat
      helperLng = coords.lng
      changed = true
    }
  }

  if (!changed) return row

  db.prepare(
    `UPDATE posts
     SET lat = @lat,
         lng = @lng,
         accepted_by_lat = @accepted_by_lat,
         accepted_by_lng = @accepted_by_lng
     WHERE id = @id`,
  ).run({
    id: row.id,
    lat,
    lng,
    accepted_by_lat: helperLat,
    accepted_by_lng: helperLng,
  })

  return {
    ...row,
    lat,
    lng,
    accepted_by_lat: helperLat,
    accepted_by_lng: helperLng,
  }
}

function rowNeedsCoordinates(row) {
  if (!row) return false
  const needMissing = (row.lat == null || row.lng == null) && Boolean(row.area)
  const helperMissing =
    Boolean(row.accepted_by_id) &&
    (row.accepted_by_lat == null || row.accepted_by_lng == null) &&
    Boolean(row.accepted_by_area)
  return needMissing || helperMissing
}

function validateCreate(body) {
  const kind = trim(body.kind, 16)
  const category = trim(body.category, 40)
  const title = trim(body.title, 120)
  const detail = trim(body.detail, 500)
  const area = trim(body.area, 120)
  const contact = trim(body.contact ?? '', 120)
  const createdByName = trim(body.createdByName ?? body.name ?? '', 80)

  if (!KINDS.has(kind)) return { error: 'kind must be need or offer' }
  if (!CATEGORIES.has(category)) return { error: 'invalid category' }
  if (!title) return { error: 'title is required' }
  if (!detail) return { error: 'detail is required' }
  if (!area) return { error: 'area is required' }
  if (createdByName.length < 2) return { error: 'name is required' }

  const lat = parseCoordinate(body.lat, 'lat')
  if (lat.error) return { error: lat.error }
  const lng = parseCoordinate(body.lng, 'lng')
  if (lng.error) return { error: lng.error }

  if ((lat.value == null) !== (lng.value == null)) {
    return { error: 'lat and lng must be provided together' }
  }

  let id = null
  if (body.id != null && body.id !== '') {
    const candidate = trim(String(body.id), 64)
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        candidate,
      )
    ) {
      return { error: 'id must be a valid UUID' }
    }
    id = candidate
  }

  return {
    id,
    kind,
    category,
    title,
    detail,
    area,
    contact,
    lat: lat.value,
    lng: lng.value,
    createdById: trim(String(body.createdById ?? ''), 64) || null,
    createdByName,
  }
}

router.get('/', async (req, res) => {
  const kind = typeof req.query.kind === 'string' ? req.query.kind : ''
  const category =
    typeof req.query.category === 'string' ? req.query.category : ''
  const status =
    typeof req.query.status === 'string' ? req.query.status : 'active'
  const includeMatches = req.query.includeMatches === '1'

  const clauses = []
  const params = {}

  if (kind) {
    if (!KINDS.has(kind)) {
      return res.status(400).json({ error: 'kind must be need or offer' })
    }
    clauses.push('kind = @kind')
    params.kind = kind
  }

  if (category) {
    if (!CATEGORIES.has(category)) {
      return res.status(400).json({ error: 'invalid category' })
    }
    clauses.push('category = @category')
    params.category = category
  }

  if (status === 'active') {
    clauses.push(`status IN ('open', 'accepted')`)
  } else if (status !== 'all') {
    if (!STATUSES.has(status)) {
      return res.status(400).json({ error: 'invalid status' })
    }
    clauses.push('status = @status')
    params.status = status
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = db
    .prepare(
      `SELECT * FROM posts ${where} ORDER BY datetime(created_at) DESC`,
    )
    .all(params)

  const filled = []
  for (const row of rows) {
    if (row.status === 'accepted' && rowNeedsCoordinates(row)) {
      filled.push(await fillMissingCoordinates(row))
    } else {
      filled.push(row)
    }
  }

  const posts = filled.map((row) => mapPost(row))
  const payload = { posts }

  if (includeMatches) {
    const openRows = db
      .prepare(`SELECT * FROM posts WHERE status = 'open'`)
      .all()
    const openPosts = openRows.map((row) => mapPost(row))
    payload.matches = buildMatches(openPosts)
  }

  res.json(payload)
})

router.get('/:id', async (req, res) => {
  let row = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id)
  if (rowNeedsCoordinates(row)) {
    row = await fillMissingCoordinates(row)
  }
  const post = mapPost(row)
  if (!post) return res.status(404).json({ error: 'Post not found' })
  res.json({ post })
})

router.post('/', async (req, res) => {
  const parsed = validateCreate(req.body ?? {})
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  const now = new Date().toISOString()
  const id = parsed.id || randomUUID()

  if (parsed.id) {
    const existing = db.prepare('SELECT id FROM posts WHERE id = ?').get(id)
    if (existing) {
      const post = mapPost(db.prepare('SELECT * FROM posts WHERE id = ?').get(id))
      return res.status(200).json({ post })
    }
  }

  let lat = parsed.lat
  let lng = parsed.lng
  if (lat == null || lng == null) {
    const coords = await geocodePlace(parsed.area)
    if (coords) {
      lat = coords.lat
      lng = coords.lng
    }
  }

  db.prepare(
    `INSERT INTO posts (
      id, kind, category, title, detail, area, contact, status, lat, lng,
      created_by_id, created_by_name, accepted_by_id, accepted_by_name, accepted_at,
      created_at, updated_at
    ) VALUES (
      @id, @kind, @category, @title, @detail, @area, @contact, 'open', @lat, @lng,
      @created_by_id, @created_by_name, NULL, NULL, NULL, @created_at, @updated_at
    )`,
  ).run({
    id,
    kind: parsed.kind,
    category: parsed.category,
    title: parsed.title,
    detail: parsed.detail,
    area: parsed.area,
    contact: parsed.contact || null,
    lat,
    lng,
    created_by_id: parsed.createdById,
    created_by_name: parsed.createdByName,
    created_at: now,
    updated_at: now,
  })

  const post = mapPost(db.prepare('SELECT * FROM posts WHERE id = ?').get(id))
  emitPostCreated(post)
  res.status(201).json({ post })
})

router.patch('/:id', async (req, res) => {
  const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Post not found' })

  const status =
    typeof req.body?.status === 'string' ? req.body.status.trim() : ''
  if (!STATUSES.has(status)) {
    return res.status(400).json({
      error: 'status must be open, accepted, fulfilled, or cancelled',
    })
  }

  const bodyHasAcceptedBy = Object.prototype.hasOwnProperty.call(
    req.body ?? {},
    'acceptedBy',
  )
  let acceptedBy = null
  if (status === 'accepted') {
    const parsed = parseAcceptedBy(req.body?.acceptedBy)
    if (parsed.error) return res.status(400).json({ error: parsed.error })
    acceptedBy = parsed.acceptedBy
  } else if (status === 'open') {
    acceptedBy = null
  } else if (bodyHasAcceptedBy && req.body.acceptedBy) {
    const parsed = parseAcceptedBy(req.body.acceptedBy)
    if (parsed.error) return res.status(400).json({ error: parsed.error })
    acceptedBy = parsed.acceptedBy
  } else if (existing.accepted_by_id) {
    acceptedBy = {
      id: existing.accepted_by_id,
      name: existing.accepted_by_name || 'Helper',
      timestamp: existing.accepted_at,
      lat: existing.accepted_by_lat ?? null,
      lng: existing.accepted_by_lng ?? null,
      area: existing.accepted_by_area || null,
    }
  }

  let needLat = existing.lat ?? null
  let needLng = existing.lng ?? null
  if (
    acceptedBy &&
    (needLat == null || needLng == null) &&
    existing.area
  ) {
    const coords = await geocodePlace(existing.area, acceptedBy.area)
    if (coords) {
      needLat = coords.lat
      needLng = coords.lng
    }
  }

  if (acceptedBy) {
    const near =
      needLat != null && needLng != null ? { lat: needLat, lng: needLng } : null
    acceptedBy = await withHelperLocation(acceptedBy, existing.area, near)
  }

  // Earliest accept wins if already accepted by someone else.
  if (status === 'accepted' && existing.status === 'accepted') {
    const current = mapPost(existing)
    if (
      current.acceptedBy &&
      acceptedBy &&
      current.acceptedBy.id !== acceptedBy.id
    ) {
      const currentTs = Date.parse(current.acceptedBy.timestamp)
      const nextTs = Date.parse(acceptedBy.timestamp)
      if (!Number.isNaN(currentTs) && !Number.isNaN(nextTs) && nextTs >= currentTs) {
        return res.status(409).json({
          error: 'Someone else already accepted this',
          post: current,
        })
      }
    }
  }

  if (status === 'accepted' && existing.status === 'fulfilled') {
    return res.status(409).json({
      error: 'This need is already fulfilled',
      post: mapPost(existing),
    })
  }

  const now = new Date().toISOString()
  db.prepare(
    `UPDATE posts SET
      status = @status,
      lat = @lat,
      lng = @lng,
      accepted_by_id = @accepted_by_id,
      accepted_by_name = @accepted_by_name,
      accepted_at = @accepted_at,
      accepted_by_lat = @accepted_by_lat,
      accepted_by_lng = @accepted_by_lng,
      accepted_by_area = @accepted_by_area,
      updated_at = @updated_at
     WHERE id = @id`,
  ).run({
    id: req.params.id,
    status,
    lat: needLat,
    lng: needLng,
    accepted_by_id: acceptedBy?.id ?? null,
    accepted_by_name: acceptedBy?.name ?? null,
    accepted_at: acceptedBy?.timestamp ?? null,
    accepted_by_lat: acceptedBy?.lat ?? null,
    accepted_by_lng: acceptedBy?.lng ?? null,
    accepted_by_area: acceptedBy?.area ?? null,
    updated_at: now,
  })

  const post = mapPost(
    db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id),
  )
  emitPostUpdated(post)
  res.json({ post })
})

router.get('/:id/messages', (req, res) => {
  const deviceId = parseDeviceId(req.query.deviceId)
  const claimOwner = req.query.claimOwner === '1'
  const auth = authorizeChat(req.params.id, deviceId, claimOwner)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const rows = db
    .prepare(
      `SELECT * FROM messages WHERE post_id = ? ORDER BY datetime(created_at) ASC`,
    )
    .all(req.params.id)
  res.json({ messages: rows.map((row) => mapMessage(row)) })
})

router.post('/:id/messages', (req, res) => {
  const deviceId = parseDeviceId(req.body?.deviceId)
  const claimOwner = Boolean(req.body?.claimOwner)
  const auth = authorizeChat(req.params.id, deviceId, claimOwner)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const body = trim(String(req.body?.body ?? ''), 500)
  if (body.length < 1) {
    return res.status(400).json({ error: 'Message cannot be empty' })
  }

  const isHelper = auth.row.accepted_by_id === deviceId
  const senderName =
    trim(String(req.body?.senderName ?? ''), 80) ||
    (isHelper
      ? auth.row.accepted_by_name || 'Helper'
      : auth.row.created_by_name || 'Requester')

  const now = new Date().toISOString()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO messages (id, post_id, sender_id, sender_name, body, created_at)
     VALUES (@id, @post_id, @sender_id, @sender_name, @body, @created_at)`,
  ).run({
    id,
    post_id: req.params.id,
    sender_id: deviceId,
    sender_name: senderName,
    body,
    created_at: now,
  })

  const message = mapMessage(
    db.prepare('SELECT * FROM messages WHERE id = ?').get(id),
  )
  emitChatMessage(req.params.id, message)
  res.status(201).json({ message })
})

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Post not found' })

  db.prepare('DELETE FROM messages WHERE post_id = ?').run(req.params.id)
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id)
  emitPostDeleted(req.params.id)
  res.status(204).send()
})

export default router
