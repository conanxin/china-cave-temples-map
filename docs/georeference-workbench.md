# v0.17 石窟地图配准工作台

更新：2026-09-13

## 目的

当 UNESCO 132728、Nomination file 1442 或国内保护规划中的正式地图页被提取成 PNG/JPEG 后，不再需要临时写脚本完成配准。网页中的 **「配准工作台」** 可以在浏览器本地完成控制点、变换拟合、残差 QA、边界采点和草稿 GeoJSON 导出。

工作台的结果永远是：

> `draft-unreviewed`

它不会自动写回 `src/data/sites.ts`，不会自动把 `text-only` 范围升级为 `verified Polygon`。

## 入口

主页面顶部点击 **「配准工作台」**。工作台继承当前选中的遗址；如果该遗址存在 `SpatialMapTarget`，会自动列出对应 UNESCO 地图目标。

图片通过浏览器 `URL.createObjectURL()` 本地加载，不上传到服务器，也不会写入 localStorage。会话只保存图片文件名和像素尺寸，因此重新打开会话时需要重新选择原始图片。

## 推荐流程

### 1. 确认地图身份

在放控制点之前先确认：

- PDF 页码与 locator 是否一致；
- 图题对应正确组成遗产；
- 红线 / 绿线到底是 property、buffer、国内保护范围还是其他分区；
- 比例尺、北箭头、坐标格网、CRS 提示是否存在；
- 图页 SHA-256 已记录。

### 2. 放置控制点

切换到 **控制点模式**，点击地图页中的一个明确位置，再填写它对应的 WGS84 经度/纬度。

优先级建议：

1. 官方地图明确打印的经纬格网交点；
2. 有官方 GIS / 高可信底图坐标的稳定地物交点；
3. 长期不变的山口、河流交汇、桥位、道路交叉等；
4. 避免用模糊山脊、手绘文字中心、景区入口或推测边界拐点作为控制点。

控制点应尽量覆盖整张地图：四角、边缘和中部都有分布，不要集中在一个小区域。

## 变换模型

### Affine

最少 3 点。适用于扫描/导出时主要存在平移、旋转、缩放、剪切的地图。

模型：

```text
lng = a*x + b*y + c
lat = d*x + e*y + f
```

实际研究建议至少 4–6 个分布良好的控制点。

### Projective

最少 4 点。用于拍摄透视、图页四边不平行等情况。

```text
lng = (h11*x + h12*y + h13) / (h31*x + h32*y + 1)
lat = (h21*x + h22*y + h23) / (h31*x + h32*y + 1)
```

实际研究建议至少 6–10 个控制点。恰好 4 点时数学上可以得到近乎零的控制点残差，但这**不代表地图其他位置同样准确**。

## QA

工作台报告：

- 每个控制点的预测坐标；
- 每点 Haversine 残差（米）；
- RMSE（米）；
- 最大残差（米）；
- 拟合参数。

默认提示阈值：

| Verdict | RMSE | 最大残差 |
|---|---:|---:|
| PASS | ≤25m | ≤50m |
| REVIEW | ≤75m | ≤150m |
| FAIL | 其他 | 其他 |

阈值可在工作台直接修改并随会话保存。

v0.16 已增加独立 `check` 点、LOO、控制点空间分布评分和官方面积比较。v0.17 又增加高德现代底图取点 provenance 与 canonical patch 人工晋升。训练内 RMSE 仍然保留，但不再作为单一可信度依据。详见 `docs/georeference-qa-v016.md` 和 `docs/canonical-extent-promotion.md`。

## 边界采点

配准完成后切换 **边界采点模式**，沿官方 property / buffer / 保护范围线依次点击。

工作台在原图上绘制蓝灰色虚线草稿，并保留像素坐标。至少 3 个不同点后可以：

1. 用当前变换转成 WGS84 Polygon；
2. 自动闭合环；
3. 同时生成 GCJ-02 Polygon；
4. 分别下载 `.wgs84.geojson` 和 `.gcj02.geojson`。

导出的 Feature properties 包括：

- georeferenceSessionId
- mapTargetId
- siteId
- transform method
- RMSE / 最大残差
- 独立 Holdout QA
- Leave-one-out QA
- 控制点空间分布评分
- 官方面积与计算面积差异（如可用）
- QA verdict
- `reviewStatus: draft-unreviewed`

## 会话

会话 schema 版本：`1`。

保存内容：

- target / site
- 图片名称和像素尺寸
- transform method
- 控制点（含 `fit / check` 角色）
- `boundaryExtentId`（当前数字化边界对应的空间证据）
- 边界像素点
- QA 阈值
- createdAt / updatedAt

localStorage key：

```text
china-cave-georef-session:<session-id>
```

支持导出/导入 JSON。导入时会检查 schema、坐标合法性、图片尺寸以及当前遗址是否匹配，防止把一个遗址的配准控制点误导入另一个遗址。

## v0.17 高德现代底图取点

控制点模式下先点击原地图 pixel，然后点击 **“从高德取点”**。内嵌高德地图返回 GCJ-02，系统反算为 WGS84 后填入 pending control。

控制点表会显示来源：

- **高德**：保存原始 GCJ-02 点击点；
- **手工**：直接输入/后来人工修改的 WGS84。

高德点仍然可以选择 `fit` 或 `check`；更推荐把一些稳定且容易在现代底图确认的地物留作独立 check points。

## v0.17 Canonical 晋升

当“进入人工审核”达到 `STRONG`、已选择未 verified 的 extent 且已描边后，边界面板允许生成 canonical patch 草稿。浏览器不会自动写入数据；必须输入 `APPROVE <site-code> <extent-id>`，下载 human-approved patch，再由 `scripts/apply_reviewed_extent_patch.py` 写入 reviewed registry。

详见 `docs/canonical-extent-promotion.md`。

## 晋升为 canonical Polygon 前的人工门槛

工作台导出后仍需要：

1. 核对地图页来源与 SHA-256；
2. 检查控制点空间分布；
3. 检查 RMSE / 最大残差；
4. 在现代底图上检查边界位置；
5. 与官方公布面积进行数量级比较；
6. 区分 Property / Buffer / 国内保护范围 / 建设控制地带；
7. 保存配准会话 JSON 和原始地图页；
8. 人工审查通过后生成 `human-approved` patch；
9. 运行 `scripts/apply_reviewed_extent_patch.py` 写入 reviewed registry；
10. runtime merge 才把 GCJ-02 geometry 放入 `SiteSpatialExtent.geometry`；
11. `derivation` 标记为 `georeferenced-official-map`，并保留 source asset / map target / session / patch provenance。

## v0.17 已实现

- 独立 `fit / check` 控制点；
- Holdout QA；
- Leave-one-out residual；
- 控制点凸包与空间分布评分；
- 官方面积 vs digitized polygon 面积校验；
- 进入人工审核的保守 readiness 建议；
- 高德现代底图点击 → GCJ-02 原始 provenance → WGS84 控制点；
- STRONG session → draft canonical patch → 精确批准令牌 → human-approved patch；
- reviewed patch registry 与 runtime canonical merge。

后续候选：在高德与原图之间做同步十字准星/联动缩放；canonical patch 增加独立 reviewer 字段与签名/哈希；晋升后自动生成边界差异 QA 报告。


## v0.18 双地图联动视觉验收

v0.18 在原有历史图配准面板旁加入常驻高德 QA 地图。控制点的 `selectedControlId` 在历史图、现代地图和表格间共享；右侧地图只使用 GCJ-02 显示坐标，并保留控制点原始来源语义：高德点击点复用 `groundSourceOriginal`，手工 WGS84 点才进行显示转换。

拟合后，`boundaryPixels` 会先通过当前 Affine / Projective 模型变换到 WGS84，再转换到 GCJ-02 实时叠加到高德地图。该 Polygon 只用于视觉检查，透明度可调，**不会写回 canonical geometry**。真正晋升仍须经过 v0.17 的 STRONG QA + 人工批准令牌 + CLI registry 流程。

视觉吻合只能帮助发现整体平移、旋转、透视或局部错位，不能替代 Holdout、LOO、面积核验和官方来源审计。

## v0.19 误差向量与模型对照

工作台现在可以在现代高德地图显示 check point 误差向量，并同时对照 Affine / Projective 边界。诊断结果会进入 draft GeoJSON provenance，但不会改变 `draft-unreviewed` 状态，也不会自动切换模型或自动晋升 canonical geometry。详见 `docs/georeference-diagnostics-v019.md`。

## v0.20 控制点 Influence / Leverage

v0.20 对每个 `fit` 点做一次“拿掉该点 → 用剩余 fit points 重拟合 → 用原有 check points 重新评估”的敏感性分析。

只有独立 Holdout 的显著改善/恶化用于 `suspect / supportive / neutral` 分类；模型边界因该点被移除产生的 mean/max shift 作为 leverage 单独报告。

`SUSPECT · 复查` 的含义是：**这个点值得优先回到历史图与现代高德底图重新确认**，不是系统已经证明它错误。界面不会提供自动删除。

Influence 诊断结果会写进 draft GeoJSON 与 canonical patch QA provenance，但不会改变 v0.16 readiness 规则，也不会绕过 v0.17 的人工批准令牌。详见 `docs/georeference-influence-v020.md`。


## v0.22 Huber / Tukey IRLS 连续权重诊断

v0.22 在普通最小二乘与 v0.21 RANSAC 之外加入连续权重稳健模型。Huber / Tukey 只对 `fit` 控制点计算权重并重拟合，同一批 independent `check` points 用于比较泛化表现。

工作台显示：

- Huber / Tukey 每个控制点权重；
- 两套 IRLS Holdout RMSE；
- LS ↔ Huber / Tukey 边界分离；
- Huber 橙色实线 / Tukey 蓝色虚线边界；
- 三证据一致性高优先复查提示。

IRLS `weight` 不是正确概率，`severe` 也不是错误判决。工作台没有“自动删除”或“采用 IRLS 模型”动作。所有导出仍为 `draft-unreviewed`，canonical 晋升仍走 v0.17 人工批准流程。详见 `docs/georeference-irls-v022.md`。

## v0.23 局部形变场与跨模型持久性诊断

v0.23 在既有全局 RMSE、Holdout、LOO、误差向量、Influence、RANSAC 与 IRLS 之上增加 **spatially varying residuals**。诊断严格只使用独立 `check` points：先计算“模型预测位置 → check 真值”的东/北米制残差，再拟合一阶残差向量场，并在去除整体平移后生成 4×4 IDW 研究热区。

工作台新增 **「局部形变场」**开关；热区只显示探索性 residual surface，不等于地图纸张真实连续形变，也不是保护范围或空间统计聚类结果。右侧 QA 会报告 `stable / structured-gradient / localized-hotspot / irregular`、线性场解释率、场变化量、场拟合后 RMS、热点区域及归一化图幅上的 divergence / rotation / shear。

同一套 check points 还会分别评估 Affine、Projective、RANSAC、Huber、Tukey：Projective 若明显消除 Affine 的空间残差，优先提示模型选择；Robust/IRLS 若消除 LS 热点，优先提示控制点复查；只有局部异常在多个全局/稳健模型中持续出现，才提示 **consider-piecewise**。该提示不会自动创建分区模型，也不会改变 canonical 晋升状态。

完整方法、启发式阈值与限制见 `docs/georeference-local-distortion-v023.md`。

## v0.24 Piecewise / Segmented Registration 候选模拟

v0.24 在 v0.23 的局部形变持续性诊断之后加入 2×1、1×2、2×2 三种局部 Affine 候选。每个分区都必须有至少3个 fit points 和1个 independent check point，并同时评估 Piecewise Holdout、seam continuity 与 orientation / fold-over。候选只用于研究判断，不会自动采用。详见 `docs/georeference-piecewise-v024.md`。

## v0.25 Piecewise 双地图视觉预演

v0.25 把 v0.24 候选放回双地图空间中检查。历史图显示当前候选分区与具体 fold-over 风险区；现代高德地图显示 Piecewise 边界、各分区投影轮廓以及相邻局部模型在同一 seam pixel 上的预测跳变线段。

工作台同时报告当前全局模型与 Piecewise 边界的 mean/max divergence。候选表中的“预演”按钮、历史图与高德地图共享同一布局。任何 Piecewise visual QA 结果都不会自动改变 `session.method`、`assessReviewReadiness()` 或 canonical patch 状态。

详见 `docs/georeference-piecewise-preview-v025.md`。

## v0.26 Spatial block cross-validation 与复杂度约束

v0.26 在 Piecewise candidate / visual preview 之后增加 3×2 图幅空间留块交叉验证。每个非空空间块整体移出训练集，其余 fit points 重拟合 Global Affine、Global Projective、2×1、1×2、2×2 Piecewise，再预测被留出的点。一个候选只有覆盖全部 fit points、所有 fold 均可重拟合时才视为可完整验证。

工作台同时显示 raw Spatial-CV RMSE、按参数量轻度上调后的 adjusted RMSE、fold coverage、fold RMSE 标准差、worst fold、最低参数支持度以及真正 independent check RMSE。复杂度 surcharge 固定为 `5 × log2(parameterCount / 6)%`，只是项目研究启发式，不是 AIC/BIC 或法定测绘标准。

`piecewise-supported` 只意味着分区模型的收益在空间留块后仍存在，并通过 seam/fold-over、稳定性、参数冗余和 independent checks 等门槛；它不会改变 `session.method`、canonical readiness 或人工批准流程。详见 `docs/georeference-spatial-cv-v026.md`。

## v0.27 Monte Carlo / Bootstrap 不确定性传播

v0.27 在 v0.26 空间交叉验证之后增加控制点误差传播。默认只扰动 fit points（1.5 px 图像选点 σ + 10 m 地面位置 σ），固定 independent check points 作为外部真值，并以确定性 seed 重复 200 次拟合。

每次 trial 同时比较 Global Affine、Global Projective、2×1、1×2、2×2，并继续使用 v0.26 的 complexity surcharge。工作台显示 win rate、平均 Holdout、adjusted score，以及当前 session.method 边界顶点的 P50/P95/max 位移。高德地图可以显示每个边界顶点的 P95 圆和最不稳定边界段。

这些 P95 是当前模拟误差假设下的经验分位数，不是正式测绘 95% 置信区间。Monte Carlo 结果只作为敏感性证据，不自动改变模型、控制点或 canonical readiness。完整方法见 `docs/georeference-monte-carlo-v027.md`。

## v0.28 Correlated / Systematic Error Scenario Stress Test

v0.28 在 v0.27 独立 Gaussian Monte Carlo 之后增加结构化系统误差压力测试。默认测试 fit 控制点像素整体旋转 ±0.25°、X/Y 比例尺 ±0.35%、全部 ground fit points 共同平移 10m、半幅区域相关偏移 15m、单个 fit point gross error 40m，以及正弦波形图像控制误差 2px。

所有压力只作用于临时 fit observations，independent check points 和已描绘 boundary pixels 始终固定。每个变体重拟合当前 session.method，计算 stressed Holdout、baseline→stressed boundary 位移，并让 Affine / Projective / 2×1 / 1×2 / 2×2 重新竞争 complexity-adjusted winner。

现代高德地图的“系统压力”开关显示 baseline boundary、所选情景 worst stressed boundary、顶点位移向量及最不稳定边界段。工作台同时报告 `stable / model-sensitive / boundary-sensitive / systematic-fragile`。这些结果只是结构化敏感性证据，不自动改变模型、控制点、readiness 或 canonical patch 状态。

完整方法与默认压力幅度见 `docs/georeference-systematic-stress-v028.md`。

## v0.29 Evidence-calibrated Control Uncertainty

控制点表新增图像 evidence / σpx 与地面 evidence / σm。工作台默认 Monte Carlo 进入 `evidence-profiled` 模式，每个 fit point 根据自己的证据 profile 扰动；未填写证据的旧点继续回退到 v0.27 的 1.5px / 10m。高德点击点可自动推断为 `amap-poi`，其它来源需要研究者明确标注。

check points 仍保持固定外部真值，不参与 Monte Carlo 扰动。Draft GeoJSON 和 canonical patch 保存 profile 覆盖率、fallback 数与 σ 范围，逐点 profile 则随 session JSON 持久化。详见 `docs/georeference-evidence-uncertainty-v029.md`。

## v0.30 Uncertain Ground Truth / Check-point Uncertainty

v0.30 允许 independent `check` points 像 fit points 一样保存 evidence / σ，但 check 坐标始终固定，不进入任何拟合，也不在 Monte Carlo 中被扰动。工作台同时保留 raw Holdout 米制 QA，并新增 `residual / effective σ` 的 evidence-normalized 解释层。

`effective σ` 同时考虑 ground σ 和历史图 pixel σ 在当前模型局部尺度下对应的米制量。`≤2σ / 2–3σ / >3σ` 仅解释为 compatible / tension / inconsistent，不替代原 PASS/REVIEW/FAIL，也不改变 readiness。

高德 QA 可显示 `Check ±2σ` 证据圈。Monte Carlo 同时报告 raw winner 与 evidence-normalized winner，用于发现模型选择是否依赖 check 来源质量。完整方法见 `docs/georeference-check-uncertainty-v030.md`。

## v0.31 Evidence Audit / Calibration Provenance

v0.31 在 v0.29–v0.30 的 fit/check uncertainty profile 上增加来源审计。每个控制点可保存 evidenceRef、evidenceDate、calibrationBasis、reviewStatus、reviewedAt 和 calibration note。只有可追溯 evidenceRef 的 claim 才进入 evidence-backed；仅 evidence category、默认表或手工 σ 仍属于 heuristic/fallback。

工作台新增选中控制点 provenance 编辑器和全局 Evidence Audit 表，直接显示 evidence-backed/reviewed 覆盖率与 weakest controls。GeoJSON 和 canonical patch 保存审计汇总，但 `assessReviewReadiness()` 与人工批准流程不变。详见 `docs/georeference-evidence-audit-v031.md`。

## v0.32 Evidence Backlog / Research Queue

v0.32 将 uncertainty evidence audit 与 Influence、RANSAC、IRLS、independent check standardized residual 合并成动态研究队列。每条任务由 evidence gap score 与 diagnostic score 组成，并分为 high / medium / low。

队列不保存独立完成状态；控制点的 evidenceRef、calibration basis、reviewStatus 或诊断状态变化后会自动重算。工作台可点击任务选中对应控制点，继续在 provenance 编辑器补原始来源。GeoJSON / canonical patch 仅保存任务计数和 top control IDs 快照，不把 backlog 作为 readiness gate。详见 `docs/georeference-evidence-backlog-v032.md`。
