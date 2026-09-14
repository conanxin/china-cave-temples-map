# 空间源资产注册表方法

更新：2026-09-12 · v0.14

## 为什么需要单独注册“源资产”

一个空间范围可能来自 PDF 图纸、GIS 服务、法规正文、政府案例、世界遗产地理数据页或正式矢量文件。仅在 `SiteSpatialExtent.sourceUrl` 里放一个网址无法回答：

- 这是原始图纸还是二手网页？
- 文件是否已经下载？
- 文字是否已经提取？
- 是否已经配准？
- 是否真的存在可用矢量？
- 一份源文件支撑了哪些遗址 / 哪些范围？

因此 v0.9 新增 `SpatialSourceAsset`。

## 资产类型

- `official-map-pdf`：官方地图 / 申报图 PDF。
- `official-geodata-page`：官方地理数据网页。
- `official-protection-document`：官方保护规划 / 保护范围文件。
- `official-legal-webpage`：官方法规网页。
- `official-case-webpage`：官方案例 / 执法 / 公益诉讼网页。
- `official-vector-dataset`：可直接使用或转换的官方矢量数据。
- `official-gis-platform`：官方在线 GIS / Sites Navigator 等边界平台；平台权威不等于已经找到可导出的 Polygon 服务。

## v0.12 获取状态与 context-only 服务资产

`SpatialSourceAsset` 新增远程文件获取字段：

- `directDownloadUrl`：原始二进制下载端点；
- `retrievalStatus`：`not-attempted | metadata-only | download-blocked-environment | materialized`；
- `retrievalNote`：说明为什么当前处在该状态。

这样可以区分“已经知道官方文件在哪里”与“已经把原始文件物化到本地”。对于 Document 132728，当前就是：

`official-map-pdf + georeference-needed + download-blocked-environment`。

此外 v0.12 把两个公开但不适用的 ArcGIS 服务登记为独立 `context-source` 资产：

- WWF SIGHT Natural/Mixed WH Polygon；
- EEA Maratlas WH Point。

它们自身都是真实可访问服务，但只承担排除/比较证据，`linkedExtentIds` 为空，绝不与四个文化石窟的规范边界证据绑定。

### 获取尝试不是源资产

`SpatialAcquisitionAttempt` 单独记录“某次技术获取发生了什么”，包括：目标 URL、attempt kind、status、failure class、观察时间、已知大小、下一步动作。

因此同一源资产可以经历多次尝试，而不覆盖资产本身的身份与权威性。

## 处理状态

### `registered`

只完成来源登记，还没有提取内容。

### `text-extracted`

已经从来源中提取可引用的坐标、面积、四至、制度或范围信息，但不代表拥有边界几何。

### `georeference-needed`

存在官方地图/图纸，但需要进一步：

1. 取得原始文件；
2. 确认页码 / 图号；
3. 识别坐标格网、比例尺与控制点；
4. 判断是否具备可靠配准条件；
5. 输出配准误差报告；
6. 才能考虑矢量化。

### `service-discovery-needed`

已经确认存在官方 GIS 平台，但还没有发现并验证承载目标边界的公开服务 / 图层。必须继续核对 FeatureServer / MapServer / vector service、字段和 geometry 类型。

### `vector-ready`

已经取得可用官方矢量，或官方图纸经有记录的配准流程生成可发布几何。该状态必须有实际数据成果支撑，不能人工直接设置“看起来完成”。

## v0.11 GIS 服务发现探针

v0.11 新增 `SpatialServiceProbe`。它不是新的源资产，而是对一个 GIS 源资产继续做技术层审计，保存：

- `kind`：Experience app / FeatureServer / MapServer / vector tiles 等；
- `geometryType`：point / polyline / polygon / multipolygon / mixed / unknown；
- `verdict`：当前 app 已确认 / 已排除边界源 / 边界服务候选 / 公开端点未解析；
- `evidence`：官方一级、REST 服务元数据或实施伙伴架构线索；
- service item id / layer id / last edit date（如能取得）；
- 下一步动作。

`unesco-sites-navigator` 当前 canonical URL 为 UNESCO 官方页面直接链接的：

`https://experience.arcgis.com/experience/4f1652275d1f4656964b64a20a7346d3`

旧 `e3ea9...` 不再作为当前 URL。发现的公开 `UNESCO_0` layer 被 REST metadata 明确判定为 Point，已存为 `rejected-boundary-source`；实施伙伴提及的 harmonized layer 因无公开端点仍为 `not-publicly-resolved`。

详细记录见 `docs/service-discovery-audit.md`。

## v0.10 地图提取目标与官方 GIS 平台

v0.10 新增 `SpatialMapTarget`，用于追踪一份大地图资产中的具体目标图页，而不是把整份 PDF 只记录成一个模糊的 `georeference-needed`。

Document 132728 当前建立 4 个目标：

- `unesco-1442-025-map` → 08 克孜尔；
- `unesco-1442-027-map` → 06 炳灵寺；
- `unesco-1442-028-map` → 05 麦积山；
- `unesco-1442-029-map` → 27 大佛寺。

每个目标分别保存：`pageStatus`、`georeferenceStatus`、官方编号、关联范围、已知页码 / 比例尺 / CRS 提示和下一步动作。当前没有取得 PDF 本地副本，因此四个目标都保持 `page-location-needed + not-started`。

同时新增资产 `unesco-sites-navigator`：

- 类型：`official-gis-platform`；
- 证据等级：`official-primary`；
- 状态：`service-discovery-needed`；
- 关联 05 / 06 / 08 / 27 的 UNESCO property + buffer 证据。

UNESCO 官方说明 Sites Navigator 用于显示已核验、已地理配准的遗产边界，同时也说明未展示 polygon 可能仍在等待缔约国提交或 UNESCO 审核。因此项目只有在确认具体组成遗产的真实 Polygon 服务后，才会把该资产推进到 `vector-ready`。

公开发现的 `UNESCO_0` ArcGIS 图层元数据为 `esriGeometryPoint`，不满足边界需要，已经明确作为排除项记录，不能被误用成 property / buffer geometry。

详细步骤见 `docs/boundary-acquisition-pipeline.md`。

## v0.9 UNESCO 1442 地图资产

`unesco-1442-maps-2014`：

- 官方页面：https://whc.unesco.org/en/documents/132728
- 标题：*Silk Roads: the Routes Network of Chang'an-Tianshan Corridor - maps of inscribed property*
- 日期：2014-06-25
- 来源：Nomination
- 观察到的远程文件大小：40,574,291 bytes
- 当前状态：`georeference-needed`
- 关联展墙石窟：05 麦积山、06 炳灵寺、08 克孜尔、27 大佛寺

UNESCO Maps / Geographical data 页面则单独登记为 `unesco-1442-geodata`。它已经完成文字/表格提取，因此是 `text-extracted`；它提供代表坐标和面积，但不提供可直接从网页表格恢复的边界几何。

## 关联完整性

每个资产保存：

- `linkedSiteIds`
- `linkedExtentIds`

自动测试要求每个 `linkedExtentId` 都必须真实存在于关联遗址中，避免来源台账和实际地图范围分叉。

## 未来下载后的补充字段

当前类型先记录远程资产元数据。成功获取原始文件后，下一阶段应继续扩展：

- 本地 / 归档资产 ID
- SHA-256
- 页数
- 目标图页 / 图号
- 页面尺寸 / DPI
- 坐标格网 / CRS
- 控制点清单
- 配准方法
- RMSE / 最大残差
- 配准成果或官方矢量的产物 ID

只有这些链条闭合后，`official-map-pdf` 才可能从 `georeference-needed` 推进到 `vector-ready`。

## v0.13：大型官方卷宗与页码定位器

新增资产类型 `official-nomination-pdf`，用于登记 UNESCO 完整申遗卷宗等超大型官方 PDF。它与较小的 `official-map-pdf` 分开，是因为两者的处理策略不同：

- `official-map-pdf`：优先完整下载、逐页扫描和配准；
- `official-nomination-pdf`：优先通过机构目录、引用页码或内部索引建立 `SpatialDocumentLocator`，再定向提取页窗。

`SpatialDocumentLocator` 必须包含：

- `sourceAssetId`
- `siteId`
- `officialReference`
- `kind`
- `startPage / endPage`
- `evidenceTier`
- `evidenceUrl`
- `label`

页码定位器是“去哪里找”的证据，不等于地图页已经被提取，更不等于边界已经配准。


## v0.14：超大型 PDF 的远程定向提取

对 `official-nomination-pdf`，当文件接近 1GB 且已有页码定位器时，优先登记 `SpatialPdfExtractionPlan`。计划必须保存源资产、目标 locator、远程 URL、期望大小、Range 能力状态、策略和网络预算。只有远端 Range 被真实探测为可用后，才能把状态从 `blocked-environment/unknown` 改为 `range-supported`。
