import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import Header from './Header'
import Footer from './Footer'

const PAGE_KEYS = {
  '/': 'home',
  '/platform': 'platform',
  '/visa-operations': 'platform',
  '/ai-control-security': 'platform',
  '/solutions': 'solutions',
  '/corporate-sponsorship': 'solutions',
  '/practice-growth': 'solutions',
  '/how-it-works': 'how',
  '/pricing': 'pricing',
  '/resources': 'resources',
  '/support': 'support',
  '/book-demo': 'demo',
  '/privacy': 'legal',
  '/terms': 'legal',
}

export default function Layout() {
  const { pathname, hash } = useLocation()
  const pageKey = PAGE_KEYS[pathname] || ''

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  useEffect(() => {
    if (!hash) return
    const id = hash.replace('#', '')
    const el = document.getElementById(id)
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }, [pathname, hash])

  return (
    <>
      <Header pageKey={pageKey} />
      <Outlet />
      <Footer />
    </>
  )
}
