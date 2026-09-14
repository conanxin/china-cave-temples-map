import { wgs84ToGcj02 } from './wgs84ToGcj02.ts'

function outOfChina(lng: number, lat: number) {
  return lng < 73.66 || lng > 135.05 || lat < 3.86 || lat > 53.55
}

/**
 * Iteratively invert the deterministic WGS84 -> GCJ-02 transform.
 * Intended for research control-point capture from AMap, not survey-grade geodesy.
 */
export function gcj02ToWgs84(lng: number, lat: number): [number, number] {
  if (outOfChina(lng, lat)) return [lng, lat]
  let guessLng = lng
  let guessLat = lat
  for (let i = 0; i < 12; i += 1) {
    const [forwardLng, forwardLat] = wgs84ToGcj02(guessLng, guessLat)
    const errorLng = forwardLng - lng
    const errorLat = forwardLat - lat
    guessLng -= errorLng
    guessLat -= errorLat
    if (Math.max(Math.abs(errorLng), Math.abs(errorLat)) < 1e-11) break
  }
  return [guessLng, guessLat]
}
