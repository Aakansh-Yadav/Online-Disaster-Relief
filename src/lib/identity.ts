import { Capacitor } from '@capacitor/core'
import { generateId } from './generateId'

const OWNED_KEY = 'ownedPostIds'
const HELPER_NAME_KEY = 'helperDisplayName'
const SEEN_ACCEPTS_KEY = 'seenAcceptToasts'
const DEVICE_KEY = 'deviceId'
const GENERATED_NAME = /^Helper [0-9a-f]{4}$/i

export function isGeneratedDisplayName(name: string) {
  return GENERATED_NAME.test(name.trim())
}

export function getStoredDisplayName() {
  return (readString(HELPER_NAME_KEY) ?? '').trim()
}

/**
 * Web tabs share one origin. Use sessionStorage on web so Side A / Side B
 * in two tabs (or tab + incognito) get distinct device ids and ownership.
 * Native Capacitor keeps persistent storage.
 */
function isSessionScoped() {
  try {
    return !Capacitor.isNativePlatform()
  } catch {
    return true
  }
}

function storage() {
  return isSessionScoped() ? sessionStorage : localStorage
}

const STORAGE_PREFIX = 'odr:'
const LEGACY_STORAGE_PREFIX = 'beacon:'

function readString(key: string) {
  try {
    const store = storage()
    return (
      store.getItem(`${STORAGE_PREFIX}${key}`) ??
      store.getItem(`${LEGACY_STORAGE_PREFIX}${key}`)
    )
  } catch {
    return null
  }
}

function writeString(key: string, value: string) {
  try {
    storage().setItem(`${STORAGE_PREFIX}${key}`, value)
  } catch {
    // ignore storage failures
  }
}

export async function getDeviceId() {
  const existing = readString(DEVICE_KEY)
  if (existing) return existing
  const id = generateId()
  writeString(DEVICE_KEY, id)
  return id
}

export async function getHelperDisplayName() {
  const existing = getStoredDisplayName()
  if (existing) return existing
  const id = await getDeviceId()
  return `Helper ${id.slice(0, 4)}`
}

export async function setHelperDisplayName(name: string) {
  const trimmed = name.trim().slice(0, 80)
  if (!trimmed || isGeneratedDisplayName(trimmed)) return
  writeString(HELPER_NAME_KEY, trimmed)
}

function readIdSet(key: string) {
  const raw = readString(key)
  if (!raw) return new Set<string>()
  try {
    const parsed = JSON.parse(raw) as string[]
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set<string>()
  }
}

function writeIdSet(key: string, ids: Set<string>) {
  writeString(key, JSON.stringify([...ids]))
}

export async function markPostOwned(postId: string) {
  const ids = readIdSet(OWNED_KEY)
  ids.add(postId)
  writeIdSet(OWNED_KEY, ids)
}

export async function isPostOwned(postId: string) {
  const ids = readIdSet(OWNED_KEY)
  return ids.has(postId)
}

export async function listOwnedPostIds() {
  return readIdSet(OWNED_KEY)
}

export async function hasSeenAcceptToast(postId: string) {
  const ids = readIdSet(SEEN_ACCEPTS_KEY)
  return ids.has(postId)
}

export async function markAcceptToastSeen(postId: string) {
  const ids = readIdSet(SEEN_ACCEPTS_KEY)
  ids.add(postId)
  writeIdSet(SEEN_ACCEPTS_KEY, ids)
}
