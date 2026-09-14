# UNESCO Sites Navigator 服务发现审计

更新：2026-09-12 · v0.12

## 目标

v0.11 不再只记录“UNESCO 有一个官方 GIS 平台”，而是把**应用入口、ArcGIS 服务端点、几何类型与是否能作为边界源**分别审计。核心原则：

> 平台显示 Polygon ≠ 已经找到公开可查询的 Polygon REST 端点。

只有得到可公开验证的 Polygon / MultiPolygon 服务，并确认字段能定位到目标 World Heritage property / buffer，才允许进入 `candidate-boundary-service`，更不能直接进入 `vector-ready`。

## v0.12 ArcGIS 深挖结论与 PDF 回退触发

### A. 当前 Experience 的 REST item / data 未能在本环境直接读取

针对当前官方 Experience `4f1652275d1f4656964b64a20a7346d3`，本阶段实际尝试：

- item metadata：`https://www.arcgis.com/sharing/rest/content/items/4f1652275d1f4656964b64a20a7346d3?f=pjson`
- item data：`https://www.arcgis.com/sharing/rest/content/items/4f1652275d1f4656964b64a20a7346d3/data?f=pjson`

当前 container 对 `www.arcgis.com` 出现 DNS 解析失败。这个结果被记录为 `blocked-environment / dns-resolution`，**不是“item 不存在”或“不公开”的证据**。因此 v0.12 没有猜测 dataSources、WebMap itemId 或隐藏 FeatureServer URL。

### B. 找到 Polygon 服务，但确认不适用于四个文化石窟

公开 WWF SIGHT 服务：

`https://wwf-sight-maps.org/arcgis/rest/services/Global/World_Heritage_Sites/MapServer/0`

REST metadata 明确：

- Geometry Type = `esriGeometryPolygon`；
- Service Item Id = `8d2ad6e0f3884f38b06363862ef7e0f2`；
- Subject = **UNESCO Natural and Mixed World Heritage Sites**。

因此即使它是真 Polygon，也不适用于 1442-025 / 027 / 028 / 029 四个文化遗产组成部分，已登记为 `rejected-boundary-source`。这条记录用于证明：

> “几何类型正确”仍不足以成为边界来源，数据覆盖语义也必须匹配。

### C. EEA Maratlas 公开世界遗产服务也是 Point

公开 EEA Maratlas 叶子层：

`https://maratlas.discomap.eea.europa.eu/arcgis/rest/services/Maratlas/world_heritage/MapServer/26`

REST metadata 的 Geometry Type = `esriGeometryPoint`。因此它可作为历史制图/点位线索，但同样不能生成 Property / Buffer Polygon。

### D. 路线决策：GIS primary 暂未闭环，官方 PDF fallback 已启用

05 / 06 / 08 / 27 四个目标现在全部有 `SpatialBoundaryRoute`：

- primary：`unesco-sites-navigator`；
- fallback：`unesco-1442-maps-2014`；
- status：`pdf-fallback-active`。

当前 `candidate-boundary-service = 0`。后续若在可联网环境解析出真正的 UNESCO cultural property/buffer Polygon 服务，路线可回切 GIS；在此之前，优先推进 Document 132728 图页提取与配准。

### E. 获取失败被结构化记录

新增 `SpatialAcquisitionAttempt`，当前记录三次实际尝试：

1. Experience item metadata → `blocked-environment / dns-resolution`；
2. Experience item data → `blocked-environment / dns-resolution`；
3. UNESCO 132728 PDF 原文件 → `blocked-environment / content-size-and-dns`。

PDF 的 `Download File` 已确认直连 `https://whc.unesco.org/document/132728`，远程响应长度 **40,574,291 bytes**。web 工具因内容过大拒绝抓取，container 又受 DNS 阻断。它证明“源存在但当前环境无法物化”，不是源缺失。

## 1. 当前官方 Sites Navigator 应用

UNESCO World Heritage Centre 当前 `https://whc.unesco.org/en/wh-gis` 页面中的 **Launch full screen (recommended)** 直接链接：

`https://experience.arcgis.com/experience/4f1652275d1f4656964b64a20a7346d3`

因此 v0.11 将 `unesco-sites-navigator` 的规范 URL 更新为 `4f165...`。v0.10 记录的 `e3ea9ba6b3484c6dbfeeae10031f964e` 作为旧/历史入口保留在说明中，但不再作为当前 canonical URL。

UNESCO 官方页面同时说明：

- Navigator 是 UNESCO 的机构级 GIS；
- 展示经过验证、地理配准的 World Heritage 等 UNESCO designated sites 边界；
- World Heritage polygon 如果尚未出现，可能仍在等待缔约国提交，或处于 UNESCO 审核/调整阶段。

所以“当前官方应用已确认”只能证明平台入口和权威性，**不能证明 1442-025 / 027 / 028 / 029 的公开 REST Polygon 已经可导出**。

## 2. 已排除：公开 `UNESCO_0` Feature Layer

公开 ArcGIS REST：

`https://services7.arcgis.com/iEMmryaM5E3wkdnU/ArcGIS/rest/services/UNESCO/FeatureServer/0`

实际服务元数据：

- Service ItemId：`0c055055666d4c18ac82d5a49a5fab4a`
- Layer：`UNESCO_0 (0)`
- Geometry Type：`esriGeometryPoint`
- Spatial Reference：EPSG:3857 / 102100
- 字段包括：`latitude`、`longitude`、`id_no`、`name_en`、`area_hect` 等
- Data Last Edit：2021-03-16

结论：**明确拒绝作为边界源**。它可以用于站点级点数据核对，但不允许：

- 用点缓冲生成 World Heritage property；
- 用 `area_hect` 反推圆形或其他形状；
- 把 point layer 重新命名为 Navigator boundary layer。

## 3. 实施伙伴披露的 `harmonized sites layer`

UNESCO Sites Navigator 实施伙伴 Mapular 的 2026 案例说明存在：

- 一个 harmonized sites layer；
- 单一 canonical geometry set；
- 输入数据同时包含 points 和 polygons；
- ArcGIS Online + Experience Builder + Dashboards 架构。

这证明当前系统内部确实存在比旧 `UNESCO_0` 点图层更丰富的空间基础，但案例没有公开可验证的 FeatureServer / MapServer URL。因此 v0.11 只登记为：

`implementation-partner + not-publicly-resolved`

不能当作官方矢量来源。

## 4. 当前服务发现结论

| probe | 类型 | 几何 | verdict |
|---|---|---|---|
| `unesco-navigator-current-app` | Experience App | unknown | `confirmed-current-app` |
| `unesco-public-points-2021` | FeatureServer/0 | point | `rejected-boundary-source` |
| `unesco-harmonized-layer-clue` | 架构线索 | mixed | `not-publicly-resolved` |

当前：

- `candidate-boundary-service = 0`
- `vector-ready = 0`

这不是失败，而是一次有效排除：至少已经防止把一个2021年的 Point Feature Layer误当成2025/2026 Navigator 的官方边界服务。

## 5. 下一步

优先继续：

1. 获取 current Experience item `4f165...` 的 ArcGIS item metadata / item data；
2. 提取其 WebMap / WebScene / Experience dataSource 配置；
3. 遍历 operational layers；
4. 对每个服务查询 REST metadata；
5. 只保留 geometry = Polygon / MultiPolygon 的边界候选；
6. 查询 `1442` 及四个 component reference；
7. 分辨 property 与 buffer 是否为不同 layer / 不同 feature / 不同字段；
8. 锁定原始 JSON/GeoJSON、请求 URL、CRS、时间戳与 SHA-256；
9. 与 UNESCO 2014 map atlas 面积和图页交叉验证。

若 Experience item data 不是公开的，应把“公开 REST 路线”明确标成受阻，转回 Document 132728 图页配准路线，而不是猜测隐藏端点。
