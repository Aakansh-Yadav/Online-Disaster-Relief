import { Link } from 'react-router-dom'

export function AboutPage() {
  return (
    <section className="page narrow">
      <header className="page-header">
        <h1>About Online Disaster Relief</h1>
        <p>
          Online Disaster Relief is an emergency resource coordinator: people
          post needs and offers, then match with others nearby when disasters
          disrupt normal services.
        </p>
      </header>

      <div className="about-body">
        <h2>What this build includes</h2>
        <ul>
          <li>React + Vite app with routing</li>
          <li>Express + SQLite API for needs and offers</li>
          <li>Geolocation pins when posting a need or offer</li>
          <li>Live board updates over WebSockets</li>
        </ul>

        <div className="page-actions">
          <Link to="/board" className="btn btn-primary">
            Go to the board
          </Link>
        </div>
      </div>
    </section>
  )
}
