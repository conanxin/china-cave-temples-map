# 官方边界资产采集与配准管线

更新：2026-09-12 · v0.14

## 目标

把“知道某份官方地图存在”推进成一个可以持续执行的 GIS 采集流程，同时保持一条不可跨越的边界：**未经定位图页、提取原始图、识别控制点与验证配准质量，不得把官方地图资产升级成可发布 Polygon。**

v0.10 新增 `SpatialMapTarget`，用于管理“某份源资产里的某一张目标地图”的处理状态。源资产负责回答“这是什么文件 / 平台”，目标记录负责回答“我要从它里面提取哪一处遗址的哪张地图，目前做到哪一步”。

## 处理链

### A. 源资产登记

`SpatialSourceAsset`

必须记录：

- 稳定资产 ID；
- 发布机构；
- 官方 URL；
- 资产类型；
- 证据等级；
- 当前处理状态；
- 关联遗址与关联范围；
- 官方编号 / 发布日期（如有）；
- 下一步动作。

来源权威性与处理完成度分开：一个 UNESCO 一级来源 PDF 也可能仍处于 `georeference-needed`。

### B. 目标地图定位

`SpatialMapTarget.pageStatus`

1. `page-location-needed`：知道地图集中存在目标图，但还不知道 PDF 页码 / 图号。
2. `page-located`：已经定位页码 / 图号，但尚未把页图作为独立资产提取。
3. `page-extracted`：目标图页已经提取为独立图像 / PDF 页，可进入配准分析。

定位后补充：

- `pageNumber`
- `pageLabel`
- `mapTitle`
- `scaleText`
- `crsHint`

### C. 配准

`SpatialMapTarget.georeferenceStatus`

1. `not-started`
2. `control-points-needed`
3. `georeferenced`

只有 `georeferenced` 仍不等于最终 Polygon 已可发布。配准成果至少还应记录：

- 原始图页 SHA-256；
- 控制点表；
- 原图坐标 / 目标坐标；
- 使用的 CRS；
- 变换模型；
- RMSE；
- 最大残差；
- 被排除的异常控制点；
- 配准输出资产 SHA-256。

### D. 矢量化与发布

只有在边界确实来自官方地图线或官方 GIS 服务，且来源 / 配准质量可追溯时，才允许：

- 生成 Polygon / MultiPolygon；
- 将对应 `SiteSpatialExtent.geometryStatus` 升级为 `verified`；
- 把 `SpatialSourceAsset.processingStatus` 升级为 `vector-ready`。

## v0.10 UNESCO 1442 目标

UNESCO Document 132728 是 2014 年正式登记的 *Silk Roads: the Routes Network of Chang'an-Tianshan Corridor - maps of inscribed property* 地图资产。项目为国博墙图中四个相关石窟建立独立目标：

| target | 墙图编号 | UNESCO ID | 对应范围 | 页图状态 | 配准状态 |
|---|---:|---|---|---|---|
| `unesco-1442-028-map` | 05 麦积山 | 1442-028 | property + buffer | 待定位图页 | 未开始 |
| `unesco-1442-027-map` | 06 炳灵寺 | 1442-027 | property + buffer | 待定位图页 | 未开始 |
| `unesco-1442-025-map` | 08 克孜尔 | 1442-025 | property + buffer | 待定位图页 | 未开始 |
| `unesco-1442-029-map` | 27 大佛寺 | 1442-029 | property + buffer | 待定位图页 | 未开始 |

官方文档页：
https://whc.unesco.org/en/documents/132728

UNESCO geographical data：
https://whc.unesco.org/en/list/1442/maps

## v0.12 当前路线决策

四个 UNESCO 组成遗产（1442-025 / 027 / 028 / 029）目前统一处于：

`GIS primary unresolved → official PDF fallback active`

原因不是 UNESCO 没有边界，而是当前尚未取得**公开可验证、适用于文化遗产组成部分的 Polygon/MultiPolygon REST 服务**。已发现的公开服务分别存在语义或几何问题：

- UNESCO_0：Point；
- EEA Maratlas：Point；
- WWF SIGHT：Polygon，但只覆盖 Natural and Mixed World Heritage Sites；
- harmonized sites layer：架构线索存在，但公开 REST URL 尚未解析。

因此 PDF 路线在 v0.12 被正式启用，而不是继续无限等待 ArcGIS Experience 内部配置。

### UNESCO Document 132728 原文件获取状态

- 元数据页：`https://whc.unesco.org/en/documents/132728`
- Download File 直链：`https://whc.unesco.org/document/132728`
- 远程观察大小：**40,574,291 bytes**
- 状态：`download-blocked-environment`

当前 web 工具拒绝抓取大内容，container 网络又发生 DNS 失败，因此尚未形成本地 PDF、SHA-256 或目标页截图。下次在允许获取 40MB 文件的环境中，第一步必须是：

1. 物化原始 PDF；
2. 计算 SHA-256；
3. 记录总页数；
4. 定位 1442-025 / 027 / 028 / 029；
5. 再进入控制点、CRS 与配准流程。

### 环境错误不会改变数据语义

所有实际尝试写入 `src/data/spatialAcquisitionAttempts.ts`。`blocked-environment` 与 `not-found` 严格区分：DNS/内容大小阻断不能被解释成“源不存在”。

## 第二条官方边界路线：UNESCO Sites Navigator

v0.10 同时登记 UNESCO Sites Navigator：

https://experience.arcgis.com/experience/4f1652275d1f4656964b64a20a7346d3

UNESCO 官方说明该平台用于可视化已经核验、地理配准的 UNESCO 遗产边界；同时明确，尚未展示的 World Heritage polygon 可能仍在等待缔约国提交或 UNESCO 审核 / 调整。

因此源资产状态为：

`service-discovery-needed`

下一步不是“从屏幕截图描边”，而是：

1. 在 Navigator 中逐一确认 1442-025 / 027 / 028 / 029 是否有 property / buffer polygon；
2. 识别平台实际使用的官方 FeatureServer / MapServer / vector tile service；
3. 核对字段中的 World Heritage ID 与组成遗产 ID；
4. 验证 geometry 类型确实为 Polygon / MultiPolygon；
5. 导出原始官方 geometry 并保存请求 URL、响应 SHA-256、CRS 与时间戳；
6. 才能进入 `vector-ready`。

### v0.11 服务发现审计结果

UNESCO World Heritage Centre 当前 Sites Navigator 页面已把 canonical Experience Builder 入口更新为 `4f1652275d1f4656964b64a20a7346d3`。项目新增 `SpatialServiceProbe`，分别记录：

1. 当前官方 Experience 应用：已确认，但几何端点未知；
2. `UNESCO_0` FeatureServer/0：REST metadata 为 `esriGeometryPoint`，已排除；
3. 实施伙伴披露的 harmonized sites layer：确认存在混合 geometry 的 canonical layer 架构，但公开服务 URL 尚未解析。

因此 GIS 路线当前仍停留在 **service discovery**，`candidate-boundary-service = 0`。完整审计见 `docs/service-discovery-audit.md`。

下一轮 ArcGIS 路线必须优先取得 Experience item data / WebMap dataSource，再按 geometry type 逐层筛选，不能根据服务名称猜测。

### 已排除的假捷径

公开 ArcGIS 服务中存在名为 `UNESCO_0` 的图层，但其 Geometry Type 明确为 `esriGeometryPoint`。它只能作为站点级点信息线索，不能作为世界遗产边界 Polygon 来源。因此 v0.10 明确不使用这个点图层生成边界。

## 下一阶段闭环标准

对于任意一个世界遗产组成点，达到以下任一条件才算“边界链闭合”：

### 官方矢量路径

`Sites Navigator / WH GIS → 官方 Polygon 服务 → 原始响应锁定 → CRS 核验 → geometry 写入 → vector-ready`

### 官方地图配准路径

`Document 132728 → 目标页定位 → 页图提取 + SHA-256 → 控制点 → 配准报告 → 边界矢量化 → QA → vector-ready`

如果两条路径都能获得结果，应进行互相叠加比较，报告面积差、Hausdorff / 顶点偏差或至少边界可视 QA；不得静默选择其中一套。

## v0.13：官方 PDF 自动化提取层

v0.13 新增 `scripts/unesco_pdf_pipeline.py`，把原先文档中的 PDF 路线变为实际可执行工具：

1. `fetch`：支持 `.part` + HTTP Range 的断点续传，完成后核验期望大小并输出 SHA-256；
2. `inspect`：锁定 bytes / SHA-256 / page count / PDF metadata；
3. `locate`：扫描 PDF 文本层定位 1442-025/027/028/029；
4. `contact`：当 atlas 为 image-only 时生成带 PDF 页码的低分辨率 contact sheet；
5. `extract`：把确认目标页提取成单页 PDF + PNG，并为两种输出分别计算 SHA-256。

当前运行环境仍无法解析 `whc.unesco.org`，因此工具已经过本地合成 PDF 和本地 Range HTTP server 测试，但 Document 132728 原文件尚未物化。下一次进入有外网 DNS 的环境时，不需要重新设计流程，直接运行 `docs/unesco-132728-extraction.md` 中的命令即可。

同时新增 `SpatialDocumentLocator`，为约 1,018 MB 的 UNESCO Nomination file 1442 保存可追溯页码窗；它与 Document 132728 的未知页码严格分开。

## v0.14：1GB Nomination file 的 HTTP Range 定向路线

完整 nomination PDF 的远程大小为 **1,018,487,777 bytes**。v0.14 不再把“必须完整下载 1GB”作为前置条件，而新增：

`remote PDF → probe byte-range → seekable HTTPRangeReader → pypdf 定向解析 → 单页 PDF/PNG + SHA-256`

优先目标是 `1442-028 Maijishan` 管理规划中的 **p.4178–4180**。该页码是二手学术引用给出的定位线索，抽出后仍需与原卷宗章节标题和地图图题核对。

若服务器不支持 Range，脚本明确失败并回退 full-download；若读取对象超过 `max-fetch-bytes`，也主动停止，避免无意拉取整卷。

详见 `docs/unesco-1442-range-extraction.md`。
