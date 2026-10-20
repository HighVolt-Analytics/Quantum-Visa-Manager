import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, Moon, Sun, X } from 'lucide-react'
import { NAV } from '../lib/nav'
import { useTheme } from '../hooks/useTheme'
import Logo from './Logo'

export default function Header({ pageKey }) {
  const { theme, toggle } = useTheme()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setOpen(false)
    document.body.classList.remove('nav-open')
  }, [location.pathname])

  useEffect(() => {
    document.body.classList.toggle('nav-open', open)
  }, [open])

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className={`site-header${scrolled ? ' is-scrolled' : ''}`} id="top">
        <div className="wrap nav">
          <Link className="brand" to="/" aria-label="Quantum Visa Manager home">
            <Logo />
            <span className="brand-name">Quantum Visa Manager</span>
          </Link>

          <nav className="nav-links" aria-label="Primary">
            {NAV.map((n) =>
              n.sub ? (
                <div className="nav-item" key={n.key}>
                  <NavLink
                    className="nav-link"
                    to={n.h}
                    aria-current={n.key === pageKey ? 'page' : undefined}
                  >
                    {n.t}
                    <svg viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M1 1l4 4 4-4" />
                    </svg>
                  </NavLink>
                  <div className="menu" role="menu">
                    {n.sub.map((s) => (
                      <Link role="menuitem" to={s[1]} key={s[1]}>
                        <b>
                          {s[0]}
                          {s[3] ? <span className="badge badge--soon"> Coming soon</span> : null}
                        </b>
                        <span>{s[2]}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="nav-item" key={n.key}>
                  <NavLink
                    className="nav-link"
                    to={n.h}
                    aria-current={n.key === pageKey ? 'page' : undefined}
                  >
                    {n.t}
                  </NavLink>
                </div>
              ),
            )}
          </nav>

          <div className="nav-actions">
            <Link className="btn btn--primary btn--sm nav-demo" to="/book-demo">
              Book a Demo
            </Link>
            <button
              className="icon-btn"
              type="button"
              onClick={toggle}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
            </button>
            <button
              className="icon-btn menu-toggle"
              type="button"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="mnav"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={18} strokeWidth={1.75} /> : <Menu size={18} strokeWidth={1.75} />}
            </button>
          </div>
        </div>
      </header>

      <div className={`mobile-nav${open ? ' is-open' : ''}`} id="mnav" aria-label="Mobile">
        {NAV.map((n) => (
          <div className="m-group" key={n.key}>
            <Link className="m-title" to={n.h}>
              {n.t}
            </Link>
            {n.sub ? (
              <div className="m-sub">
                {n.sub.map((s) => (
                  <Link to={s[1]} key={s[1]}>
                    {s[0]}
                    {s[3] ? ' · Coming soon' : ''}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        <div className="m-group" style={{ border: 0 }}>
          <Link className="btn btn--primary btn--lg" style={{ width: '100%' }} to="/book-demo">
            Book a Demo
          </Link>
        </div>
      </div>
    </>
  )
}
