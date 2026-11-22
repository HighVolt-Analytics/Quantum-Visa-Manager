const MW = 288
const MH = 144
const LAT_STEP = 9.5
const LAND_B64 =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPcBAOD/HwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACA//+P//f/LwgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4/v/4/////wcAAAAEAPABAAAAfAAAAAAAAAAAAAAAAAAAAADg9w/4/////wEAAP4AAAAAAAAA+AAAAAAAAAAAAAAAAAAAAIAG+Of//////wAAAHwGAAAAAAAAAAMAAAAAAAAAAAAAAACABwAc/4P//////wAAADAAAAAAQAAAAD4AAAAAAAAAAAAAAAAAfMbDcQAA/v///wAAAAAAAADABwAA//8HAMAPAAAAAAAAAABgAAAAAAAA/P///wAAAAAAAABwAADg//8AAAAAAAAAAAAAAADwG457dwcA8P//HwAAAAAAAAAYAAD///9/eAAAAAAAAAAAAAD4/g0H/w8A8P//PwAAAAAAAAAOgOv/////fwD/AAAAAAA/AAAA/B84/v8A8P//LwAAAAD4AAAA4PP//////////wAAAOD///H/+D/3cPgDoP//DwAAAID/BwAAx/v/////////P4AA/P///////////////////////w8AAOcBAAgAAAAAAAAAAAAAgP///////////////////////wcAACYAAAQAAAAAAAAAAAAAgf///////////////////////wMM8AAAAAAAAAAAAAAAAAAAIID/////////e+wPwH8AgA8AAP/5z/////////////////8/ANH///////9/AIALgD8AAAAAwH/+//////////////////9/APj///////8fADwAAD8AAAAA8D/+//////////////////sPAPC/+f////8fAPwAADgAAAAA8D/+////////////////D/wBAMCfAP////8PAPwYAAAAAAAA8H/4//////////////9/DgcAAAAcAOD///8/APw/AAAAAAAQAB7w//////////////8BgAMAAAACAMD/////Afh/AAAAAAA4gBz+/////////////38A4AMAAMAAAMD/////B/z/AAAAAABwwAb+/////////////x8A8AEAAAAAAAD/////P///AwAAAADmgOH//////////////z8A4AAAAAAAAAD+////P/7/BwAAAAD28P////////////////8D4AAAAAAAAAD8////f/7/BwAAAADz+f////////////////8HIAAAAAAAAAD6////////BAAAAABw/v////////////////8EAAAAAAAAAADo//////8jHgAAAACA//////////////////8MAAAAAAAAAADQ//////8OPgAAAADw//////////////////8AAAAAAAAAAADg//////+PIAAAAADA////v////////////38EAAAAAAAAAADg////////AAAAAACA//v/zD/8/////////z8AAAAAAAAAAADg//////8bAAAAAACA//N/gD///////////x8GAAAAAAAAAADw//////8AAAAAAAD+B8c/AD/+/////////wcPAAAAAAAAAADg//////8AAAAAAAD+gx4/DH74/////////wABAAAAAAAAAADg/////x8AAAAAAAD+gbCn///8////////fQABAAAAAAAAAADg/////w8AAAAAAAD/gCDn///4//////9/MgADAAAAAAAAAADA/////w8AAAAAAAD+AADm/3/4//////8/cIABAAAAAAAAAADA/////wcAAAAAAAA44AHC///5////////4+ABAAAAAAAAAACA/////wcAAAAAAACI/wEA4P//////////4OgAAAAAAAAAAAAA/////wMAAAAAAAD4/wAA4P//////////ADYAAAAAAAAAAAAA/P///wEAAAAAAAD+/wEA8P//////////AQcAAAAAAAAAAAAA+P//fwAAAAAAAAD//w8P8P//////////AQEAAAAAAAAAAAAAyP//fwAAAAAAAAD//3//////////////AQAAAAAAAAAAAAAA0P+PYQAAAAAAAAD//////z//////////AwAAAAAAAAAAAAAAoP8HwAAAAAAAAMD/////83/+////////AQAAAAAAAAAAAAAAIP8DwAAAAAAAAOD/////5//I////////AAAAAAAAAAAAAAAAQP4DgAAAAAAAAPD/////z/+A////////AAAAAAAAAAAAAAAAAPwDAAIAAAAAAPD/////z/8ZwP////9/AQAAAAAAAAAAAAAAAPgDQAAAAAAAAPj/////j/9/gP////8fAQAAAAAAAAAAAAAAAPADEAMAAAAAAPz/////v///AP9//P8DAAAAAAAAAAAAAAAAAPADAwwAAAAAAPj/////P/9/APw//B8AAAAAAAAAAAAIAAAAAPCHA8AAAAAAAPj/////P/4/APwP+J8BAAAAAAAAAAAAAAAAAMD/A0YEAAAAAPj/////f/4fAPwH+B8AAwAAAAAAAAAAAAAAAAD/AQAAAAAAAPj/////f/wHAPgD8D8AAwAAAAAAAAAAAAAAAADgHwAAAAAAAPj///////wDAPgAwH8AAQAAAAAAAAAAAAAAAADAHwAAAAAAAPz//////30AAPAAwH8AAAAAAAAAAAAAAAAAAAAAHAAAAAAAAPj//////wsAAPAAgH4AAQAAAAAAAAAAAAAAAAAAGEAAAAAAAPj//////wMBAPAAgHwAAAAAAAAAAAAAAAAAAAAAGPAhAAAAAPD///////cBAOAAgDiABAAAAAAAAAAAAAAAAAAAIPl/AAAAAOD///////8AAGABABBAFAAAAAAAAAAAAAAAAAAAgP7/AQAAAMD///////8AAAABgAAAHAAAAAAAAAAAAAAAAAAAAPz/AQAAAID///////8AAAABAAEgCAAAAAAAAAAAAAAAAAAAAPz/HwAAAAD/8P///38AAAAAAANgAAAAAAAAAAAAAAAAAAAAAPz/fwAAAAAAoP///z8AAAAAYAd4AAAAAAAAAAAAAAAAAAAAAPz/fwAAAAAAAP///x8AAAAAwAY8AAAAAAAAAAAAAAAAAAAAAP7//wAAAAAAAP///w8AAAAAgAc+AAAAAAAAAAAAAAAAAAAAAP///wAAAAAAAP///wcAAAAAgIM/TwAAAAAAAAAAAAAAAAAAAP///wEAAAAAgP///wMAAAAAAIc/QAQAAAAAAAAAAAAAAAAAgP///w8AAAAAgP///wEAAAAAAA6fAUQAAAAAAAAAAAAAAAAAAP////8AAAAAAP///wAAAAAAAB6ewuwDAgAAAAAAAAAAAAAAgP////8DAAAAAP7//wAAAAAAABwAAvAPAgAAAAAAAAAAAAAAgP////8PAAAAAPz/fwAAAAAAABAAAMCfAQAAAAAAAAAAAAAAAP////8PAAAAAPz//wAAAAAAAOADAIA/MAAAAAAAAAAAAAAAAP7///8PAAAAAPz/fwAAAAAAAAAPAMBngAAAAAAAAAAAAAAAAP7///8PAAAAAPz//wAAAAAAAAAACABAAAAAAAAAAAAAAAAAAPz///8HAAAAAPj//wAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAPz///8DAAAAAPj//wAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAPj///8BAAAAAPz//4AAAAAAAAAAAB8GAAAAAAAAAAAAAAAAAPj///8BAAAAAPz//8EAAAAAAAAAIB8OAAAAAAAAAAAAAAAAAPD///8BAAAAAP7//+AAAAAAAAAA+B8OACAAAAAAAAAAAAAAAMD///8BAAAAAP7/f/gAAAAAAAAA/H8eAAAAAAAAAAAAAAAAAID///8AAAAAAP7/H/gAAAAAAAAA/P8fAABAAAAAAAAAAAAAAAD///8AAAAAAPz/D3AAAAAAAAAA/v8/AAAAAAAAAAAAAAAAAAD///8AAAAAAPj/D3gAAAAAAADA//9/AAgAAAAAAAAAAAAAAAD//38AAAAAAPj/DzgAAAAAAADw////AAAAAAAAAAAAAAAAAAD//x8AAAAAAPD/DzgAAAAAAAD4////AQAAAAAAAAAAAAAAAAD//wMAAAAAAPD/DzgAAAAAAAD4////AwAAAAAAAAAAAAAAAID//wEAAAAAAPD/AwAAAAAAAAD4////AwAAAAAAAAAAAAAAAID//wEAAAAAAPD/AwAAAAAAAAD4////BwAAAAAAAAAAAAAAAID//wEAAAAAAOD/AwAAAAAAAAD4////BwAAAAAAAAAAAAAAAID//wAAAAAAAOD/AQAAAAAAAADw////BwAAAAAAAAAAAAAAAID//wAAAAAAAMD/AAAAAAAAAADw////AwAAAAAAAAAAAAAAAID/fwAAAAAAAIB/AAAAAAAAAADgf/z/AwAAAAAAAAAAAAAAAID/PwAAAAAAAIA/AAAAAAAAAADgB/D/AQAAAAAAAAAAAAAAAMD/HQAAAAAAAIABAAAAAAAAAADwAND/AQAAAAAAAAAAAAAAAMD/AwAAAAAAAAAAAAAAAAAAAAAAAID/AAAIAAAAAAAAAAAAAMD/BwAAAAAAAAAAAAAAAAAAAAAAAAD/AAAQAAAAAAAAAAAAAOD/AwAAAAAAAAAAAAAAAAAAAAAAAAA+AABwAAAAAAAAAAAAAOA/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAOA/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAOAPAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAGAAAAAAAAAAAAAMAPAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAADAAAAAAAAAAAAAPAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMABAAAAAAAAAAAAAPADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOABAAAAAAAAAAAAAPAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPADAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAPABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPCBAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAA+AABAAJ8//j8PAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAPD/fwD///////8/AAAAAAAAAAAAAAAAAIA+AAAAAAAAAAAAPP///8D/////////HwAAAAAAAAAAAAAAAIA9AAAAAAAA8Pz/////P/j//////////wMAAAAAAAAAAMAAAPB9AAAAAID/////////P/7///////////8BAAAAAAAAAOABAwB/AAAAAPD///////////////////////8AAAAAAFACPoD///9/AAAAAPD//////////////////////x8AAAAA+P////////8HAAAAAP///////////////////////wcAAAAA/v///////wMAAAAA/v///////////////////////wcAAAD8/////////w8AAA7w/////////////////////////w8AAMAB/////////wMAgB84/////////////////////////wEAAAAA/P///////3/w4AcA/////////////////////////wAAAADg//////////8/gM///////////////////////////wMAAADg/////////////f///////////////////////////z8A7wMA/v////////////////////////////////////////8/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

const PLACES = [
  { id: "singapore", lat: 1.2868, lon: 103.8545 },
  { id: "australia", lat: -33.7766, lon: 151.1226 },
  { id: "india", lat: 20.5937, lon: 78.9629 },
  { id: "myanmar", lat: 16.8409, lon: 96.1735 },
  { id: "usa", lat: 39.1582, lon: -75.5244 },
  { id: "dubai", lat: 25.2048, lon: 55.2708 },
]

function decodeLand() {
  const bin = atob(LAND_B64)
  const land = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) land[i] = bin.charCodeAt(i)
  return land
}

const LAND = decodeLand()

function isLand(lon, lat) {
  const gx = Math.floor(((lon + 180) / 360) * MW)
  const gy = Math.floor(((90 - lat) / 180) * MH)
  if (gx < 0 || gx >= MW || gy < 0 || gy >= MH) return false
  const bit = gy * MW + gx
  return (LAND[bit >> 3] >> (bit & 7)) & 1
}

const NODES = []
{
  for (let lat = -76; lat <= 76; lat += LAT_STEP) {
    const count = Math.max(8, Math.round(36 * Math.cos((lat * Math.PI) / 180)))
    for (let i = 0; i < count; i += 1) {
      const lon = -180 + (360 * i) / count
      NODES.push({
        lat: (lat * Math.PI) / 180,
        lon: (lon * Math.PI) / 180,
        land: isLand(lon, lat),
      })
    }
  }
}

const TOUR_IDS = ["dubai", "india", "myanmar", "singapore", "australia", "usa", "dubai"]

function toVec(lat, lon) {
  const cl = Math.cos(lat)
  return [cl * Math.cos(lon), Math.sin(lat), cl * Math.sin(lon)]
}

function fromVec(v) {
  return {
    lat: Math.asin(Math.max(-1, Math.min(1, v[1]))),
    lon: Math.atan2(v[2], v[0]),
  }
}

function slerp(a, b, t) {
  const va = toVec(a.lat, a.lon)
  const vb = toVec(b.lat, b.lon)
  let dot = va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]
  dot = Math.max(-1, Math.min(1, dot))
  const omega = Math.acos(dot)
  if (omega < 1e-4) return { lat: a.lat, lon: a.lon }
  const so = Math.sin(omega)
  const s0 = Math.sin((1 - t) * omega) / so
  const s1 = Math.sin(t * omega) / so
  return fromVec([
    va[0] * s0 + vb[0] * s1,
    va[1] * s0 + vb[1] * s1,
    va[2] * s0 + vb[2] * s1,
  ])
}

function arcLength(a, b) {
  const va = toVec(a.lat, a.lon)
  const vb = toVec(b.lat, b.lon)
  const dot = va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]
  return Math.acos(Math.max(-1, Math.min(1, dot)))
}

const PATH = []
{
  const stops = TOUR_IDS.map((id) => {
    const place = PLACES.find((item) => item.id === id)
    return { lat: (place.lat * Math.PI) / 180, lon: (place.lon * Math.PI) / 180 }
  })
  const lengths = stops.slice(0, -1).map((stop, index) => arcLength(stop, stops[index + 1]))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  lengths.forEach((length, leg) => {
    const samples = Math.max(6, Math.round(220 * (length / total)))
    for (let step = 0; step < samples; step += 1) {
      PATH.push({
        ...slerp(stops[leg], stops[leg + 1], step / samples),
        lift: Math.sin(Math.PI * (step / samples)) * 0.16,
      })
    }
  })
}

function project(lat, lon, spin, tilt, cx, cy, radius) {
  const cl = Math.cos(lat)
  const x0 = cl * Math.cos(lon)
  const y0 = Math.sin(lat)
  const z0 = cl * Math.sin(lon)
  const cs = Math.cos(spin)
  const sn = Math.sin(spin)
  const ct = Math.cos(tilt)
  const st = Math.sin(tilt)
  const x1 = x0 * cs - z0 * sn
  const z1 = x0 * sn + z0 * cs
  const y2 = y0 * ct - z1 * st
  const z2 = y0 * st + z1 * ct
  return { x: cx + x1 * radius, y: cy - y2 * radius, z: z2 }
}

const PALETTE = {
  light: {
    water: [18, 104, 220],
    land: [224, 88, 8],
    landWarm: [214, 142, 8],
    line: [208, 22, 126],
    pin: [208, 22, 126],
  },
  dark: {
    water: [96, 165, 250],
    land: [251, 146, 60],
    landWarm: [250, 204, 84],
    line: [244, 114, 182],
    pin: [244, 114, 182],
  },
}

function heave(lat, lon, now) {
  return Math.sin(now * 0.00085 + lat * 1.4 + lon * 0.9)
}

export function mountHubGlobe(canvas, reduceMotion = false) {
  if (!canvas || canvas.dataset.globe === "1") return () => {}
  canvas.dataset.globe = "1"
  const modeRef = {
    current: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
  }
  const themeObserver = new MutationObserver(() => {
    modeRef.current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })

  const ctx = canvas.getContext("2d")
    let frame = 0
    let spin = 0.4
    const tilt = -0.2
    let width = 0
    let height = 0
    let dpr = 1

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      dpr = Math.min(2, window.devicePixelRatio || 1)
      const nextW = Math.round(rect.width * dpr)
      const nextH = Math.round(rect.height * dpr)
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW
        canvas.height = nextH
      }
      width = rect.width
      height = rect.height
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const drawDots = (points, rgb, radius) => {
      const levels = [[], [], [], [], []]
      for (let i = 0; i < points.length; i += 3) {
        const level = Math.min(4, (points[i + 2] * 5) | 0)
        levels[level].push(points[i], points[i + 1])
      }
      for (let level = 0; level < levels.length; level += 1) {
        const list = levels[level]
        if (!list.length) continue
        const depth = (level + 0.5) / 5
        const alpha = modeRef.current === "dark" ? 0.58 + 0.42 * depth : 0.86 + 0.14 * depth
        const size = radius * (0.84 + 0.2 * depth)
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`
        ctx.beginPath()
        for (let i = 0; i < list.length; i += 2) {
          ctx.moveTo(list[i] + size, list[i + 1])
          ctx.arc(list[i], list[i + 1], size, 0, Math.PI * 2)
        }
        ctx.fill()
      }
    }

    const draw = (now, dt) => {
      if (!width || !height) return
      const colors = PALETTE[modeRef.current] || PALETTE.light
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const idle = 0.42
      spin += idle * dt / 1000
      const unit = Math.min(width, height)
      const cx = width / 2
      const cy = height / 2
      const radius = unit * 0.44
      const sea = []
      const soil = []
      const bloom = []

      for (let i = 0; i < NODES.length; i += 1) {
        const node = NODES[i]
        const lift = heave(node.lat, node.lon, now)
        const point = project(node.lat, node.lon, spin, tilt, cx, cy, radius * (1 + lift * 0.01))
        if (point.z <= 0.02) continue
        point.y += lift * radius * 0.014
        const list = node.land ? (node.lon < -0.4 || node.lon > 2.2 ? bloom : soil) : sea
        list.push(point.x, point.y, Math.min(0.999, point.z))
      }

      const dot = radius * 0.044
      drawDots(sea, colors.water, dot)
      drawDots(soil, colors.land, dot)
      drawDots(bloom, colors.landWarm, dot)

      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.setLineDash([])
      const [lr, lg, lb] = colors.line
      const count = PATH.length
      const tail = Math.round(count * 0.2)
      const flight = (phase) => {
        const head = (((now / 6400) + phase) % 1) * count
        const trace = (span, style, width) => {
          ctx.beginPath()
          let drawing = false
          for (let back = span; back >= 0; back -= 1) {
            const sample = PATH[Math.floor(head - back + count * 4) % count]
            const point = project(sample.lat, sample.lon, spin, tilt, cx, cy, radius * (1.02 + sample.lift))
            if (point.z <= 0.04) {
              drawing = false
              continue
            }
            if (!drawing) {
              ctx.moveTo(point.x, point.y)
              drawing = true
            } else {
              ctx.lineTo(point.x, point.y)
            }
          }
          ctx.strokeStyle = style
          ctx.lineWidth = width
          ctx.stroke()
        }
        trace(tail, `rgba(${lr},${lg},${lb},0.45)`, Math.max(2.2, unit * 0.015))
        trace(Math.round(tail * 0.45), `rgba(${lr},${lg},${lb},1)`, Math.max(1.5, unit * 0.009))
        const tip = PATH[Math.floor(head + count) % count]
        const tipPoint = project(tip.lat, tip.lon, spin, tilt, cx, cy, radius * (1.02 + tip.lift))
        if (tipPoint.z > 0.05) {
          ctx.beginPath()
          ctx.arc(tipPoint.x, tipPoint.y, Math.max(1.8, unit * 0.012), 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${lr},${lg},${lb},0.95)`
          ctx.fill()
        }
      }
      flight(0)
      flight(0.5)

      PLACES.forEach((place) => {
        const lat = (place.lat * Math.PI) / 180
        const lon = (place.lon * Math.PI) / 180
        const lift = heave(lat, lon, now)
        const point = project(lat, lon, spin, tilt, cx, cy, radius * (1 + lift * 0.01))
        if (point.z <= 0.03) return
        point.y += lift * radius * 0.014
        const [pr, pg, pb] = colors.pin
        const pin = Math.max(2.4, unit * 0.02) * (0.86 + 0.14 * point.z)
        ctx.beginPath()
        ctx.arc(point.x, point.y, pin, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${pr},${pg},${pb},${(0.7 + 0.3 * point.z).toFixed(3)})`
        ctx.fill()
      })
    }

    let last = performance.now()
    const loop = (now) => {
      if (!canvas.isConnected) {
        stop()
        return
      }
      const dt = Math.min(48, now - last)
      last = now
      draw(now, reduceMotion ? 0 : dt)
      frame = requestAnimationFrame(loop)
    }

    const stop = () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      themeObserver.disconnect()
    }

    resize()
    frame = requestAnimationFrame(loop)
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    return stop
  }
