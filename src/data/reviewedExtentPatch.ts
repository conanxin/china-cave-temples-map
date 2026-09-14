import type { CanonicalExtentPatch } from '../georef/canonicalExtentPatch.ts'
import type { CaveTempleSite } from './types.ts'

export function applyReviewedExtentPatches(sites: CaveTempleSite[], patches: CanonicalExtentPatch[]): CaveTempleSite[] {
  if (!patches.length) return sites
  let next = sites.map((site) => ({ ...site, spatialExtents: site.spatialExtents?.map((extent) => ({ ...extent })) }))
  for (const patch of patches) {
    if (patch.reviewStatus !== 'human-approved' || !patch.confirmation) throw new Error(`patch ${patch.patchId} is not human-approved`)
    const siteIndex = next.findIndex((site) => site.id === patch.siteId && site.code === patch.siteCode)
    if (siteIndex < 0) throw new Error(`site not found for patch ${patch.patchId}`)
    const site = next[siteIndex]
    const extentIndex = site.spatialExtents?.findIndex((extent) => extent.id === patch.extentId) ?? -1
    if (extentIndex < 0 || !site.spatialExtents) throw new Error(`extent not found for patch ${patch.patchId}`)
    const extent = site.spatialExtents[extentIndex]
    if (extent.geometryStatus === 'verified') throw new Error(`extent ${patch.extentId} is already verified`)
    site.spatialExtents[extentIndex] = {
      ...extent,
      geometryStatus: 'verified',
      geometry: patch.geometryGcj02,
      derivation: 'georeferenced-official-map',
      sourceCrs: 'WGS84',
      targetCrs: 'GCJ-02',
      verificationNote: [
        extent.verificationNote,
        `Human-approved georeference patch ${patch.patchId}; session ${patch.sourceSessionId}; confirmed ${patch.confirmation.confirmedAt}.`,
      ].filter(Boolean).join(' '),
    }
  }
  return next
}
