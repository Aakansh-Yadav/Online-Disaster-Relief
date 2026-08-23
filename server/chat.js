import { db } from './db.js'

function trim(value, max) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

export function parseDeviceId(value) {
  return trim(String(value ?? ''), 64)
}

export function authorizeChat(postId, deviceId, claimOwner = false) {
  if (!postId) return { status: 400, error: 'post id is required' }
  if (!deviceId) return { status: 400, error: 'deviceId is required' }

  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId)
  if (!row) return { status: 404, error: 'Post not found' }

  if (row.status !== 'accepted' && row.status !== 'fulfilled') {
    return {
      status: 409,
      error: 'Chat is available after a need is accepted',
    }
  }

  if (row.accepted_by_id === deviceId) return { row }
  if (row.created_by_id === deviceId) return { row }

  if (!row.created_by_id && claimOwner && row.accepted_by_id !== deviceId) {
    db.prepare(
      `UPDATE posts
       SET created_by_id = @created_by_id
       WHERE id = @id AND created_by_id IS NULL`,
    ).run({ id: row.id, created_by_id: deviceId })
    row.created_by_id = deviceId
    return { row }
  }

  return {
    status: 403,
    error: 'Only the requester and the helper can use this chat',
  }
}
