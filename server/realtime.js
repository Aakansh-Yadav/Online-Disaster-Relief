let io = null

export function setIO(instance) {
  io = instance
}

export function getIO() {
  return io
}

export function emitPostCreated(post) {
  io?.emit('post:created', { post })
}

export function emitPostUpdated(post) {
  io?.emit('post:updated', { post })
}

export function emitPostDeleted(id) {
  io?.emit('post:deleted', { id })
}

export function emitChatMessage(postId, message) {
  io?.to(`chat:${postId}`).emit('chat:message', { postId, message })
}
