import { io, type Socket } from 'socket.io-client'
import type { Post } from '../api/posts'
import type { ChatMessage } from '../api/chat'

export type RealtimeStatus = 'connecting' | 'live' | 'offline'

type PostCreatedPayload = { post: Post }
type PostUpdatedPayload = { post: Post }
type PostDeletedPayload = { id: string }

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL?.trim() ||
  (import.meta.env.DEV ? '/' : window.location.origin)

let socket: Socket | null = null

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    })
  }
  return socket
}

export function subscribeToPosts(handlers: {
  onCreated?: (payload: PostCreatedPayload) => void
  onUpdated?: (payload: PostUpdatedPayload) => void
  onDeleted?: (payload: PostDeletedPayload) => void
}) {
  const client = getSocket()

  if (handlers.onCreated) client.on('post:created', handlers.onCreated)
  if (handlers.onUpdated) client.on('post:updated', handlers.onUpdated)
  if (handlers.onDeleted) client.on('post:deleted', handlers.onDeleted)

  return () => {
    if (handlers.onCreated) client.off('post:created', handlers.onCreated)
    if (handlers.onUpdated) client.off('post:updated', handlers.onUpdated)
    if (handlers.onDeleted) client.off('post:deleted', handlers.onDeleted)
  }
}

type ChatMessagePayload = { postId: string; message: ChatMessage }

export function subscribeToChat(
  postId: string,
  onMessage: (payload: ChatMessagePayload) => void,
) {
  const client = getSocket()
  const handler = (payload: ChatMessagePayload) => {
    if (payload?.postId === postId) onMessage(payload)
  }
  client.on('chat:message', handler)
  return () => {
    client.off('chat:message', handler)
  }
}

export function joinChatRoom(postId: string, deviceId: string, claimOwner: boolean) {
  getSocket().emit('chat:join', { postId, deviceId, claimOwner })
}

export function leaveChatRoom(postId: string) {
  getSocket().emit('chat:leave', { postId })
}

export function subscribeToConnection(
  onStatus: (status: RealtimeStatus) => void,
) {
  const client = getSocket()

  const setConnecting = () => onStatus('connecting')
  const setLive = () => onStatus('live')
  const setOffline = () => onStatus('offline')

  if (client.connected) onStatus('live')
  else onStatus('connecting')

  client.on('connect', setLive)
  client.on('disconnect', setOffline)
  client.on('reconnect_attempt', setConnecting)
  client.on('connect_error', setOffline)

  return () => {
    client.off('connect', setLive)
    client.off('disconnect', setOffline)
    client.off('reconnect_attempt', setConnecting)
    client.off('connect_error', setOffline)
  }
}
