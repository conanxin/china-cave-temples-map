import type { GeoreferenceControlPoint, GeoreferenceSpatialDistribution, PixelPoint } from './types.ts'

function cross(o: PixelPoint, a: PixelPoint, b: PixelPoint) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

function convexHull(points: PixelPoint[]) {
  const unique = [...new Map(points.map((point) => [`${point.x},${point.y}`, point])).values()]
    .sort((a, b) => a.x - b.x || a.y - b.y)
  if (unique.length <= 2) return unique
  const lower: PixelPoint[] = []
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop()
    lower.push(point)
  }
  const upper: PixelPoint[] = []
  for (let i = unique.length - 1; i >= 0; i -= 1) {
    const point = unique[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop()
    upper.push(point)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function polygonArea(points: PixelPoint[]) {
  if (points.length < 3) return 0
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function evaluateSpatialDistribution(
  controls: GeoreferenceControlPoint[],
  imageWidth?: number,
  imageHeight?: number,
): GeoreferenceSpatialDistribution {
  if (!imageWidth || !imageHeight || imageWidth <= 0 || imageHeight <= 0) {
    return { available: false, reason: 'valid image dimensions are required' }
  }
  if (controls.length < 3) return { available: false, reason: 'at least 3 fit points are required' }
  const points = controls.map((item) => item.pixel)
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const xSpanRatio = clamp01((Math.max(...xs) - Math.min(...xs)) / imageWidth)
  const ySpanRatio = clamp01((Math.max(...ys) - Math.min(...ys)) / imageHeight)
  const hullAreaRatio = clamp01(polygonArea(convexHull(points)) / (imageWidth * imageHeight))
  const spanCoverage = Math.sqrt(xSpanRatio * ySpanRatio)
  const hullCoverage = Math.min(1, hullAreaRatio * 2)
  const score = Math.round(100 * (0.6 * spanCoverage + 0.4 * hullCoverage))
  const verdict = score >= 65 ? 'good' : score >= 35 ? 'review' : 'poor'
  return { available: true, score, xSpanRatio, ySpanRatio, hullAreaRatio, verdict }
}
