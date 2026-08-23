const EARTH_RADIUS_KM = 6371

function toRad(degrees) {
  return (degrees * Math.PI) / 180
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

export function parseCoordinate(value, kind) {
  if (value === undefined || value === null || value === '') {
    return { value: null }
  }

  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) {
    return { error: `${kind} must be a valid number` }
  }

  if (kind === 'lat' && (number < -90 || number > 90)) {
    return { error: 'lat must be between -90 and 90' }
  }

  if (kind === 'lng' && (number < -180 || number > 180)) {
    return { error: 'lng must be between -180 and 180' }
  }

  return { value: number }
}

export function buildMatches(posts) {
  const open = posts.filter((post) => post.status === 'open')
  const needs = open.filter((post) => post.kind === 'need')
  const offers = open.filter((post) => post.kind === 'offer')
  const matches = []

  for (const need of needs) {
    for (const offer of offers) {
      if (need.category !== offer.category) continue
      matches.push({
        category: need.category,
        need,
        offer,
      })
    }
  }

  return matches
}

function pickAddressLabel(address) {
  if (!address || typeof address !== 'object') return ''
  const parts = [
    address.road,
    address.neighbourhood,
    address.suburb,
    address.residential,
    address.quarter,
    address.village,
    address.hamlet,
    address.town,
    address.city_district,
    address.city,
  ]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)

  const unique = [...new Set(parts)]
  return unique.slice(0, 2).join(', ')
}

const geocodeCache = new Map()
let lastNominatimAt = 0

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function nominatimJson(url) {
  const wait = 1100 - (Date.now() - lastNominatimAt)
  if (wait > 0) await sleep(wait)
  lastNominatimAt = Date.now()

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DisasterReliefCoordinator/1.0',
    },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) return null
  return response.json()
}

/** Neighborhoods OpenStreetMap often misses, keyed by locality + city. */
const KNOWN_LOCALITIES = [
  {
    name: /mohit\s*nagar/i,
    city: /dehradun/i,
    lat: 30.3281,
    lng: 78.0082,
  },
]

function lookupKnownLocality(query, hint) {
  const text = `${query || ''} ${hint || ''}`
  for (const place of KNOWN_LOCALITIES) {
    if (place.name.test(query) && place.city.test(text)) {
      return { lat: place.lat, lng: place.lng }
    }
  }
  return null
}

function extractCity(text) {
  if (typeof text !== 'string') return ''
  const parts = text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 1]
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return words[words.length - 1]
  return ''
}

function queryVariants(query, hint) {
  const q = typeof query === 'string' ? query.trim() : ''
  const extra = typeof hint === 'string' ? hint.trim() : ''
  const variants = []
  const add = (value) => {
    const next = typeof value === 'string' ? value.trim() : ''
    if (next.length >= 2 && !variants.some((item) => item.toLowerCase() === next.toLowerCase())) {
      variants.push(next)
    }
  }

  add(q)
  const city = extractCity(q) || extractCity(extra)
  if (city && !q.toLowerCase().includes(city.toLowerCase().split(/\s+/)[0])) {
    add(`${q}, ${city}`)
  }
  if (city) add(`${q}, ${city}, India`)
  if (!/\bindia\b/i.test(q)) add(`${q}, India`)
  if (extra && extra.toLowerCase() !== q.toLowerCase()) {
    const extraTokens = extra.split(/[\s,]+/).filter(Boolean)
    if (extraTokens.length <= 2) add(`${q}, ${extra}`)
  }
  return variants
}

/**
 * Best-effort place name for a GPS pin. Failures are ignored so accept stays fast.
 */
export async function reverseGeocode(lat, lng) {
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null
  }

  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lng))
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('zoom', '18')
    url.searchParams.set('addressdetails', '1')

    const body = await nominatimJson(url)
    const label = pickAddressLabel(body?.address)
    if (label) return label.slice(0, 120)

    if (typeof body?.name === 'string' && body.name.trim()) {
      return body.name.trim().slice(0, 120)
    }
  } catch {
    // ignore timeout / network errors
  }

  return null
}

function parseGeocodeHits(body) {
  const hits = Array.isArray(body) ? body : []
  return hits
    .map((hit) => {
      const lat = Number(hit?.lat)
      const lng = Number(hit?.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
      return { lat, lng }
    })
    .filter(Boolean)
}

function pickNearest(hits, near) {
  if (!hits.length) return null
  if (!near) return hits[0]
  return [...hits].sort(
    (a, b) =>
      haversineKm(near.lat, near.lng, a.lat, a.lng) -
      haversineKm(near.lat, near.lng, b.lat, b.lng),
  )[0]
}

/**
 * Best-effort GPS pin for a typed place name. Failures are ignored so accept stays fast.
 */
export async function forwardGeocode(query, near = null) {
  const q = typeof query === 'string' ? query.trim() : ''
  if (q.length < 2) return null

  const nearKey =
    near && Number.isFinite(near.lat) && Number.isFinite(near.lng)
      ? `${near.lat.toFixed(3)},${near.lng.toFixed(3)}`
      : ''
  const cacheKey = `${q.toLowerCase()}|${nearKey}`
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey)

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('q', q)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('limit', near ? '5' : '3')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('countrycodes', 'in')

    if (near) {
      const pad = 0.35
      url.searchParams.set(
        'viewbox',
        `${near.lng - pad},${near.lat + pad},${near.lng + pad},${near.lat - pad}`,
      )
    }

    const body = await nominatimJson(url)
    const coords = pickNearest(parseGeocodeHits(body), near)
    if (coords) geocodeCache.set(cacheKey, coords)
    return coords
  } catch {
    // ignore timeout / network errors
  }

  return null
}

async function photonGeocode(query, near = null) {
  const q = typeof query === 'string' ? query.trim() : ''
  if (q.length < 2) return null

  try {
    const url = new URL('https://photon.komoot.io/api/')
    url.searchParams.set('q', q)
    url.searchParams.set('limit', '5')
    if (near) {
      url.searchParams.set('lat', String(near.lat))
      url.searchParams.set('lon', String(near.lng))
    }

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return null
    const body = await response.json()
    const hits = Array.isArray(body?.features)
      ? body.features
          .map((feature) => {
            const coords = feature?.geometry?.coordinates
            if (!Array.isArray(coords) || coords.length < 2) return null
            const lng = Number(coords[0])
            const lat = Number(coords[1])
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
            return { lat, lng }
          })
          .filter(Boolean)
      : []
    return pickNearest(hits, near)
  } catch {
    return null
  }
}

/**
 * Locate a typed place. Prefer "place, nearby area" so neighborhoods are not
 * resolved to a same-named area in another city, then pick the hit closest to
 * the need pin when one exists.
 */
export async function geocodePlace(query, hint, near = null) {
  const q = typeof query === 'string' ? query.trim() : ''
  if (q.length < 2) return null

  const known = lookupKnownLocality(q, hint)
  if (known) return known

  for (const variant of queryVariants(q, hint)) {
    const hit = await forwardGeocode(variant, near)
    if (hit) return hit
  }

  for (const variant of queryVariants(q, hint)) {
    const hit = await photonGeocode(variant, near)
    if (hit) return hit
  }

  const city = extractCity(q) || extractCity(hint)
  if (city && city.toLowerCase() !== q.toLowerCase()) {
    return forwardGeocode(`${city}, India`, near)
  }

  return null
}
