export type PostKind = 'need' | 'offer'
export type PostStatus = 'open' | 'accepted' | 'fulfilled' | 'cancelled'

export type AcceptedBy = {
  id: string
  name: string
  timestamp: string
  /** Monotonic per-device sequence to break timestamp ties / clock drift. */
  seq?: number
  /** Place name for the helper, when available. */
  area?: string | null
}

export type Post = {
  id: string
  kind: PostKind
  category: string
  title: string
  detail: string
  area: string
  contact: string
  createdByName: string
  status: PostStatus
  acceptedBy: AcceptedBy | null
  lat: number | null
  lng: number | null
  createdAt: string
  updatedAt: string
}

export type MatchPair = {
  category: string
  need: Post
  offer: Post
}

export type CreatePostInput = {
  id?: string
  kind: PostKind
  category: string
  title: string
  detail: string
  area: string
  contact?: string
  lat?: number | null
  lng?: number | null
  createdById?: string
  createdByName?: string
}

export type UpdatePostInput = {
  status: PostStatus
  acceptedBy?: AcceptedBy | null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    let post: Post | undefined
    try {
      const body = (await response.json()) as { error?: string; post?: Post }
      if (body.error) message = body.error
      post = body.post
    } catch {
      // ignore parse errors
    }
    const err = new Error(message) as Error & { post?: Post; status?: number }
    err.post = post
    err.status = response.status
    throw err
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export function listPosts(params?: {
  kind?: PostKind | ''
  category?: string
  status?: PostStatus | 'all' | 'active'
  includeMatches?: boolean
}) {
  const query = new URLSearchParams()
  if (params?.kind) query.set('kind', params.kind)
  if (params?.category) query.set('category', params.category)
  if (params?.status) query.set('status', params.status)
  if (params?.includeMatches) query.set('includeMatches', '1')
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return request<{ posts: Post[]; matches?: MatchPair[] }>(`/api/posts${suffix}`)
}

export function createPost(input: CreatePostInput) {
  return request<{ post: Post }>('/api/posts', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updatePost(id: string, input: UpdatePostInput) {
  return request<{ post: Post }>(`/api/posts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

/** @deprecated use updatePost */
export function updatePostStatus(id: string, status: PostStatus) {
  return updatePost(id, { status })
}

export function deletePost(id: string) {
  return request<void>(`/api/posts/${id}`, { method: 'DELETE' })
}
