import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listPosts,
  updatePost,
  type AcceptedBy,
  type MatchPair,
  type Post,
  type PostKind,
} from '../api/posts'
import volunteersRelief from '../assets/volunteers-relief.png'
import { AcceptChat } from '../components/AcceptChat'
import { POST_CATEGORIES } from '../constants'
import { useRealtimePosts, useRealtimeStatus } from '../hooks/useRealtime'
import {
  getDeviceId,
  getStoredDisplayName,
  hasSeenAcceptToast,
  isGeneratedDisplayName,
  isPostOwned,
  markAcceptToastSeen,
  setHelperDisplayName,
} from '../lib/identity'

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function formatTimeAgo(iso: string) {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return iso
  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function statusLabel(status: Post['status']) {
  if (status === 'accepted') return 'Accepted'
  if (status === 'fulfilled') return 'Fulfilled'
  if (status === 'cancelled') return 'Cancelled'
  return 'Open'
}

function statusIcon(status: Post['status']) {
  if (status === 'accepted') return '◆'
  if (status === 'fulfilled') return '✓'
  if (status === 'cancelled') return '✕'
  return '○'
}

function helperLocationLabel(acceptedBy: AcceptedBy): string | null {
  if (acceptedBy.area) return acceptedBy.area
  return null
}

export function BoardPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [matches, setMatches] = useState<MatchPair[]>([])
  const [kind, setKind] = useState<PostKind | ''>('')
  const [category, setCategory] = useState('')
  const [openNeedsOnly, setOpenNeedsOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [liveFlash, setLiveFlash] = useState(false)
  const [deviceId, setDeviceId] = useState('')
  const [helperName, setHelperName] = useState('')
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set())
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [helperArea, setHelperArea] = useState('')
  const realtimeStatus = useRealtimeStatus()

  useEffect(() => {
    void (async () => {
      setDeviceId(await getDeviceId())
      const stored = getStoredDisplayName()
      if (stored && !isGeneratedDisplayName(stored)) {
        setHelperName(stored)
      }
    })()
  }, [])

  const refreshOwnership = useCallback(async (list: Post[]) => {
    const next = new Set<string>()
    for (const post of list) {
      if (await isPostOwned(post.id)) next.add(post.id)
    }
    setOwnedIds(next)
    return next
  }, [])

  const maybeShowAcceptToasts = useCallback(
    async (list: Post[], owned: Set<string>) => {
      for (const post of list) {
        if (!owned.has(post.id)) continue
        if (post.status !== 'accepted' || !post.acceptedBy) continue
        if (await hasSeenAcceptToast(post.id)) continue
        setToast(`${post.acceptedBy.name} accepted your request`)
        await markAcceptToastSeen(post.id)
        window.setTimeout(() => setToast(''), 7000)
        break
      }
    },
    [],
  )

  const loadPosts = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true)
      setError('')
      try {
        const result = await listPosts({
          kind: openNeedsOnly ? 'need' : kind || undefined,
          category: category || undefined,
          status: 'active',
          includeMatches: true,
        })
        const owned = await refreshOwnership(result.posts)
        const myId = deviceId || (await getDeviceId())
        if (!deviceId) setDeviceId(myId)
        const visible = openNeedsOnly
          ? result.posts.filter((post) => {
              if (post.kind !== 'need') return false
              if (post.status === 'open') return true
              if (post.status === 'accepted') {
                return owned.has(post.id) || post.acceptedBy?.id === myId
              }
              return false
            })
          : result.posts
        setPosts(visible)
        setMatches(result.matches ?? [])
        await maybeShowAcceptToasts(visible, owned)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load posts')
      } finally {
        if (!options?.silent) setLoading(false)
      }
    },
    [
      kind,
      category,
      openNeedsOnly,
      deviceId,
      refreshOwnership,
      maybeShowAcceptToasts,
    ],
  )

  useEffect(() => {
    void loadPosts()
  }, [loadPosts])

  const refreshFromRealtime = useCallback(() => {
    setLiveFlash(true)
    window.setTimeout(() => setLiveFlash(false), 1200)
    void loadPosts({ silent: true })
  }, [loadPosts])

  useRealtimePosts(refreshFromRealtime)

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadPosts({ silent: true })
    }, 4000)
    return () => window.clearInterval(timer)
  }, [loadPosts])

  function resetAcceptForm() {
    setAcceptingId(null)
    setHelperArea('')
  }

  function startAccept(id: string) {
    setError('')
    setAcceptingId(id)
    setHelperArea('')
  }

  async function markFulfilled(id: string) {
    setUpdatingId(id)
    setError('')
    try {
      await updatePost(id, { status: 'fulfilled' })
      await loadPosts({ silent: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update post')
    } finally {
      setUpdatingId(null)
    }
  }

  async function acceptHelp(id: string) {
    const name = helperName.trim()
    if (name.length < 2) {
      setError('Enter your name so the requester knows who is coming.')
      return
    }

    const area = helperArea.trim()
    if (area.length < 2) {
      setError('Enter your area or landmark so the requester knows where you are coming from.')
      return
    }

    setUpdatingId(id)
    setError('')
    try {
      const helperId = await getDeviceId()
      await setHelperDisplayName(name)
      const { post: updated } = await updatePost(id, {
        status: 'accepted',
        acceptedBy: {
          id: helperId,
          name,
          timestamp: new Date().toISOString(),
          area,
        },
      })
      resetAcceptForm()
      if (updated) {
        setPosts((prev) => {
          const next = prev.map((post) =>
            post.id === updated.id ? { ...post, ...updated } : post,
          )
          if (!next.some((post) => post.id === updated.id)) {
            next.unshift(updated)
          }
          return next
        })
        if (updated.acceptedBy?.id) {
          setDeviceId((current) => current || updated.acceptedBy!.id)
        }
      }
      await loadPosts({ silent: true })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not accept this request',
      )
      await loadPosts({ silent: true })
    } finally {
      setUpdatingId(null)
    }
  }

  async function cancelAccept(id: string) {
    setUpdatingId(id)
    setError('')
    try {
      await updatePost(id, { status: 'open', acceptedBy: null })
      await loadPosts({ silent: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel accept')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <section className="page-photo page-photo-board">
      <img
        className="page-photo-img"
        src={volunteersRelief}
        alt=""
        aria-hidden="true"
      />
      <div className="page page-photo-panel">
      {toast ? (
        <div className="accept-toast" role="status">
          {toast}
        </div>
      ) : null}

      <header className="page-header">
        <div className="page-header-row">
          <h1>Resource board</h1>
          <span
            className={`live-pill live-${realtimeStatus}${liveFlash ? ' live-flash' : ''}`}
            title="WebSocket connection status"
          >
            {realtimeStatus === 'live'
              ? 'Live'
              : realtimeStatus === 'connecting'
                ? 'Connecting…'
                : 'Disconnected'}
          </span>
        </div>
        <p>
          Browse open needs and offers. Helpers can accept a need; requesters
          see confirmation as soon as the update reaches the server.
        </p>
        <p className="board-source">
          Showing latest data from the server
        </p>
        <div className="page-actions">
          <Link to="/post/need" className="btn btn-primary">
            Post a need
          </Link>
          <Link to="/post/offer" className="btn btn-secondary">
            Post an offer
          </Link>
        </div>
      </header>

      <div className="board-filters">
        <label>
          Type
          <select
            value={kind}
            disabled={openNeedsOnly}
            onChange={(event) => setKind(event.target.value as PostKind | '')}
          >
            <option value="">All</option>
            <option value="need">Needs</option>
            <option value="offer">Offers</option>
          </select>
        </label>
        <label>
          Category
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All</option>
            {POST_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-check">
          <input
            type="checkbox"
            checked={openNeedsOnly}
            onChange={(event) => setOpenNeedsOnly(event.target.checked)}
          />
          Show only open needs
          <span className="filter-check-hint">
            (accepted stays visible for requester + helper)
          </span>
        </label>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void loadPosts()}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && matches.length > 0 && !openNeedsOnly ? (
        <section className="matches-section" aria-label="Suggested matches">
          <h2>Suggested matches</h2>
          <ul className="match-list">
            {matches.slice(0, 8).map((match) => (
              <li key={`${match.need.id}-${match.offer.id}`} className="match-item">
                <div className="match-pair">
                  <div>
                    <span className="badge badge-need">Need</span>
                    <strong>{match.need.title}</strong>
                    <p>
                      {match.need.createdByName
                        ? `${match.need.createdByName} · `
                        : ''}
                      {match.need.area}
                    </p>
                  </div>
                  <span className="match-arrow" aria-hidden="true">
                    ↔
                  </span>
                  <div>
                    <span className="badge badge-offer">Offer</span>
                    <strong>{match.offer.title}</strong>
                    <p>
                      {match.offer.createdByName
                        ? `${match.offer.createdByName} · `
                        : ''}
                      {match.offer.area}
                    </p>
                  </div>
                </div>
                <p className="match-meta">{match.category}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loading ? (
        <div className="board-loading" role="status" aria-live="polite">
          <div className="board-loading-spinner" aria-hidden="true" />
          <p className="board-status">Loading the board…</p>
        </div>
      ) : null}

      {!loading && posts.length === 0 ? (
        <div className="board-empty" role="status">
          <p className="board-empty-title">No needs or offers yet</p>
          <p className="board-status">
            Be the first to post a need or offer — neighbors will see it here.
          </p>
          <div className="page-actions">
            <Link to="/post/need" className="btn btn-primary">
              Post a need
            </Link>
            <Link to="/post/offer" className="btn btn-secondary">
              Offer help
            </Link>
          </div>
        </div>
      ) : null}

      <ul className="post-list">
        {posts.map((post) => {
          const isOwner = ownedIds.has(post.id)
          const isAccepter =
            post.status === 'accepted' && post.acceptedBy?.id === deviceId
          const canChat =
            (post.status === 'accepted' || post.status === 'fulfilled') &&
            Boolean(deviceId) &&
            (isOwner || post.acceptedBy?.id === deviceId)

          return (
            <li key={post.id} className={`post-item post-${post.kind}`}>
              <div className="post-meta">
                <span className={`badge badge-${post.kind}`}>
                  {post.kind === 'need' ? 'Need' : 'Offer'}
                </span>
                <span
                  className={`badge badge-status badge-status-${post.status}`}
                  title={statusLabel(post.status)}
                >
                  <span className="badge-status-icon" aria-hidden="true">
                    {statusIcon(post.status)}
                  </span>{' '}
                  {statusLabel(post.status)}
                </span>
                <span className="post-category">{post.category}</span>
              </div>
              <h2>{post.title}</h2>
              <p>{post.detail}</p>
              {post.createdByName ? (
                <p className="post-author">
                  {post.kind === 'need' ? 'Requested by' : 'Offered by'}{' '}
                  <strong>{post.createdByName}</strong>
                </p>
              ) : null}
              <p className="post-area">{post.area}</p>
              {post.contact ? (
                <p className="post-contact">Contact: {post.contact}</p>
              ) : null}
              {(post.status === 'accepted' || post.status === 'fulfilled') &&
              post.acceptedBy ? (
                <>
                  {post.status === 'accepted' ? (
                    <p className="accept-line">
                      {isAccepter
                        ? `You accepted this · ${formatTimeAgo(post.acceptedBy.timestamp)}`
                        : `Accepted by ${post.acceptedBy.name} · ${formatTimeAgo(post.acceptedBy.timestamp)}`}
                      {isOwner ? ' · help is on the way' : ''}
                    </p>
                  ) : null}
                  {post.status === 'accepted'
                    ? (() => {
                        const helperPlace = helperLocationLabel(post.acceptedBy)
                        return (
                          <div className="accept-locations">
                            <div className="match-pair">
                              <div>
                                <span className="badge badge-need">Need</span>
                                <p>
                                  {post.createdByName
                                    ? `${post.createdByName} · `
                                    : ''}
                                  {post.area || 'Location unknown'}
                                </p>
                              </div>
                              <span className="match-arrow" aria-hidden="true">
                                ↔
                              </span>
                              <div>
                                <span className="badge badge-offer">Helper</span>
                                <p>
                                  {post.acceptedBy.name
                                    ? `${post.acceptedBy.name} · `
                                    : ''}
                                  {helperPlace || 'Location unknown'}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })()
                    : null}
                  {canChat ? (
                    <AcceptChat
                      postId={post.id}
                      deviceId={deviceId}
                      senderName={
                        post.acceptedBy?.id === deviceId
                          ? post.acceptedBy.name || helperName
                          : post.createdByName || 'Requester'
                      }
                      claimOwner={isOwner}
                      peerLabel={
                        isOwner
                          ? post.acceptedBy.name
                          : post.createdByName || 'Requester'
                      }
                    />
                  ) : null}
                </>
              ) : null}
              {post.kind === 'need' &&
              post.status === 'open' &&
              !isOwner &&
              acceptingId === post.id ? (
                <div className="accept-form">
                  <label>
                    Your name
                    <input
                      type="text"
                      value={helperName}
                      onChange={(event) => setHelperName(event.target.value)}
                      placeholder="So the requester knows who is coming"
                      maxLength={80}
                      autoComplete="name"
                      autoFocus
                    />
                  </label>
                  <label>
                    Your area or landmark
                    <input
                      type="text"
                      value={helperArea}
                      onChange={(event) => setHelperArea(event.target.value)}
                      placeholder="Neighborhood, shelter name, or landmark"
                      maxLength={120}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void acceptHelp(post.id)
                        }
                      }}
                    />
                  </label>
                  <div className="page-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      disabled={updatingId === post.id}
                      onClick={() => void acceptHelp(post.id)}
                    >
                      {updatingId === post.id ? 'Accepting…' : 'Confirm I can help'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      disabled={updatingId === post.id}
                      onClick={resetAcceptForm}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="post-footer">
                <time dateTime={post.createdAt}>{formatWhen(post.createdAt)}</time>
                <div className="post-actions">
                  {post.kind === 'need' &&
                  post.status === 'open' &&
                  !isOwner &&
                  acceptingId !== post.id ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      disabled={updatingId === post.id}
                      onClick={() => startAccept(post.id)}
                    >
                      I can help
                    </button>
                  ) : null}
                  {post.kind === 'need' && isAccepter ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      disabled={updatingId === post.id}
                      onClick={() => void cancelAccept(post.id)}
                    >
                      {updatingId === post.id ? 'Updating…' : 'Cancel'}
                    </button>
                  ) : null}
                  {(post.status === 'open' || post.status === 'accepted') && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      disabled={updatingId === post.id}
                      onClick={() => void markFulfilled(post.id)}
                    >
                      {updatingId === post.id ? 'Updating…' : 'Mark fulfilled'}
                    </button>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      </div>
    </section>
  )
}
