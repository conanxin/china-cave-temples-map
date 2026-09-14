import type { CaveTempleSite, HeritageBatch, RegionGroup, SiteType } from '../data/types'
import { derivationLabel, evidenceTierLabel, extentKindLabel } from '../map/spatialExtentPresentation'
import { getSpatialSourceAssetsForSite } from '../data/spatialSourceAssets'
import { getSpatialMapTargetsForSite } from '../data/spatialMapTargets'
import { sourceAssetRetrievalLabel, sourceAssetStatusLabel, sourceAssetTypeLabel } from '../map/spatialSourceAssetPresentation'
import { georeferenceStatusLabel, mapPageStatusLabel } from '../map/spatialMapTargetPresentation'
import { getSpatialServiceProbesForSite } from '../data/spatialServiceProbes'
import { serviceEvidenceLabel, serviceGeometryLabel, serviceKindLabel, serviceVerdictLabel } from '../map/spatialServiceProbePresentation'
import { getSpatialBoundaryRouteForSite } from '../data/spatialBoundaryRoutes'
import { boundaryRouteStatusLabel } from '../map/spatialBoundaryRoutePresentation'
import { getSpatialDocumentLocatorsForSite } from '../data/spatialDocumentLocators'
import { documentLocatorKindLabel, formatDocumentPageRange } from '../map/spatialDocumentLocatorPresentation'
import { getSpatialPdfExtractionPlansForSite } from '../data/spatialPdfExtractionPlans'
import { buildPdfTargetCommand, pdfExtractionStrategyLabel, pdfRangeCapabilityLabel } from '../map/spatialPdfExtractionPlanPresentation'

const regionLabel: Record<RegionGroup, string> = {
  xinjiang: '新疆地区石窟寺', qingzang: '青藏地区石窟寺', north: '中原北方地区石窟寺', south: '南方地区石窟寺',
}
const typeLabel: Record<SiteType, string> = {
  'cave-temple': '石窟寺', 'cliff-carving': '摩崖造像 / 石刻', 'giant-buddha': '巨型造像', mixed: '复合遗址',
}
function batchLabel(batch: HeritageBatch) {
  return batch === '5-supplement' ? '第五批增补' : `第${['', '一', '二', '三', '四', '五', '六', '七', '八'][Number(batch)]}批`
}

export function SiteDetail({ site }: { site?: CaveTempleSite }) {
  if (!site) return <aside className="detail-panel detail-empty"><div>从左侧编号或地图选择一处遗址。</div></aside>
  const hasVerifiedComponent = site.subpoints?.some((point) => point.coordinateConfidence === 'verified') ?? false
  const statusClass = site.coordinateConfidence === 'verified' ? 'verified' : hasVerifiedComponent ? 'partial' : site.coordinateConfidence
  const statusText = site.coordinateConfidence === 'verified' ? '主点已核验' : hasVerifiedComponent ? '部分组成点已核验' : site.coordinateConfidence === 'probable' ? '候选坐标' : '待核验'
  const sourceAssets = getSpatialSourceAssetsForSite(site.id)
  const mapTargets = getSpatialMapTargetsForSite(site.id)
  const serviceProbes = getSpatialServiceProbesForSite(site.id)
  const boundaryRoute = getSpatialBoundaryRouteForSite(site.id)
  const documentLocators = getSpatialDocumentLocatorsForSite(site.id)
  const pdfExtractionPlans = getSpatialPdfExtractionPlansForSite(site.id)
  return (
    <aside className="detail-panel">
      <div className="detail-kicker">SITE {site.code}</div>
      <h2>{site.name}</h2>
      {site.aliases.length > 0 && <div className="aliases">{site.aliases.join(' / ')}</div>}
      <div className="status-line"><span className={`status-pill ${statusClass}`}>{statusText}</span><span>{site.siteExtent === 'group' ? '遗址群 / 复合点位' : '单体遗址'}</span></div>
      <dl className="facts">
        <Fact name="位置" value={`${site.province} ${site.prefecture} ${site.county}`} />
        <Fact name="区系" value={regionLabel[site.regionGroup]} />
        <Fact name="国保" value={batchLabel(site.heritageBatch)} />
        <Fact name="形态" value={typeLabel[site.siteType]} />
        <Fact name="宗教" value={site.religion === 'daoist' ? '道教' : site.religion === 'buddhist' ? '佛教' : site.religion === 'mixed' ? '混合' : '其他'} />
        <Fact name="年代" value={site.mainPeriods.length ? site.mainPeriods.join('、') : '尚未录入'} />
      </dl>

      <div className="research-card">
        <div className="research-heading">坐标核验</div>
        <p>{site.coordinateConfidence === 'verified' ? site.verificationNote : hasVerifiedComponent ? '父级遗址仍不使用单一伪精确坐标；下方只发布已逐项核验的组成点。其余组成点继续核验。' : '当前静态数据不伪造精确坐标。配置高德 Key 后会在地图中调用同一底图的 POI 搜索生成候选点，候选仍需人工复核后才能晋升为“已核验”。'}</p>
        <code>{site.amapQuery}</code>
      </div>

      {site.spatialExtents?.length ? (
        <div className="spatial-card">
          <div className="research-heading">空间范围证据</div>
          {site.spatialExtents.map((extent) => (
            <div className="spatial-row" key={extent.id}>
              <div className="spatial-row-head"><strong>{extent.label}</strong><span className={`extent-kind ${extent.kind}`}>{extentKindLabel(extent.kind)}</span></div>
              <div className={`extent-status ${extent.geometryStatus}`}>{extent.geometryStatus === 'verified' ? '已有核验几何，可在地图显示' : '证据已录入，暂无可发布边界几何'}</div>
              <div className="extent-meta">
                <span>{evidenceTierLabel(extent.evidenceTier)}</span>
                <span>{derivationLabel(extent.derivation)}</span>
                {extent.areaHa != null && <span>{extent.areaHa.toLocaleString('zh-CN')} ha</span>}
                {extent.sourceDate && <span>{extent.sourceDate}</span>}
              </div>
              <p>{extent.description}</p>
              <small>{extent.source}{extent.officialReference ? ` · ${extent.officialReference}` : ''}</small>
              {extent.sourceUrl && <a href={extent.sourceUrl} target="_blank" rel="noreferrer">查看来源</a>}
            </div>
          ))}
        </div>
      ) : null}

      {mapTargets.length ? (
        <div className="map-target-card">
          <div className="research-heading">官方地图提取目标</div>
          {mapTargets.map((target) => (
            <div className="map-target-row" key={target.id}>
              <div className="map-target-head">
                <strong>{target.officialReference} · {target.mapTitle ?? site.name}</strong>
                <span>{mapPageStatusLabel(target.pageStatus)}</span>
              </div>
              <div className="extent-meta">
                <span>{georeferenceStatusLabel(target.georeferenceStatus)}</span>
                <span>关联范围 {target.linkedExtentIds.length} 条</span>
                {target.pageNumber != null && <span>PDF p.{target.pageNumber}</span>}
                {target.scaleText && <span>{target.scaleText}</span>}
              </div>
              {target.notes && <p>{target.notes}</p>}
              {target.nextAction && <div className="asset-next"><b>下一步</b><span>{target.nextAction}</span></div>}
            </div>
          ))}
        </div>
      ) : null}

      {documentLocators.length ? (
        <div className="document-locator-card">
          <div className="research-heading">申遗卷宗页码线索</div>
          {documentLocators.map((locator) => (
            <div className="document-locator-row" key={locator.id}>
              <div className="document-locator-head">
                <strong>{locator.officialReference} · {locator.label}</strong>
                <span>{documentLocatorKindLabel(locator.kind)}</span>
              </div>
              <div className="extent-meta">
                <span>{formatDocumentPageRange(locator.startPage, locator.endPage)}</span>
                <span>{evidenceTierLabel(locator.evidenceTier)}</span>
              </div>
              {locator.notes && <p>{locator.notes}</p>}
              <a href={locator.evidenceUrl} target="_blank" rel="noreferrer">查看页码依据</a>
            </div>
          ))}
        </div>
      ) : null}

      {pdfExtractionPlans.length ? (
        <div className="pdf-plan-card">
          <div className="research-heading">远程 PDF 定向提取</div>
          {pdfExtractionPlans.map((plan) => {
            const siteLocators = documentLocators.filter((locator) => plan.targetLocatorIds.includes(locator.id))
            const priority = siteLocators.find((locator) => locator.id === plan.priorityLocatorId)
            const commandLocator = priority ?? siteLocators.find((locator) => locator.kind === 'management-plan') ?? siteLocators[0]
            const command = commandLocator ? buildPdfTargetCommand(commandLocator.id, `artifacts/unesco/nomination-1442/site-${site.code}`) : undefined
            return (
              <div className="pdf-plan-row" key={plan.id}>
                <div className="pdf-plan-head">
                  <strong>{pdfExtractionStrategyLabel(plan.strategy)}</strong>
                  <span>{pdfRangeCapabilityLabel(plan.rangeCapability)}</span>
                </div>
                <div className="extent-meta">
                  {plan.expectedSizeBytes != null && <span>{formatBytes(plan.expectedSizeBytes)}</span>}
                  <span>本遗址页段 {siteLocators.length} 条</span>
                  {priority && <span>优先 {formatDocumentPageRange(priority.startPage, priority.endPage)}</span>}
                </div>
                {siteLocators.length > 0 && (
                  <div className="pdf-plan-windows">
                    {siteLocators.map((locator) => <span key={locator.id}>{documentLocatorKindLabel(locator.kind)} {formatDocumentPageRange(locator.startPage, locator.endPage)}</span>)}
                  </div>
                )}
                {plan.notes && <p>{plan.notes}</p>}
                {command && <code>{command}</code>}
                {plan.nextAction && <div className="asset-next"><b>下一步</b><span>{plan.nextAction}</span></div>}
              </div>
            )
          })}
        </div>
      ) : null}

      {sourceAssets.length ? (
        <div className="source-asset-card">
          <div className="research-heading">源图 / 源数据资产</div>
          {sourceAssets.map((asset) => (
            <div className="source-asset-row" key={asset.id}>
              <div className="source-asset-head">
                <strong>{asset.title}</strong>
                <span className={`asset-status ${asset.processingStatus}`}>{sourceAssetStatusLabel(asset.processingStatus)}</span>
              </div>
              <div className="extent-meta">
                <span>{sourceAssetTypeLabel(asset.type)}</span>
                <span>{evidenceTierLabel(asset.evidenceTier)}</span>
                {asset.sourceDate && <span>{asset.sourceDate}</span>}
                {asset.observedSizeBytes != null && <span>{formatBytes(asset.observedSizeBytes)}</span>}
                {asset.retrievalStatus && <span>{sourceAssetRetrievalLabel(asset.retrievalStatus)}</span>}
              </div>
              <small>{asset.publisher}{asset.officialReference ? ` · ${asset.officialReference}` : ''}</small>
              {asset.notes && <p>{asset.notes}</p>}
              {asset.retrievalNote && <p className="asset-retrieval-note">{asset.retrievalNote}</p>}
              {asset.nextAction && <div className="asset-next"><b>下一步</b><span>{asset.nextAction}</span></div>}
              <div className="asset-footer"><span>关联范围 {asset.linkedExtentIds.length} 条</span><span className="asset-links"><a href={asset.url} target="_blank" rel="noreferrer">打开源资产</a>{asset.directDownloadUrl && <a href={asset.directDownloadUrl} target="_blank" rel="noreferrer">原始文件</a>}</span></div>
            </div>
          ))}
        </div>
      ) : null}

      {boundaryRoute ? (
        <div className="boundary-route-card">
          <div className="research-heading">边界获取路线</div>
          <div className="boundary-route-row">
            <div className="boundary-route-head"><strong>{boundaryRoute.officialReference}</strong><span>{boundaryRouteStatusLabel(boundaryRoute.status)}</span></div>
            <p>{boundaryRoute.reason}</p>
            <div className="asset-next"><b>下一步</b><span>{boundaryRoute.nextAction}</span></div>
          </div>
        </div>
      ) : null}

      {serviceProbes.length ? (
        <div className="service-probe-card">
          <div className="research-heading">GIS 服务发现</div>
          {serviceProbes.map((probe) => (
            <div className="service-probe-row" key={probe.id}>
              <div className="service-probe-head">
                <strong>{probe.title}</strong>
                <span className={`service-verdict ${probe.verdict}`}>{serviceVerdictLabel(probe.verdict)}</span>
              </div>
              <div className="extent-meta">
                <span>{serviceKindLabel(probe.kind)}</span>
                <span>几何：{serviceGeometryLabel(probe.geometryType)}</span>
                <span>{serviceEvidenceLabel(probe.evidence)}</span>
                <span>核验 {probe.observedAt}</span>
              </div>
              {(probe.serviceItemId || probe.layerId != null || probe.lastEditDate) && (
                <div className="service-metadata">
                  {probe.serviceItemId && <code>item {probe.serviceItemId}</code>}
                  {probe.layerId != null && <code>layer {probe.layerId}</code>}
                  {probe.lastEditDate && <span>服务最后编辑 {probe.lastEditDate}</span>}
                </div>
              )}
              {probe.notes && <p>{probe.notes}</p>}
              {probe.nextAction && <div className="asset-next"><b>下一步</b><span>{probe.nextAction}</span></div>}
              {probe.url && <a href={probe.url} target="_blank" rel="noreferrer">打开服务 / 应用</a>}
            </div>
          ))}
        </div>
      ) : null}

      {site.subpoints?.some((point) => point.coordinateConfidence === 'verified') && (
        <div className="subpoint-card">
          <div className="research-heading">已核验组成点</div>
          {site.subpoints.filter((point) => point.coordinateConfidence === 'verified').map((point) => (
            <div className="subpoint-row" key={point.id}>
              <div><b>{site.code}{point.codeSuffix}</b><strong>{point.name}</strong></div>
              <span>{point.lng.toFixed(6)}, {point.lat.toFixed(6)}</span>
              {point.verificationNote && <small>{point.verificationNote}</small>}
            </div>
          ))}
        </div>
      )}

      <div className="future-grid">
        {['岩性 / 地质','最大造像尺度','残损情况','缺失佛首证据','参考文献','历史照片','田野记录'].map((item) => <div key={item}><span>{item}</span><b>待扩展</b></div>)}
      </div>
    </aside>
  )
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function Fact({ name, value }: { name: string, value: string }) {
  return <div><dt>{name}</dt><dd>{value}</dd></div>
}
