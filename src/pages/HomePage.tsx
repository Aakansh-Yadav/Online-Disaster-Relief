import { Link } from 'react-router-dom'
import communityAid from '../assets/community-aid-hd.png'

export function HomePage() {
  return (
    <section className="hero">
      <div className="hero-content">
        <p className="brand-mark">Online Disaster Relief</p>
        <h1>Find help. Offer space. Stay connected nearby.</h1>
        <p className="hero-lead">
          During floods, fires, and other emergencies, post what you need or
          what you can give — and match with people near you.
        </p>
        <div className="hero-actions">
          <Link to="/board" className="btn btn-primary">
            Open the board
          </Link>
          <Link to="/post/need" className="btn btn-secondary">
            I need help
          </Link>
        </div>
      </div>
      <div className="hero-photo-wrap">
        <img
          className="hero-photo"
          src={communityAid}
          alt="Volunteers packing community supplies together outdoors"
        />
      </div>
    </section>
  )
}
