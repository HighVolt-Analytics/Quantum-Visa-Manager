import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { bootWidgets } from '../lib/qvm.js'

/**
 * Renders migrated marketing HTML and boots interactive widgets.
 * Internal links are intercepted for client-side React Router navigation.
 */
export default function HtmlPage({ html, title, description }) {
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (title) document.title = title
    if (description) {
      let meta = document.querySelector('meta[name="description"]')
      if (!meta) {
        meta = document.createElement('meta')
        meta.name = 'description'
        document.head.appendChild(meta)
      }
      meta.content = description
    }
  }, [title, description])

  useEffect(() => {
    const root = ref.current
    if (!root) return undefined

    delete root.dataset.qvmBooted
    const start = () => bootWidgets(root)
    if (window.lucide) start()
    else {
      const t = setInterval(() => {
        if (window.lucide) {
          clearInterval(t)
          start()
        }
      }, 50)
      setTimeout(() => clearInterval(t), 5000)
    }

    const onClick = (e) => {
      const a = e.target.closest('a')
      if (!a) return
      const href = a.getAttribute('href')
      if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      if (a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      if (href.startsWith('#')) return
      if (href.startsWith('/')) {
        e.preventDefault()
        navigate(href)
      }
    }

    root.addEventListener('click', onClick)
    return () => {
      root.removeEventListener('click', onClick)
      delete root.dataset.qvmBooted
    }
  }, [html, navigate])

  return (
    <main id="main" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
  )
}
