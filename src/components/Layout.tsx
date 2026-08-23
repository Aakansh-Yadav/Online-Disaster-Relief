import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'nav-link active' : 'nav-link'

export function Layout() {
  useEffect(() => {
    document.title = 'Online Disaster Relief'
  }, [])

  return (
    <div className="app-shell">
      <header className="site-header">
        <NavLink to="/" className="brand">
          Online Disaster Relief
        </NavLink>
        <nav className="site-nav" aria-label="Main">
          <NavLink to="/board" className={navClass}>
            Board
          </NavLink>
          <NavLink to="/post/need" className={navClass}>
            Need help
          </NavLink>
          <NavLink to="/post/offer" className={navClass}>
            Offer help
          </NavLink>
          <NavLink to="/about" className={navClass}>
            About
          </NavLink>
        </nav>
      </header>

      <main className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <p>Online Disaster Relief — local matching when it matters most.</p>
      </footer>
    </div>
  )
}
