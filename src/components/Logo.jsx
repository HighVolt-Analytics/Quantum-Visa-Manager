export default function Logo({ size = 32 }) {
  return (
    <img
      src="/assets/logo.png"
      alt=""
      width={size}
      height={size}
      decoding="async"
    />
  )
}
