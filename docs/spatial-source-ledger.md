# 空间证据来源台账

更新：2026-09-12 · v0.14

本文件记录每一类空间信息从原始来源进入地图数据层的路径。目标不是“尽量多画边界”，而是让每一个点、线、面都能够回答：**来源是谁、原始坐标系是什么、经过什么推导、为什么可以/不可以上图。**

## 证据等级

- `official-primary`：政府、文物主管部门、联合国教科文组织世界遗产中心等直接发布的一手资料。
- `institutional-primary`：遗址保护机构、考古研究机构等直接发布的本体资料。
- `published-secondary`：可追溯的公开汇编、学术二手资料或开放知识库；只能在明确标识的研究层使用，不可冒充法定边界。

## 推导方式

- `official-vector`：官方矢量数据直接转换/发布。
- `official-coordinates`：官方坐标或官方代表坐标，经确定性坐标系转换后使用。
- `georeferenced-official-map`：官方图纸存在足够控制点，经配准后矢量化。当前尚无记录达到此级。
- `published-bounds`：公开资料给出经纬上下限，项目只生成可复算的外接范围。
- `text-only`：只有文字四至、面积、制度或范围存在性证据；不得渲染 Polygon。

## v0.12 GIS 排除审计与 PDF 回退

本阶段继续把“来源权威性”和“技术可获取性”分开。

### Sites Navigator

UNESCO 当前 Experience 仍是规范 GIS 入口，但本环境无法直接读取 ArcGIS item metadata / item data：两次实际尝试均因 `www.arcgis.com` DNS 解析失败而标记 `blocked-environment`。这不是 item 不存在的证据。

### 两个公开服务的排除结论

- WWF SIGHT World Heritage MapServer：`esriGeometryPolygon`，但只覆盖 **Natural and Mixed** 世界遗产，因此对四个文化石窟是 context-only；
- EEA Maratlas layer 26：`esriGeometryPoint`，不能作为 Property / Buffer 边界。

两者均保存为独立源资产与 service probe，目的是让“为什么不用它”同样可以追溯。

### 2014 UNESCO 官方地图 PDF

`Download File` 直链已经确认：`https://whc.unesco.org/document/132728`；远程长度 **40,574,291 bytes**。当前工具环境无法把文件落盘：web 内容上限和 container DNS 共同阻断。因此资产继续 `georeference-needed`，retrieval 为 `download-blocked-environment`。

### 路线状态

05 / 06 / 08 / 27 均建立 `SpatialBoundaryRoute`，状态 `pdf-fallback-active`。只有当未来发现适用的官方 Polygon 服务，或成功配准官方地图 PDF 后，才允许推进到 `vector-ready`。

## v0.11 Sites Navigator 服务发现结论

UNESCO World Heritage Centre 当前 `wh-gis` 页面确认 Sites Navigator 是官方机构级 GIS，并明确指出其提供 authoritative spatial data；当前 Launch full screen 入口为 Experience `4f1652275d1f4656964b64a20a7346d3`。

本阶段没有拿到四个 Silk Roads 石窟组成遗产的公开 Polygon REST 端点，但完成三个关键技术判定：

- **当前应用已确认**：`4f165...` 为 UNESCO 当前页面直接链接的 Experience；
- **错误端点已排除**：公开 `UNESCO_0` Feature Layer 的 REST metadata 是 `esriGeometryPoint`，不能作为 property / buffer；
- **系统内部丰富几何存在的线索**：实施伙伴案例说明有一个 harmonized sites layer，把 point / polygon 输入统一到 canonical layer；但没有公开 REST URL，所以只记录为 discovery clue。

因此 `unesco-sites-navigator` 继续保持 `service-discovery-needed`，不能推进为 `vector-ready`。完整证据见 `docs/service-discovery-audit.md`。

## v0.10 UNESCO 边界获取双路线

v0.10 没有新增 Polygon，而是把真正获取官方世界遗产边界的路径拆成两条可审计路线。

### 路线 A：2014 官方 maps of inscribed property

UNESCO `Document 132728` 继续作为一级地图源。官方页面确认：

- 标题：*Silk Roads: the Routes Network of Chang'an-Tianshan Corridor - maps of inscribed property*；
- 日期：2014-06-25；
- Source：Nomination。

为 05 / 06 / 08 / 27 分别建立 `SpatialMapTarget`。目前仍没有本地 PDF 副本和页码，因此四个目标都保持 `page-location-needed`，配准保持 `not-started`。

只有实际完成“目标页定位 → 页图提取 → 文件哈希 → 控制点 → RMSE / 残差 → 边界矢量 QA”后，才允许把对应世界遗产范围从 `text-only` 推进到 verified geometry。

### 路线 B：UNESCO Sites Navigator

UNESCO 官方称 Sites Navigator 是其机构级 GIS，显示已核验、地理配准的 World Heritage 等 UNESCO 指定地边界，并提供 authoritative spatial data。官方同时注明：尚未展示的 World Heritage polygon 可能在等待缔约国提交或仍处于 UNESCO 审核 / 调整阶段。

因此项目登记：

- `unesco-sites-navigator`
- type = `official-gis-platform`
- processingStatus = `service-discovery-needed`

当前尚未证明 1442-025 / 027 / 028 / 029 四个组成遗产有公开可直接导出的 Polygon 服务。

### 已排除的公开 ArcGIS 点图层

发现一个公开 ArcGIS `UNESCO_0` Feature Layer。服务元数据明确显示 `Geometry Type: esriGeometryPoint`，字段包括 latitude / longitude / id_no / name_en / area_hect 等。它不是 polygon 边界服务，因此不作为世界遗产 property / buffer geometry 来源，也不会被标成 `vector-ready`。

来源：
- https://whc.unesco.org/en/documents/132728
- https://whc.unesco.org/en/list/1442/maps
- https://www.unesco.org/en/lists-designations/site-navigator
- https://whc.unesco.org/en/wh-gis
- https://services7.arcgis.com/iEMmryaM5E3wkdnU/ArcGIS/rest/services/UNESCO/FeatureServer/0

## v0.9 官方源资产注册与 05 / 27 世界遗产证据

### UNESCO 1442 官方地图资产

本阶段把“范围证据”和“承载证据的源文件/网页”分开建模。新增 `src/data/spatialSourceAssets.ts`，其中最重要的新资产为：

- `unesco-1442-maps-2014`
  - 发布者：UNESCO World Heritage Centre
  - 标题：*Silk Roads: the Routes Network of Chang'an-Tianshan Corridor - maps of inscribed property*
  - 官方文档：`Document 132728`
  - 日期：2014-06-25
  - Source：Nomination
  - 远程文件观察大小：40,574,291 bytes（约 38.7 MiB / 40.6 MB 十进制）
  - 当前状态：`georeference-needed`
  - 关联展墙项目：05 麦积山、06 炳灵寺、08 克孜尔、27 大佛寺
  - 下一步：提取对应图页，记录比例尺/坐标格网/控制点；只有配准质量满足要求时才产生 `georeferenced-official-map` 几何。

UNESCO 文档详情页明确给出标题、日期与 `Download File`，但当前工作环境无法直接处理该 40MB 级远程 PDF，因此这里只登记源资产，**没有把网页缩略图、面积或代表点猜成边界**。

同时登记：

- `unesco-1442-geodata`：UNESCO 1442 Maps / Geographical data 页面。该页列出33个组成遗产的官方代表坐标、Property 面积与 Buffer Zone 面积。状态为 `text-extracted`。
- `shandong-2022-protection-boundaries`：山东国保保护范围文件。
- `xinjiang-kizil-decree-1999`：克孜尔法定“两线”法规网页。
- `spp-kumtura-case-2024`：库木吐喇保护行政公益诉讼典型案例。

### 05 麦积山石窟

UNESCO 组成遗产 `1442-028 Maijishan Cave-Temple Complex`：

- 官方代表坐标：N34°21′03″, E106°00′10″（WGS84）。
- 确定性转换 GCJ-02：约 `106.006807, 34.349391`。
- 现有高德本体点：`106.008075, 34.350764`，两者约相距192米。
- 遗产区：**483.71 ha**。
- 缓冲区：**1,259.28 ha**。
- 当前几何状态：两层均 `text-only`。

保留高德本体 Marker，不以 UNESCO 代表点覆盖它；两套证据分别表达“高德本体 POI”和“UNESCO 组成遗产代表坐标”。

### 27 大佛寺石窟

UNESCO 组成遗产 `1442-029 Bin County Cave Temple`：

- 官方代表坐标：N35°04′24″, E107°59′32″（WGS84）。
- 确定性转换 GCJ-02：约 `107.996985, 35.072547`。
- 现有高德本体点：`107.996294, 35.072512`，两者约相距63米。
- 遗产区：**34.68 ha**。
- 缓冲区：**587.26 ha**。
- 当前几何状态：两层均 `text-only`。

### 源资产完整性约束

1. 每个 `SpatialSourceAsset.id` 必须唯一。
2. `linkedSiteIds` 必须非空。
3. `linkedExtentIds` 的每一个 ID 必须真实存在于关联遗址的 `spatialExtents`。
4. `official-map-pdf` 在没有形成可用配准/矢量成果前不得标记 `vector-ready`。
5. `observedSizeBytes` 只是远程资产观察元数据，不等于文件已经纳入仓库或完成哈希锁定。
6. 未来若成功下载 PDF，应新增本地资产 SHA-256、页码定位与配准报告，而不是覆盖远程登记记录。

来源：
- https://whc.unesco.org/en/documents/132728
- https://whc.unesco.org/en/list/1442/maps

## v0.8 新增/升级记录

### 06 炳灵寺石窟

**代表点**

- 一级来源：UNESCO World Heritage Centre，Silk Roads 组成遗产 `1442-027 Bingling Cave-Temple Complex`。
- UNESCO 代表坐标：N35°48′28.4″, E103°02′48.5″（WGS84）。
- 项目转换：WGS84 → GCJ-02 → `103.049050, 35.807717`。
- 语义：世界遗产组成遗产的代表坐标，只用于遗址群级定位，不表示洞窟入口、保护范围几何中心或边界。

**世界遗产范围证据**

- 遗产区：132.62 ha。
- 缓冲区：2,044.37 ha。
- UNESCO 当前网页提供面积与代表坐标；未在本阶段取得可直接验证、可程序读取的官方边界矢量，因此两者均为 `text-only`。

**国内保护范围**

- 甘肃省人大 2021 年修订条例明确：保护范围分重点保护区和一般保护区，由省政府划定公布；保护范围外可划建设控制地带。
- 条例正文没有提供可复算坐标，因此只记录法定制度证据，不绘边界。

来源：
- https://whc.unesco.org/en/list/1442/maps
- https://www.gsrdw.gov.cn/html/2021/lfdt_0929/20218.html

### 08 克孜尔千佛洞

**代表点**

- 一级来源：UNESCO World Heritage Centre，组成遗产 `1442-025 Kizil Cave-Temple Complex`。
- UNESCO 代表坐标：N41°47′02″, E82°30′20″（WGS84）。
- 项目转换：WGS84 → GCJ-02 → `82.508386, 41.785148`。
- 新疆文化和旅游厅 2019 年公开答复独立确认：克孜尔有4个石窟区、369个洞窟，因此父级语义改为 `group`。

**国内法定两线**

1999 年自治区人民政府令第88号直接给出文字四至：

- 保护范围：东至伊泻克沟洞窟以东1500米，南以渭干河为界，西至第一号洞窟以西1500米，北至泪泉以北1500米。
- 建设控制地带：南至渭干河对岸雀尔塔格山北麓，东、西、北各向保护范围外延1500米。

这些是强一手证据，但含有自然地形与洞窟参照物；在没有官方矢量/测量控制点前，不能凭卫星图主观描边，所以继续 `text-only`。

**世界遗产范围证据**

- 遗产区：1,798.48 ha。
- 缓冲区：9,849.17 ha。
- 当前只保存 UNESCO 官方面积/代表坐标证据，不反推边界形状。

来源：
- https://whc.unesco.org/en/list/1442/maps
- https://www.xinjiang.gov.cn/xinjiang/gzk/202112/ea65632e645544fdba2332872387ea72.shtml
- https://wlt.xinjiang.gov.cn/wlt/rdxyta/201910/c7bd5de52867433cb37f682eba1c8973.shtml

### 09 库木吐喇千佛洞

- 新疆文化和旅游厅称其为仅次于克孜尔的第二大龟兹石窟群。
- 最高检 2024 年典型案例明确：2009 年新疆公布库木吐喇石窟寺保护规划；“两线”范围跨越两县；2022 年8月相关文物保护范围依法办理土地权属证书。
- 最高检公开页面没有提供边界坐标/矢量，因此保护范围、建设控制地带均建成 `text-only` 记录。
- 本阶段仍不把 Wikidata/OSM 的二手点直接晋升为父级 `verified`。下一步优先寻找文物部门/规划附件中的代表坐标或官方 GIS。

来源：
- https://www.spp.gov.cn/xwfbh/wsfbh/202402/t20240228_645279.shtml
- https://wlt.xinjiang.gov.cn/wlt/rdxyta/201910/c7bd5de52867433cb37f682eba1c8973.shtml

## v0.7 既有记录的来源等级补齐

### 26 千佛崖造像

两条法定范围文字均升级为显式来源元数据：

- `evidenceTier: official-primary`
- `derivation: text-only`
- `sourceDate: 2022`

由于正式文件注明“具体范围以图纸为准”，继续不画 Polygon。

### 31 森木塞姆 / 46 克孜尔尕哈

两个研究型经纬外接范围显式标记：

- `evidenceTier: published-secondary`
- `derivation: published-bounds`
- `sourceCrs: WGS84`
- `targetCrs: GCJ-02`

这两块 Polygon 可以显示，但永远不会在 UI 中称作“法定保护范围”。后续获取一级调查/正式 GIS 时，应替换而不是叠加成同义边界。

## 发布规则

1. **代表坐标不是边界中心**：UNESCO 代表坐标只作为定位证据。
2. **面积不能反推形状**：仅知道 ha 数量时禁止画圆、方框或缓冲圈。
3. **文字四至不是矢量**：没有可核验控制点时不按卫星影像自行描摹。
4. **世界遗产边界 ≠ 国保两线**：即使空间上重叠，也必须分图层保存。
5. **二手研究范围 ≠ 一级调查**：UI 必须显示证据等级。
6. **所有 verified 几何最终统一到 GCJ-02**；原始 CRS 与转换方法必须留痕。


## v0.14 1GB Nomination PDF 的远程定向提取证据链

UNESCO Nomination file 1442 的直链为：

`https://whc.unesco.org/uploads/nominations/1442.pdf`

web 抓取响应明确暴露远程对象长度 **1,018,487,777 bytes**。由于当前 container 对 `whc.unesco.org` 仍发生 DNS 解析失败，v0.14 无法在本环境实测远端 `Accept-Ranges`；因此 `SpatialPdfExtractionPlan.rangeCapability` 只能记录为 `blocked-environment`，不能写成 `range-supported`。

v0.14 的技术推进是把“需要 1GB 文件”改造成可执行的最小读取路线：

`HEAD / 1KiB Range probe → seekable HTTPRangeReader → pypdf random access → 目标单页 PDF/PNG → SHA-256`

本地 Range HTTP server 测试验证了：

- probe 能读取大小和 Range 能力；
- 远程页抽取只发送 Range GET，不发送 full GET；
- 输出单页 PDF 可由 PyMuPDF 正常重新打开；
- 连续页段可写成 `4178-4180`；
- `max-fetch-bytes` 会限制远端总读取量，避免脚本静默拉取整卷。

### 页码来源

中国丝绸博物馆 IIDOS 对原始 nomination PDF 建立了页码索引，形成 9 条 `SpatialDocumentLocator`。`scripts/unesco_1442_targets.json` 与这些 locator 由自动测试锁步。

麦积山 `p.4178–4180` 的优先级更高，因为 UCL 博士论文明确引用这些页来讨论三层 buffer zone，并展示 Figure 33。该页码仍属于 `published-secondary` 定位线索；抽页后必须回到原卷宗页面本身核验图题和章节。

### 本阶段实际远端尝试

`python scripts/unesco_pdf_pipeline.py probe-remote ...` 在当前 container 失败于 DNS：

`socket.gaierror: [Errno -3] Temporary failure in name resolution`

这条记录保存为 `unesco-1442-nomination-range-probe-v014`。它证明的是**当前环境无法探测**，不是 UNESCO 不支持 HTTP Range。

## v0.13 原始 PDF 获取与申遗卷宗页码线索

### UNESCO Document 132728

v0.13 增加可执行下载/检查/定位/提取流水线，并在当前环境实际重新运行官方 PDF 下载命令。结果仍是 `whc.unesco.org` DNS 解析失败；与此同时 web 侧已经再次确认远程文件存在且长度为 **40,574,291 bytes**。因此新增独立获取尝试 `unesco-132728-pdf-download-v013`，状态保持 `blocked-environment`。

此阶段没有创建空 PDF、伪 SHA-256 或虚构页数。

### UNESCO Nomination file 1442

新增官方申遗卷宗资产：

- direct file: `https://whc.unesco.org/uploads/nominations/1442.pdf`
- UNESCO documents 页面报告约 **1,018 MB**
- 当前不在受限环境中尝试完整物化

中国丝绸博物馆 IIDOS 目录提供了四个目标组成遗产的 annex / management-plan 页码起点；通过相邻条目起点确定非重叠页窗。另有 UCL 博士论文将麦积山缓冲区图具体引用到卷宗 pp.4178–4180。项目把前者标成 `institutional-primary`，后者标成 `published-secondary`。

这些页码都指向 **Nomination file 1442**，不能复制为 Document 132728 的 PDF 页码。
