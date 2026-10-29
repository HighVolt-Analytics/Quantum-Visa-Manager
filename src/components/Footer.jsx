import { Link } from 'react-router-dom'
import Logo from './Logo'

function Col({ title, items }) {
  return (
    <div className="f-col">
      <h4>{title}</h4>
      <ul>
        {items.map(([label, to]) => (
          <li key={to + label}>
            <Link to={to}>{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="f-top">
          <div className="f-brand">
            <Link className="brand" to="/">
              <Logo />
              <span className="brand-name">Quantum Visa Manager</span>
            </Link>
            <p>
              Software that completes the administrative work behind every visa matter — while
              registered migration agents stay responsible for advice, review and lodgement.
            </p>
            <Link className="status-dot" to="/support#status">
              All systems operational
            </Link>
          </div>
          <Col
            title="Platform"
            items={[
              ['Visa Operations', '/visa-operations'],
              ['Correspondence & Tasks', '/platform#correspondence'],
              ['Document & Checklist', '/platform#documents'],
              ['Form Preparation', '/platform#forms'],
              ['Visa Library', '/platform#library'],
              ['AI Control', '/ai-control-security'],
            ]}
          />
          <Col
            title="Solutions"
            items={[
              ['Migration Practices', '/solutions#practices'],
              ['Corporate Sponsorship', '/corporate-sponsorship'],
              ['Practice Growth', '/practice-growth'],
              ['Skills Assessment — soon', '/solutions#skills'],
              ['Interactive Tour', '/how-it-works#tour'],
            ]}
          />
          <Col
            title="Company"
            items={[
              ['About', '/resources#about'],
              ['Product Videos', '/resources#product-videos'],
              ['Guides', '/resources#guides'],
              ['Pricing', '/pricing'],
              ['Contact', '/support#contact'],
              ['Book a Demo', '/book-demo'],
            ]}
          />
          <Col
            title="Support & Legal"
            items={[
              ['Support', '/support'],
              ['Product status', '/support#status'],
              ['Security', '/ai-control-security#security'],
              ['Data residency', '/ai-control-security#residency'],
              ['Privacy', '/privacy'],
              ['Terms', '/terms'],
            ]}
          />
        </div>
        <div className="f-ack">
          <p>
            We acknowledge the Traditional Custodians of the lands on which we work and live, and
            pay our respects to Elders past and present. Sovereignty was never ceded.
          </p>
          <p>
            Quantum Visa Manager is practice-administration software. It does not provide
            immigration assistance or legal advice. Immigration assistance in Australia must be
            given by a registered migration agent or a person otherwise permitted to do so under
            the <i>Migration Act 1958</i>. Calculators and timelines are estimates, not guarantees
            of outcomes or processing times.
          </p>
        </div>
        <div className="f-bottom">
          <span>© 2026 High Volt Analytics. Made in Sydney, Australia. Prices in AUD.</span>
          <nav aria-label="Legal">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/ai-control-security#security">Security</Link>
            <Link to="/ai-control-security#residency">Data residency</Link>
            <Link to="/support">Support</Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
