export default function Logo({ size = 32 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-hidden="true">
      <circle cx="15" cy="15" r="11" stroke="currentColor" strokeWidth="2.4" />
      <path
        d="M10.4 15.2l3.3 3.3 8.6-8.6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M22.6 22.6l5 5" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}
