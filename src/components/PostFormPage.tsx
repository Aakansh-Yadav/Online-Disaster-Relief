import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FormEvent } from 'react'
import { createPost, type PostKind } from '../api/posts'
import { POST_CATEGORIES } from '../constants'
import { resolveLocation } from '../lib/geo'
import type { Coords } from '../lib/geo'
import {
  getDeviceId,
  getStoredDisplayName,
  isGeneratedDisplayName,
  markPostOwned,
  setHelperDisplayName,
} from '../lib/identity'
import volunteersRelief from '../assets/volunteers-relief.png'

type PostFormPageProps = {
  kind: PostKind
  title: string
  description: string
  titleLabel: string
  titlePlaceholder: string
  detailPlaceholder: string
  defaultCategory: string
  submitLabel: string
}

function isSaneCoord(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  )
}

export function PostFormPage({
  kind,
  title,
  description,
  titleLabel,
  titlePlaceholder,
  detailPlaceholder,
  defaultCategory,
  submitLabel,
}: PostFormPageProps) {
  const [submitting, setSubmitting] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [coords, setCoords] = useState<Coords | null>(null)
  const [coordsFromCache, setCoordsFromCache] = useState(false)
  const [personName, setPersonName] = useState('')

  useEffect(() => {
    const stored = getStoredDisplayName()
    if (stored && !isGeneratedDisplayName(stored)) {
      setPersonName(stored)
    }
  }, [])

  async function handleUseLocation() {
    setError('')
    setLocating(true)
    try {
      const result = await resolveLocation()
      if (!isSaneCoord(result.coords.lat, result.coords.lng)) {
        throw new Error(
          'Got an invalid location pin — try again or clear the pin.',
        )
      }
      setCoords(result.coords)
      setCoordsFromCache(result.fromCache)
    } catch (err) {
      setCoordsFromCache(false)
      setError(err instanceof Error ? err.message : 'Could not get location')
    } finally {
      setLocating(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const form = new FormData(event.currentTarget)
    const category = String(form.get('category') ?? '').trim()
    const postTitle = String(form.get('title') ?? '').trim()
    const detail = String(form.get('detail') ?? '').trim()
    const area = String(form.get('area') ?? '').trim()
    const contact = String(form.get('contact') ?? '').trim()
    const name = personName.trim()

    if (
      !category ||
      !POST_CATEGORIES.includes(category as (typeof POST_CATEGORIES)[number])
    ) {
      setError('Choose a valid category.')
      return
    }
    if (postTitle.length < 3) {
      setError('Title must be at least 3 characters.')
      return
    }
    if (detail.length < 3) {
      setError('Add a short detail so helpers know what is needed.')
      return
    }
    if (area.length < 2) {
      setError('Area or landmark is required.')
      return
    }
    if (name.length < 2) {
      setError('Enter your name so others know who this post is from.')
      return
    }
    if (coords && !isSaneCoord(coords.lat, coords.lng)) {
      setError('Location pin looks invalid — clear it or pin again.')
      return
    }

    setSubmitting(true)

    try {
      const { post } = await createPost({
        kind,
        category,
        title: postTitle,
        detail,
        area,
        contact,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        createdById: await getDeviceId(),
        createdByName: name,
      })
      await setHelperDisplayName(name)
      await markPostOwned(post.id)
      setCreatedId(post.id)
      setCoords(null)
      setCoordsFromCache(false)
      event.currentTarget.reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save post')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className={`page-photo page-photo-${kind}`}>
      <img
        className="page-photo-img"
        src={volunteersRelief}
        alt=""
        aria-hidden="true"
      />
      <div className="page narrow page-photo-panel">
      <header className="page-header">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>

      {createdId ? (
        <div className="form-success" role="status">
          <p>Saved to the board. Others can see this post now.</p>
          <div className="page-actions">
            <Link to="/board" className="btn btn-primary">
              View board
            </Link>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setCreatedId(null)
              }}
            >
              Post another
            </button>
          </div>
        </div>
      ) : (
        <form className="post-form" onSubmit={handleSubmit} noValidate>
          <label>
            Your name
            <input
              name="personName"
              type="text"
              required
              value={personName}
              onChange={(event) => setPersonName(event.target.value)}
              placeholder={
                kind === 'need'
                  ? 'Name of the person who needs help'
                  : 'Name of the person offering help'
              }
              maxLength={80}
              autoComplete="name"
            />
          </label>

          <label>
            Category
            <select name="category" required defaultValue={defaultCategory}>
              {POST_CATEGORIES.map((categoryOption) => (
                <option key={categoryOption} value={categoryOption}>
                  {categoryOption}
                </option>
              ))}
            </select>
          </label>

          <label>
            {titleLabel}
            <input
              name="title"
              type="text"
              required
              placeholder={titlePlaceholder}
              maxLength={120}
            />
          </label>

          <label>
            Details
            <textarea
              name="detail"
              rows={4}
              required
              placeholder={detailPlaceholder}
              maxLength={500}
            />
          </label>

          <label>
            Area or landmark
            <input
              name="area"
              type="text"
              required
              placeholder="Neighborhood, shelter name, or landmark"
              maxLength={120}
            />
          </label>

          <div className="location-box">
            <div className="location-box-copy">
              <strong>Location pin</strong>
              <p>
                {coords
                  ? `Pinned at ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}${
                      coordsFromCache ? ' (last known, saved earlier)' : ''
                    }`
                  : 'Optional. You can still save using only the area name above.'}
              </p>
            </div>
            <div className="page-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void handleUseLocation()}
                disabled={locating || submitting}
              >
                {locating ? 'Locating…' : 'Use my location'}
              </button>
              {coords ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setCoords(null)
                    setCoordsFromCache(false)
                  }}
                >
                  Clear pin
                </button>
              ) : null}
            </div>
          </div>

          <label>
            Contact (optional)
            <input
              name="contact"
              type="text"
              placeholder="Phone, handle, or how to reach you"
              maxLength={120}
            />
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : submitLabel}
          </button>
        </form>
      )}
      </div>
    </section>
  )
}
