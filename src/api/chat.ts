export type ChatMessage = {
  id: string
  postId: string
  senderId: string
  senderName: string
  body: string
  createdAt: string
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
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // ignore parse errors
    }
    throw new Error(message)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function listMessages(postId: string, deviceId: string, claimOwner: boolean) {
  const query = new URLSearchParams({ deviceId })
  if (claimOwner) query.set('claimOwner', '1')
  return request<{ messages: ChatMessage[] }>(
    `/api/posts/${postId}/messages?${query.toString()}`,
  )
}

export function sendMessage(input: {
  postId: string
  deviceId: string
  senderName: string
  body: string
  claimOwner: boolean
}) {
  return request<{ message: ChatMessage }>(`/api/posts/${input.postId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      deviceId: input.deviceId,
      senderName: input.senderName,
      body: input.body,
      claimOwner: input.claimOwner,
    }),
  })
}
