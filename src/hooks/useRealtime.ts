import { useEffect, useState } from 'react'
import type { Post } from '../api/posts'
import {
  subscribeToConnection,
  subscribeToPosts,
  type RealtimeStatus,
} from '../lib/realtime'

export function useRealtimeStatus() {
  const [status, setStatus] = useState<RealtimeStatus>('connecting')

  useEffect(() => subscribeToConnection(setStatus), [])

  return status
}

export function useRealtimePosts(onChange: () => void) {
  useEffect(() => {
    return subscribeToPosts({
      onCreated: () => onChange(),
      onUpdated: () => onChange(),
      onDeleted: () => onChange(),
    })
  }, [onChange])
}

export type { Post }
