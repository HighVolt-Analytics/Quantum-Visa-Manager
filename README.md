# Quantum Visa Manager

React + Vite frontend for the Quantum Visa Manager marketing website.

## Stack

- **React 19** + **Vite 6**
- **React Router** for multi-page SPA navigation
- **lucide-react** for chrome icons (header/theme)
- Original interactive demos (hero flow, clips, ROI, matrix, forms, etc.) via `src/lib/qvm.js`

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Build

```bash
npm run build
npm run preview
```

## Project layout

| Path | Purpose |
|------|---------|
| `src/components/` | Header, Footer, Layout, HtmlPage |
| `src/content/` | Page HTML bodies (migrated from static site) |
| `src/lib/qvm.js` | Interactive widgets (clips, journey, ROI, demo form…) |
| `src/pages/pages.js` | Route → content map |
| `public/assets/` | Images and favicon |
| `src/styles/style.css` | Design system |

## Pages

`/`, `/platform`, `/visa-operations`, `/ai-control-security`, `/solutions`, `/corporate-sponsorship`, `/practice-growth`, `/how-it-works`, `/pricing`, `/resources`, `/support`, `/book-demo`, `/privacy`, `/terms`
