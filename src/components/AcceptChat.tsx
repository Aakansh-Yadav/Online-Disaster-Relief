import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { listMessages, sendMessage, type ChatMessage } from '../api/chat'
import {
  getSocket,
  joinChatRoom,
  leaveChatRoom,
  subscribeToChat,
} from '../lib/realtime'

type AcceptChatProps = {
  postId: string
  deviceId: string
  senderName: string
  claimOwner: boolean
  peerLabel: string
}

export function AcceptChat({
  postId,
  deviceId,
  senderName,
  claimOwner,
  peerLabel,
}: AcceptChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void listMessages(postId, deviceId, claimOwner)
      .then((result) => {
        if (active) setMessages(result.messages)
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Could not load chat')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    joinChatRoom(postId, deviceId, claimOwner)
    const socket = getSocket()
    const rejoin = () => joinChatRoom(postId, deviceId, claimOwner)
    socket.on('connect', rejoin)
    const unsubscribe = subscribeToChat(postId, ({ message }) => {
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) return current
        return [...current, message]
      })
    })

    return () => {
      active = false
      unsubscribe()
      socket.off('connect', rejoin)
      leaveChatRoom(postId)
    }
  }, [postId, deviceId, claimOwner])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  async function handleSend(event: FormEvent) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || sending) return

    setSending(true)
    setError('')
    try {
      const { message } = await sendMessage({
        postId,
        deviceId,
        senderName,
        body,
        claimOwner,
      })
      setDraft('')
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) return current
        return [...current, message]
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="accept-chat" aria-label={`Chat with ${peerLabel}`}>
      <header className="accept-chat-header">
        <strong>Chat</strong>
        <span>Private with {peerLabel}</span>
      </header>

      <div className="accept-chat-thread" role="log">
        {loading ? <p className="accept-chat-status">Loading chat…</p> : null}
        {!loading && messages.length === 0 ? (
          <p className="accept-chat-status">
            Coordinate pickup, timing, or anything else you need.
          </p>
        ) : null}
        {messages.map((message) => {
          const mine = message.senderId === deviceId
          return (
            <div
              key={message.id}
              className={`accept-chat-bubble ${mine ? 'mine' : 'theirs'}`}
            >
              <span className="accept-chat-name">
                {mine ? 'You' : message.senderName}
              </span>
              <p>{message.body}</p>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <form className="accept-chat-compose" onSubmit={handleSend}>
        <input
          type="text"
          value={draft}
          maxLength={500}
          placeholder={`Message ${peerLabel}…`}
          onChange={(event) => setDraft(event.target.value)}
          disabled={sending}
        />
        <button
          type="submit"
          className="btn btn-primary btn-small"
          disabled={sending || !draft.trim()}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </section>
  )
}
