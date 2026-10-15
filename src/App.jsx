import { Link, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import HtmlPage from './components/HtmlPage'
import { PAGES } from './pages/pages'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {PAGES.map((p) => (
          <Route
            key={p.path}
            path={p.path === '/' ? undefined : p.path.slice(1)}
            index={p.path === '/'}
            element={<HtmlPage html={p.html} title={p.title} description={p.description} />}
          />
        ))}
        <Route
          path="*"
          element={
            <main id="main" className="page-hero">
              <div className="wrap">
                <h1 className="h1">Page not found</h1>
                <p className="lead">That page doesn’t exist. Try the home page or book a demo.</p>
                <div className="btn-row mt-6">
                  <Link className="btn btn--primary" to="/">
                    Home
                  </Link>
                  <Link className="btn btn--ghost" to="/book-demo">
                    Book a Demo
                  </Link>
                </div>
              </div>
            </main>
          }
        />
      </Route>
    </Routes>
  )
}
