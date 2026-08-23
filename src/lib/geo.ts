export type Coords = {
  lat: number
  lng: number
}

const LAST_COORDS_KEY = 'odr:lastCoords'
const LEGACY_LAST_COORDS_KEY = 'beacon:lastCoords'

export function saveLastCoords(coords: Coords) {
  try {
    localStorage.setItem(
      LAST_COORDS_KEY,
      JSON.stringify({ ...coords, savedAt: Date.now() }),
    )
  } catch {
    // ignore storage failures
  }
}

export function getLastCoords(): Coords | null {
  try {
    const raw =
      localStorage.getItem(LAST_COORDS_KEY) ??
      localStorage.getItem(LEGACY_LAST_COORDS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { lat?: number; lng?: number }
    if (
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number' &&
      Number.isFinite(parsed.lat) &&
      Number.isFinite(parsed.lng)
    ) {
      return { lat: parsed.lat, lng: parsed.lng }
    }
  } catch {
    // ignore
  }
  return null
}

function geolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Location permission denied'
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return 'Location unavailable'
  }
  if (error.code === error.TIMEOUT) {
    return 'Location request timed out'
  }
  return 'Could not get your location'
}

export function getCurrentPosition(options?: PositionOptions): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported in this browser'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        saveLastCoords(coords)
        resolve(coords)
      },
      (error) => {
        reject(new Error(geolocationErrorMessage(error)))
      },
      {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 60000,
        ...options,
      },
    )
  })
}

export type ResolveLocationResult = {
  coords: Coords
  fromCache: boolean
}

/**
 * Tries a live GPS fix, then falls back to the last saved pin.
 */
export async function resolveLocation(options?: {
  timeoutMs?: number
  allowCache?: boolean
  highAccuracy?: boolean
}): Promise<ResolveLocationResult> {
  const allowCache = options?.allowCache ?? true
  const timeoutMs = options?.timeoutMs ?? 12000

  try {
    const coords = await getCurrentPosition({
      enableHighAccuracy: options?.highAccuracy ?? false,
      timeout: timeoutMs,
      maximumAge: allowCache ? 15 * 60 * 1000 : 0,
    })
    return { coords, fromCache: false }
  } catch (error) {
    if (allowCache) {
      const cached = getLastCoords()
      if (cached) {
        return { coords: cached, fromCache: true }
      }
    }

    throw error instanceof Error
      ? error
      : new Error('Could not get your location')
  }
}
