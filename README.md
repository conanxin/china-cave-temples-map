# 中国代表性石窟寺互动地图

国博《中国代表性佛教石窟寺分布图》01–112 点的个人研究型数字化网页。当前版本：**v0.33.0**（与 `package.json` 一致）。

## 启动

```bash
npm install
cp .env.example .env.local
# 编辑 .env.local：按下方说明配置环境变量
npm run dev
```

环境变量名称与 `.env.example` 一致（示例中的 `...` 需替换为自己的值）：

```text
VITE_AMAP_KEY=...
AMAP_SECURITY_CODE=...
```

- `VITE_AMAP_KEY`：高德 Web(JS API) Key，供浏览器加载地图 SDK，属于客户端可见配置。
- `AMAP_SECURITY_CODE`：仅供服务端 `api/amap-proxy.ts` 读取的安全密钥。部署时在 Vercel 对应环境的服务端配置；不得加 `VITE_` 前缀或提交真实值到仓库。

浏览器通过同源 `/_AMapService/*` 发起高德服务请求，`vercel.json` 将其转发到 `/api/amap-proxy`，由服务端追加安全密钥。前端不再使用 `VITE_AMAP_SECURITY_CODE`。

`npm run dev` 只启动 Vite 前端，当前没有配置本地 API 代理，不会运行 Vercel Function 或应用上述 rewrite。完整地图与 POI 检索请在已配置这两个变量的 Vercel Preview / Production 环境验证；仅填写 `.env.local` 不会让 Vite 提供服务端代理。

没有配置 Key 时，112 条文字数据、搜索、筛选、编号索引与详情仍可使用；地图区域会给出配置提示。

## 点位策略

`src/data/sites.ts` 不会用行政区中心伪造遗址精确坐标。未人工核验的父级地点保留 `coordinateConfidence: 'unresolved'`。地图加载完成后不会自动调用 `AMap.PlaceSearch`；只有用户主动检索时，才根据“正式名称 + 行政区”生成候选位置，并在浏览器 localStorage 中缓存。候选默认隐藏，只有静态数据中的 `verified` 点默认显示。

v0.3 起新增 **遗址群组成点（subpoints）**：对于马蹄寺、文殊山等一个国保编号包含多个实际洞窟群/组成点的项目，不再强迫整个编号共用一个“看似精确”的坐标。已确认的组成点单独发布，例如 `32A 马蹄寺北寺石窟`，父级 `32 马蹄寺石窟群` 仍保持未解析，直到其组成范围逐一完成。

当前坐标进度：

- **39 / 112** 父级遗址已有人工核验 GCJ-02 代表坐标。
- **13** 个额外组成点已人工核验：既有 07A/07B、28A/28B、32A、43A/43B、45A/45B，本阶段新增 `26A 千佛崖石窟`、`26B 龙虎塔`、`26C 九顶塔`、`33A 灵泉寺石窟核心区参考点`。
- 共有 **46 / 112** 个展墙编号至少拥有一个人工核验点，默认发布 **52 个核验 Marker**。
- **73 / 112** 父级遗址仍没有被伪造为单一精确坐标。

详见 `docs/coordinate-audit.md`。






## v0.33 与当前地图交互更新

- AMap 安全密钥改由同源服务端代理使用，浏览器只接收公开 Web(JS API) Key。
- 新增 **AMap Cost Guard**：页面加载不自动进行候选搜索，提供单点检索与需确认的批量检索，具体操作见下方“地图交互”。这不代表地图 SDK、底图或其他地图服务没有请求或费用。
- 初始视图保持全国范围，选择遗址后再聚焦；全国缩放级别使用核验标记聚合，聚合数量以“处”为后缀，与遗址编号区分。
- 遗址数据仍为 112 条，已发布核验标记 52 个、研究空间范围 2 个；候选检索不会自动修改这些正式数据。

## v0.32 本阶段变化

- 新增 **Evidence Backlog / Research Queue**：把 v0.31 的 evidence audit 与 Influence、RANSAC、IRLS、independent check 冲突合并为动态研究任务队列。
- 队列分数拆为 evidence gap 与 diagnostic 两部分；fallback / heuristic / evidence-backed / reviewed 具有不同基础缺口分，模型影响与 check >2σ 冲突再叠加诊断分。
- 输出 `high / medium / low` 研究优先级和明确 recommended action，例如“补 evidenceRef”“复核控制点与来源”“核验 check 证据”。
- Research Queue 不维护独立 done 状态：控制点补证、review 或诊断变化后，任务自动降级或消失，避免任务状态与 Session 事实脱节。
- 工作台新增 Evidence research queue 总览卡和任务表，点击任务可直接选中控制点并继续编辑 v0.31 provenance。
- Draft GeoJSON 与 canonical patch 保存 backlog 数量与 top control IDs 快照；队列结果不进入 `assessReviewReadiness()`，不自动删点、降权、切模型或晋升 geometry。

完整方法说明见 `docs/georeference-evidence-backlog-v032.md`。

## v0.31 本阶段变化

- 新增 **Evidence Audit / Calibration Provenance**：uncertainty σ 不再只是数值，还可追溯到 evidenceRef、evidenceDate、calibrationBasis、reviewStatus、reviewedAt 与说明。
- 审计等级固定为 `fallback / heuristic / evidence-backed / reviewed`；仅选择“官方GIS”等 evidence category 不会自动冒充 evidence-backed，必须有可追溯 evidenceRef。
- 工作台新增选中控制点 provenance 编辑器，以及全局 Evidence Audit 汇总卡和弱点表。
- Session parser 校验非法 basis / review status / 空 evidenceRef / 无效日期；旧 session 保持兼容。
- Draft GeoJSON 与 canonical patch 保存 evidence-backed/reviewed 比例、fallback/heuristic 数、fit/check 覆盖数和 weakest control IDs。
- reviewed 只表示 uncertainty claim 已人工复核，不代表控制点坐标 verified，也不会自动提高 canonical readiness。

完整方法说明见 `docs/georeference-evidence-audit-v031.md`。

## v0.30 本阶段变化

- 新增 **Uncertain Ground Truth / Check-point Uncertainty**：independent check points 可以拥有自己的 evidence / σ，但仍然固定、不参与拟合和 Monte Carlo 扰动。
- 将 check 的 pixel σ 按当前模型局部 meters-per-pixel 转换为米，并与 ground σ 合成为 `effectiveSigmaM`。
- 新增 evidence-normalized residual：`residual / effective σ`，解释为 `≤2σ compatible / 2–3σ tension / >3σ inconsistent`；这些只是旁证，不替代 raw Holdout PASS/REVIEW/FAIL。
- Monte Carlo 保留原 raw meter winner，同时新增 evidence-normalized winner；若两者不一致，直接提示模型选择依赖 check 证据质量。
- 工作台允许编辑 check point evidence / numeric σ，并新增逐点 raw residual、effective σ、standardized residual 和解释表。
- 高德 QA 新增 `Check ±2σ` 圆；它是证据尺度可视化，不是正式95%置信区间。
- Draft GeoJSON / canonical patch 保存 check uncertainty 与 evidence-normalized Monte Carlo provenance；v0.30 不修改 `assessReviewReadiness()`。

完整方法说明见 `docs/georeference-check-uncertainty-v030.md`。

## v0.29 本阶段变化

- 新增 **Evidence-calibrated Control Uncertainty**：Monte Carlo 默认不再强制所有 fit points 共用同一个 1.5px / 10m σ，而是逐点读取证据 profile。
- 图像 evidence 支持清晰角点、清晰地物、模糊地物、近似区域；地面 evidence 支持官方 GIS、现场 GPS、官方坐标、高德 POI、人工交叉核、OSM/Wikidata 与 unknown fallback。
- AMap-linked 控制点自动推断为 `amap-poi`；其它手工点不做激进自动猜测。
- 用户可在工作台控制点表直接选择 evidence，也可输入 numeric σ 覆盖默认校准值；check points 继续固定为独立真值。
- 显式传入统一 `pixelSigmaPx / groundSigmaM` 时仍保持 v0.27 uniform 行为，便于重现实验。
- Draft GeoJSON 与 canonical patch 保存 calibration mode、profile/fallback 数量和 σ 范围；逐点 profile 保存在 session JSON。
- v0.29 不修改 canonical readiness、模型选择或112条遗址事实数据。

完整方法说明见 `docs/georeference-evidence-uncertainty-v029.md`。

## v0.28 本阶段变化

- 新增 **Correlated / Systematic Error Scenario Stress Test**，与 v0.27 独立 Gaussian Monte Carlo 并行，专门测试结构化系统误差。
- 默认六类压力：fit 像素整体旋转 ±0.25°、X/Y 比例尺 ±0.35%、全部地面 fit 点共同偏移 10m、半幅区域相关偏移 15m、单个 fit 点 gross error 40m、图像正弦波形变 2px。
- independent `check` points 与 `boundaryPixels` 始终固定；压力只施加在临时 fit observations 上，因此测量的是控制证据系统误差如何传播到 Holdout 与边界位置。
- 每个压力变体同时比较 Global Affine / Projective / 2×1 / 1×2 / 2×2，继续沿用 complexity surcharge，并记录模型赢家是否翻转。
- 高德视觉 QA 新增 baseline boundary、worst stressed boundary、顶点位移向量与最不稳定边界段，可按六类情景切换预演。
- Draft GeoJSON 与 canonical patch 保存系统压力 provenance；v0.28 仍不修改 `session.method`、`assessReviewReadiness()` 或人工晋升流程。

完整方法说明见 `docs/georeference-systematic-stress-v028.md`。

## v0.27 本阶段变化

- 新增 Monte Carlo / Bootstrap 控制点不确定性传播：默认 200 trials、固定 seed，可复现地扰动 fit 点的像素位置与地面坐标。
- Global Affine / Projective / 2×1 / 1×2 / 2×2 使用固定 independent check truth 比较，并继续沿用 v0.26 complexity surcharge。
- 输出各模型 valid trials、win rate、平均 holdout 与 adjusted score，识别模型选择是否对控制点误差敏感。
- 对当前 session.method 的数字化边界传播控制点误差，报告各顶点 P50/P95/max、边界 mean/max P95 和最不稳定边界段。
- 高德视觉 QA 新增 P95 不确定性圆和最不稳定边界段高亮。
- Draft GeoJSON 与 canonical patch 保存 Monte Carlo provenance；v0.27 仍不修改 `assessReviewReadiness()`、`session.method` 或人工晋升流程。

## v0.26 本阶段变化

- 新增 **3×2 spatial block cross-validation**：每个非空图幅空间块依次整体留出，候选模型只能用其他空间块的 fit points 重拟合，再预测被留出的点。
- 所有可用候选必须覆盖 **100% fit points**，每个 fit point 恰好被空间留出一次；Piecewise 不能跳过会导致局部模型失效的困难 fold。
- 同时比较 Global Affine、Global Projective、Piecewise 2×1、1×2、2×2 五种模型。
- 新增透明的复杂度 surcharge：`5 × log2(parameterCount / 6)%`，对 Projective / 2区 / 4区候选分别施加约 2.1% / 5% / 10% 的轻量惩罚；明确不是 AIC/BIC。
- 新增 fold stability、worst spatial fold、minimum training support ratio，并继续使用真正 independent `check` points 作为第二层验证。
- 工作台新增 **Spatial CV + Complexity** 诊断卡和模型对照表；`piecewise-supported / piecewise-review / overfit-risk / global-preferred` 只影响研究判断，不自动切换模型。
- Draft GeoJSON 与 canonical patch 保存 Spatial-CV 和 complexity provenance；v0.26 不修改 `assessReviewReadiness()` 或人工晋升流程。

完整方法说明见 `docs/georeference-spatial-cv-v026.md`。

## v0.25 本阶段变化

- 新增 **Piecewise 视觉预演**：v0.24 的 2×1、1×2、2×2 候选可以直接切换并同时显示在历史图与高德现代底图。
- 历史图显示 W/E、N/S 或 NW/NE/SW/SE 分区；局部 Affine orientation 与当前全局模型方向不一致时，具体风险分区会标记 **FOLD**。
- 高德新增 Piecewise 紫红虚线边界、各局部分区现代轮廓与 seam 跳变线段；seam 按当前 PASS/REVIEW 最大残差阈值分级。
- 新增“全局模型 ↔ Piecewise 边界”的 mean/max divergence，用于估计采用分区模型后数字化边界会移动多少。
- 候选表、历史图和高德地图共享同一预演布局，避免 UI 各处显示不同候选。
- v0.25 只增加 visual QA，不修改 v0.24 候选结论、`session.method`、canonical readiness 或人工晋升流程。

完整方法说明见 `docs/georeference-piecewise-preview-v025.md`。

## v0.24 本阶段变化

- 新增 **Piecewise / Segmented Registration 候选模拟**：2×1 左右、1×2 上下、2×2 四象限。
- 每个局部区域固定使用 Affine，并且必须拥有 ≥3 fit points 与 ≥1 independent check point。
- 同时计算全局模型与分区模型的 Holdout 差异、seam continuity、orientation / fold-over 风险。
- 工作台新增 Piecewise candidate 卡片和候选表；候选只做诊断，不自动切换 session.method，也不创建正式局部几何。
- Draft GeoJSON 和 Canonical patch 会保存最佳候选布局、Holdout、seam 与 fold-over 风险，确保人工批准后仍可追溯。

## v0.23 本阶段变化

- 新增 **局部形变场 / spatially varying residuals** 诊断。它只使用独立 `check` points，不使用 fit 点训练残差来判断局部形变。
- 对 check point 的东/北米制残差先拟合一阶空间向量场，再从局部热区中剥离整体平移；报告 `gradientExplainedFraction / postFieldRmsM / fieldVariationM / divergence / rotation / shear`。这些量是**归一化图幅上的研究诊断量**，不是地球物理应变或法定测绘指标。
- 历史图上新增 **4×4 IDW 局部形变热区**，按现有 QA 阈值分成 pass / review / fail。热区是探索性可视化，不是克里金、显著性检验或正式空间统计聚类。
- 局部形变模式分成 `stable / structured-gradient / localized-hotspot / irregular`。至少需要 **4 个 independent check points** 和已知图像尺寸；证据不足时明确返回 unavailable。
- 新增跨模型局部形变比较：同时检查 Affine / Projective / RANSAC / Huber / Tukey。若 Projective 消除 Affine 残差场，建议优先 Projective；若 Robust/IRLS 消除热点，建议复查控制点；若同一热点在多个全局/稳健模型中持续存在，才提示 **consider-piecewise**。
- `consider-piecewise` 只是“值得人工评估分区配准”的研究提示，不会自动创建局部模型、不会切换 `session.method`、不会改变 v0.16 readiness，也不会绕过 v0.17 的人工批准与 reviewed registry。
- Draft GeoJSON 与 canonical patch QA 新增局部形变 provenance：pattern、线性场解释率、field variation、热点区域、跨模型建议、最佳模型、persistent hotspot 与 piecewise 建议。人工最终批准后这些风险旁证仍保留。

完整方法说明见 `docs/georeference-local-distortion-v023.md`。

## v0.22 本阶段变化

- 新增 **Huber / Tukey IRLS 连续权重稳健配准**。普通 LS、RANSAC 硬 inlier/outlier 和 IRLS 软权重现在形成三套独立诊断证据。
- Huber 使用 `k=1.345`，Tukey biweight 使用 `c=4.685`；每轮先按米制控制点残差估计 robust scale，再进行加权最小二乘，直到权重收敛或达到30轮。经纬度两条观测方程始终共享同一控制点权重。
- IRLS 只使用 `fit` 点更新模型；模型优劣继续只用同一批 independent `check` points 比较，绝不把 check points 偷放进拟合。
- 每个 fit point 同时显示 **Huber weight / Tukey weight / 连续降权状态**：`>=0.8 full`、`0.35–0.8 downweighted`、`<0.35 severe`。这些只是研究诊断，不是“正确概率”。
- 高德视觉层新增 **Huber 橙色实线 / Tukey 蓝色虚线**边界开关；严重降权点在历史图与现代地图出现独立橙色警示环。
- 新增 **多证据一致性**：只有 `Influence=SUSPECT + RANSAC=OUTLIER + IRLS=SEVERE` 三者同时指向同一个点时，才标记 `高优先复查`；两条警告只标普通“复查”。任何级别都没有自动删除动作。
- Draft GeoJSON 与 canonical patch QA 新增 IRLS provenance：recommendation、top downweighted control、Huber/Tukey Holdout、最低权重、severe 数与最大边界分离；人工批准后仍保留。
- v0.22 **不修改** `assessReviewReadiness()`，不会自动切换到 Huber/Tukey 模型，不会自动降低或提高 canonical 晋升资格。

完整方法说明见 `docs/georeference-irls-v022.md`。

## v0.21 本阶段变化

- 新增 **Robust / RANSAC-style minimal-sample consensus** 诊断：Affine 使用3点最小样本，Projective 使用4点最小样本，对 fit points 建立稳健共识模型。
- RANSAC 只使用 `fit` 点建模；模型优劣仍只用同一批 independent `check` points 比较，绝不把 check 点偷放进拟合。
- 当前共识阈值来自 `max(10m, PASS max residual)`；默认约50m。`outlierVoteRate` 只在最佳 inlier-count 的 elite candidates 中统计：≥60% 为 outlier，≤40% 为 inlier，中间为 ambiguous。它是研究共识指标，不是统计错误概率。
- 高德地图新增 **Robust 青蓝虚线边界**开关；RANSAC outlier 在历史图和现代高德 Marker 上使用紫红警示环，ambiguous 使用紫色虚线环。
- QA 新增 **LS Holdout vs Robust Holdout / outlier 数 / trial 数 / 共识 inlier 数 / LS↔Robust 边界 mean/max divergence**。Robust 更好只表示“建议复查控制点”，不会自动替换当前 `session.method`。
- 新增 Robust 明细表：逐点显示 `inlier / ambiguous / outlier`、outlier vote 与 Robust residual；点击只做双地图联动选中，不提供自动删除。
- Draft GeoJSON provenance 与 canonical patch QA 都保存 RANSAC 阈值、trial、outlier、Holdout、边界分离及 recommendation；人工最终批准后也不会丢失这段风险旁证。
- v0.21 **不修改** `assessReviewReadiness()`，不会自动删点、不会自动采用 Robust model、不会自动阻止/放行 canonical 晋升。

完整方法说明见 `docs/georeference-ransac-v021.md`。


## v0.20 本阶段变化

- 新增 **fit point influence / leverage** 诊断：逐个临时移除拟合控制点、重拟合当前模型，再用同一批独立 `check` 点重新计算 Holdout RMSE，同时测量边界平均/最大漂移。
- 当前启发式：移除某点后 Holdout RMSE **下降 ≥25% 且至少下降5m** → `SUSPECT · 复查`；移除后 **上升 ≥25% 且至少上升5m** → `SUPPORTIVE`；其余 `NEUTRAL`。这些阈值只是个人研究提示，不是测绘规范。
- Influence 分析要求至少 **2个独立 check points**；Affine 至少 **4个 fit points**、Projective 至少 **5个 fit points**，保证每个点被拿掉后模型仍可拟合。
- 高影响拟合点会在历史图、高德 Marker、控制点表同时高亮：suspect 使用红色警示环，supportive 使用绿色支撑环；点击 influence 表只会联动选中，不提供自动删除按钮。
- 每个点同时报告：baseline / omitted Holdout RMSE、改善量和百分比、边界 mean/max shift、移除后的 LOO 状态。边界漂移只作为 leverage 指标，不参与 suspect/supportive 判定。
- draft GeoJSON provenance 新增 `controlInfluenceAvailable / controlInfluenceTopSuspectId / controlInfluenceSuspectCount / controlInfluenceSupportiveCount / controlInfluenceMaxHoldoutImprovementM / controlInfluenceMaxBoundaryShiftM`。
- canonical patch 同样保留 influence 风险旁证；即使人工最终批准，也不会丢失“当时存在几个 suspect 点、top suspect 是谁”的审核事实。
- v0.20 **不修改** `assessReviewReadiness()` 的 STRONG 规则，不自动删除控制点、不自动切换模型、不自动重新拟合、不自动阻断或放行 canonical 晋升。

完整方法说明见 `docs/georeference-influence-v020.md`。

## v0.19 本阶段变化

- 新增 **check point 误差向量场**：在高德上把每个独立检查点的“模型预测位置 → 真实位置”画成方向箭头，并按当前 QA 阈值分成绿 / 琥珀 / 红。
- 新增误差场诊断：平均东/北分量、系统偏移幅度与方位角、方向一致性、去除系统偏移后的 local RMS，以及 NW/NE/SW/SE 象限热点提示。
- 新增 **Affine vs Projective 双模型对照**：同一批 fit points 分别拟合两种模型，同一批 check points 独立评估，实时比较 holdout RMSE、LOO 与边界平均/最大分离。
- 模型建议只返回 `Affine / Projective / 调整控制点 / 证据不足`。Projective 恰好4个拟合点、LOO 不可用时，不允许仅凭低训练残差推荐 Projective。
- 高德视觉验收层可独立开关 **误差向量** 与 **双模型边界**。当前活动模型的红色实时 Polygon 保留；Affine 对照线为绿色，Projective 为紫色虚线。
- draft GeoJSON provenance 新增 `errorPattern / systematicBiasM / systematicBearingDeg / directionalCoherence / localErrorRmsM / modelRecommendation / affineHoldoutRmseM / projectiveHoldoutRmseM / modelBoundary*DivergenceM`。
- 所有 v0.19 诊断仍然只服务于研究 QA；不会自动切换 session.method，也不会绕过 v0.17 的人工确认令牌与 reviewed registry。

## v0.18 本阶段变化

- 配准工作台升级为 **双地图联动视觉验收**：左侧保留官方历史图页，右侧常驻高德现代底图，不再需要每次弹出独立取点窗口。
- 控制点在 **历史图标记 / 控制点表 / 高德 Marker** 三处共享同一个选中状态；点击任何一处都会高亮同一控制点。`fit` 使用深朱红，`check` 使用蓝灰色，选中项增加金色外圈。
- 高德点击仍遵守 v0.17 provenance：`amap-click` 控制点在现代地图上优先直接使用保存的原始 **GCJ-02**；只有 `manual + WGS84` 控制点才为显示目的转换到 GCJ-02，避免二次转换污染原始点击证据。
- 在历史图先点击 pixel 后，可直接到右侧常驻高德地图点击对应真实地物；点击结果自动填入 WGS84，并保留原始 GCJ-02。没有待配对 pixel 时，高德点击不会写入控制点。
- 成功拟合且历史图已有 `boundaryPixels` 时，工作台会把草稿边界实时投影到高德地图，显示为半透明虚线 Polygon；透明度可在 **5%–60%** 调节，用于检查河谷、道路、山脊、寺院等整体错位。
- 新增 `src/georef/dualMap.ts` 纯逻辑层：统一产生双坐标控制点、实时投影边界和 fit/check 视觉语义；双地图 UI 不自行复制坐标转换逻辑。
- 实时叠加只属于 **visual QA draft**。视觉吻合不会改变 `reviewStatus=draft-unreviewed`，也不会绕过 v0.17 的 STRONG QA、精确人工批准令牌与 `reviewedExtentPatches.json` canonical 晋升流程。
- 没有高德 Key 时，右侧现代地图显示配置提示；历史图载入、数学拟合、Holdout/LOO QA、GeoJSON 导出和 canonical patch 草稿流程仍然可用。

完整说明见 `docs/dual-map-visual-review.md`。

## v0.17 本阶段变化

- 配准工作台新增 **“从高德取点”**：先在官方地图页点击 pixel，再在内嵌高德底图点击对应现代地物。高德返回的 GCJ-02 会确定性反算为 WGS84 参与配准，同时完整保存原始 GCJ-02 点击坐标。
- 控制点 provenance 新增 `groundSource / groundSourceCrs / groundSourceOriginal`。由高德创建的点标记为 `amap-click + GCJ-02`；如果之后手工修改经纬度，系统会自动清除高德 provenance 并改回 `manual + WGS84`。
- GeoJSON 草稿新增 `amapLinkedControlCount`，canonical patch QA 也保存 fit/check 数和高德联动控制点数量，方便以后复查控制点究竟来自人工输入还是现代底图。
- 新增 **Canonical 边界晋升**：只有 v0.16 readiness=`strong`、已选目标 extent、已完成边界描绘且目标尚未 `verified` 时，才能生成 `draft-unreviewed` canonical patch。
- 晋升 patch 必须输入精确令牌 `APPROVE <site-code> <extent-id>` 才能变为 `human-approved`。浏览器只下载 approved patch，**不会直接改 canonical 数据**。
- 新增 `src/data/reviewedExtentPatches.json` 与 runtime merge。运行 `python scripts/apply_reviewed_extent_patch.py <approved-patch.json>` 后，approved patch 才进入 reviewed registry；下一次加载数据时对应 `SiteSpatialExtent.geometry` 才会升级为 `verified`，并记录 `georeferenced-official-map` derivation 与 session/patch provenance。
- CLI 默认拒绝 draft patch、错误确认令牌和重复 site+extent；覆盖既有 reviewed patch 必须显式使用 `--replace`。已存在 `geometryStatus: verified` 的 canonical extent 仍由 runtime guard 拒绝覆盖。
- 当前 `reviewedExtentPatches.json` 仍为空，因此 v0.17 **不新增 verified Polygon**；它建立的是从研究草稿到 canonical geometry 的人工门控路径。

详细流程见 `docs/canonical-extent-promotion.md`。

## v0.16 本阶段变化

- 配准控制点新增 **`fit / check` 两种角色**。`check` 点从模型拟合中完全排除，只用于独立 Holdout QA；旧会话中未标角色的控制点继续按 `fit` 解释。
- 新增 **Holdout QA**：独立检查点使用拟合后的模型预测，单独报告 RMSE / 最大残差 / PASS-REVIEW-FAIL，不再把训练内 residual 当作唯一精度指标。
- 新增 **Leave-one-out (LOO)**：每次拿掉一个拟合点重新拟合，再预测被拿掉的点。Affine 至少需要 4 个拟合点、Projective 至少 5 个；Projective 恰好 4 点时明确显示“LOO 不可用”，不会用近零训练残差制造虚假信心。
- 新增 **控制点空间分布评分**：结合图幅 X/Y span 与控制点凸包占图幅面积，输出 0–100 与 GOOD / REVIEW / POOR。它是项目启发式指标，不是测绘规范。
- 新增 **边界面积自动核验**：选择对应的 `SiteSpatialExtent` 后，数字化 WGS84 Polygon 自动计算球面面积，并与 UNESCO `areaHa` 比较；默认提示阈值为 `≤5% PASS`、`≤15% REVIEW`、其余 FAIL。
- 新增 **进入人工审核建议**：只有至少 2 个独立 check points、可用 LOO、有效空间分布，并在存在官方面积时完成面积比较，才可能显示 `STRONG`。它仍然只是研究审核建议，绝不自动晋升 `verified Polygon`。
- GeoJSON 草稿属性新增 `checkPointCount / holdoutRmseM / looRmseM / spatialDistributionScore / officialAreaHa / computedAreaHa / areaDifferencePercent` 等 QA 元数据；`reviewStatus` 仍强制为 `draft-unreviewed`。
- 配准工作台默认把当前 `SpatialMapTarget` 的第一个 linked extent 作为边界目标；05/06/08/27 因而可直接对 UNESCO Property 面积进行自动比较，也可手动切换 Buffer。

完整算法与限制见 `docs/georeference-qa-v016.md`。

## v0.15 本阶段变化

- 新增浏览器内 **「地图配准工作台」**：主页面顶部即可打开，继承当前选中遗址，并自动关联该遗址已有的 `SpatialMapTarget`。
- 地图页 PNG/JPEG 只使用浏览器本地 `Object URL`，**不上传、不持久化图片本体**；会话保存图片名和像素尺寸，重开时需重新选择原图。
- 新增 `src/georef/` 纯数学子系统：支持 **Affine（≥3点）** 与 **Projective/Homography（≥4点）** 最小二乘拟合、奇异控制点检测和像素→WGS84 变换。
- 新增米制 QA：每控制点 Haversine 残差、RMSE、最大残差与 PASS / REVIEW / FAIL 研究提示；阈值可编辑并随会话保存。
- 新增边界采点模式：在原地图页上记录像素 Polygon、显示草稿折线，成功拟合后同时导出 **WGS84 GeoJSON / GCJ-02 GeoJSON**。
- 所有 GeoJSON 强制写入 `reviewStatus: draft-unreviewed`，**不会自动写回 canonical `SiteSpatialExtent.geometry`**。
- 新增 versioned `GeoreferenceSession`：控制点、边界像素、变换方法和 QA 阈值可 localStorage 保存，并可导入/导出 JSON；导入会检查遗址/地图目标匹配。
- 默认 QA 阈值只是个人研究提示，不是法定测绘标准；当前 RMSE 是拟合控制点 residual，而非独立 holdout/check-point accuracy。
- 新增 `docs/georeference-workbench.md`，规定从官方地图页到 draft GeoJSON，再到人工审核和 canonical Polygon 的完整晋升流程。

当前 v0.15 不新增任何 `verified Polygon`；它提供的是**把未来正式图页可靠转换成可审查草稿几何的工具**。


## v0.14 本阶段变化

- 为约 **1,018,487,777 bytes** 的 UNESCO Nomination file 1442 新增 **HTTP Range 随机访问抽页**。`HTTPRangeReader` 对外表现为 seekable file object，`pypdf` 可在不先下载整卷的情况下读取 xref / page tree / 目标页面对象。
- 新增 `probe-remote`：用 HEAD + 小型 Range GET 探测远程大小、`Accept-Ranges`、Content-Type 与 `/Linearized` 提示。当前环境实测仍在 DNS 阶段失败，因此 Range 能力记录为 `blocked-environment`，没有假设远端必然支持。
- 新增 `extract-remote`：支持网络读取预算、固定 block cache、只发 HTTP Range；如果服务器忽略 Range 会直接失败，不会静默退化成 1GB 整卷下载。
- 新增页码范围语法：`4178-4180,4200`，不再要求手写连续页码列表。
- 新增 `scripts/unesco_1442_targets.json` 与 `extract-target`：9 条 nomination page locator 与网页数据库由测试锁步；可以直接用 locator ID 抽页。
- 当前最高优先目标为 **`nomination-1442-maijishan-buffer-map-hint` → p.4178–4180**。UCL 博士论文明确把麦积山三层缓冲区图的依据指向原申遗卷宗这三页；抽页成功后仍必须核验图题、比例尺、坐标格网和页面偏移。
- 新增 `SpatialPdfExtractionPlan`，05 / 06 / 08 / 27 详情页出现 **“远程 PDF 定向提取”** 卡片，显示策略、Range 状态、文件大小、本遗址页窗、优先页窗、命令模板与下一步动作。
- 新增 `unesco-1442-nomination-range-probe-v014` 获取审计：本轮实际运行 `probe-remote`，container 仍因 `whc.unesco.org` DNS 解析失败而阻断；这表示“当前环境无法探测”，不表示 Range 不支持。

当前 v0.14 状态：点位 / Polygon 数保持 v0.13 不变；新增 **1 条 PDF extraction plan、1 条 Range probe acquisition attempt、1 份机器可读 page-window manifest**。针对四个文化石窟的 `vector-ready` 世界遗产边界仍为 **0**。

## v0.13 本阶段变化

- 新增可执行 **UNESCO PDF 流水线** `scripts/unesco_pdf_pipeline.py`：支持断点续传下载、期望大小校验、SHA-256、PDF 页数/metadata 检查、目标页文本定位、image-only contact sheet 回退，以及单页 PDF/PNG 提取。
- 当前环境实际重新尝试下载 `UNESCO Document 132728`，仍因 `whc.unesco.org` DNS 解析失败而阻断；web 侧已再次确认远程文件存在且长度 **40,574,291 bytes**。新增 `unesco-132728-pdf-download-v013` 获取尝试，不制造空文件或伪哈希。
- 新增第二条官方卷宗资产：**UNESCO Nomination file 1442**（官方 documents 页面约 1,018 MB），类型 `official-nomination-pdf`。它和 40.6 MB Document 132728 明确分离，避免混淆页码。
- 新增 **`SpatialDocumentLocator`** 页码定位器。中国丝绸博物馆 IIDOS 已给出四个目标组成遗产在完整申遗卷宗中的 annex / management-plan 页段；v0.13 共记录 **9 条 locator**。
- 四个目标的申遗卷宗页窗：Kizil `2233–2396 / 3788–3877`；Bingling `2448–2572 / 3967–4086`；Maijishan `2573–2711 / 4087–4243`；Bin County `2712–2773 / 4244–4307`。
- 另记录麦积山缓冲区地图 **pp.4178–4180** 的二手学术定位线索；它只缩小 Nomination file 1442 的扫描窗口，**不是 Document 132728 的页码**。
- 右侧详情新增 **“申遗卷宗页码线索”** 卡片，直接显示页窗、线索类型、证据等级与来源链接。
- 新增 `docs/unesco-132728-extraction.md`，使下一次在可联网环境里可以从下载官方 PDF 直接续跑到目标页提取，无需重新设计流程。

当前 v0.13 状态：**9 条源资产、4 个地图目标、5 条 GIS service probe、4 条 PDF fallback 路线、4 条 acquisition attempt、9 条 nomination page locator**。点位与 Polygon 数保持 v0.12 不变；针对四个目标文化石窟的 `vector-ready` 边界仍为 **0**。

## v0.12 本阶段变化

- 对 UNESCO Sites Navigator 的 ArcGIS Experience 深挖正式建立 **边界获取路线决策**：05 麦积山、06 炳灵寺、08 克孜尔、27 大佛寺均记录 `GIS primary → PDF fallback active`，当前没有公开可验证的文化遗产 Polygon/MultiPolygon 服务候选。
- 新增两条公开服务排除证据：WWF SIGHT 的 World Heritage MapServer 虽然是真实 `esriGeometryPolygon`，但服务主题明确限定 **Natural and Mixed World Heritage Sites**，不能套用于四个文化石窟；EEA Maratlas 的 World Heritage 叶子层则是 `esriGeometryPoint`，同样不能作为边界源。
- `UNESCO Document 132728` 现在不仅保存元数据，还保存真实 `Download File` 直链 `https://whc.unesco.org/document/132728`、远程内容长度 **40,574,291 bytes** 与获取状态 `download-blocked-environment`。这表示“官方原文件存在，但当前运行环境无法物化”，而不是“文件不存在”。
- 新增 **`SpatialAcquisitionAttempt` 获取尝试审计**，分别记录 ArcGIS item metadata、ArcGIS item data、UNESCO PDF 原文件三次实际获取尝试，并区分 DNS 解析阻断、内容过大/网络阻断等失败类别。
- 新增 **`SpatialBoundaryRoute`**：每个目标组成遗产都明确记录 primary GIS 资产、fallback PDF 资产、当前路线状态与下一步动作；详情页新增“边界获取路线”卡片。
- 源资产卡片新增 **获取状态**：尚未尝试、仅确认远程元数据、当前环境下载受阻、原始文件已物化。下载失败不再和“源文件不存在”混为一谈。
- 新增 WWF / EEA 两个 context-only 源资产，便于保留“为什么这个公开服务被排除”的可复查证据链，而不会污染规范 UNESCO 边界来源。

当前 v0.12 边界获取状态：**8 条源资产、5 条 service probe、4 条 PDF fallback 路线、3 条 acquisition attempt**；`candidate-boundary-service = 0`、`vector-ready（针对目标文化石窟边界）= 0`。点位与 Polygon 数量保持 v0.11 不变。

## v0.11 本阶段变化

- 把 UNESCO Sites Navigator 的规范入口从旧 `e3ea9...` 更新为 UNESCO World Heritage Centre 当前页面直接链接的 **Experience `4f1652275d1f4656964b64a20a7346d3`**；旧入口只保留为历史线索。
- 新增 `SpatialServiceProbe` 服务发现模型，把 **应用入口 / ArcGIS 服务 / 几何类型 / 判定 / 证据级别** 单独记录，避免“看到 GIS 平台”直接等同于“已有 Polygon 服务”。
- 新增 3 条服务审计记录：当前官方 Experience 已确认；公开 `UNESCO_0` 服务因 `esriGeometryPoint` 被正式排除；实施伙伴披露的 harmonized sites layer 因公开 REST URL 尚未解析而保持 `not-publicly-resolved`。
- 当前 `candidate-boundary-service = 0`、`vector-ready = 0`。v0.11 没有制造新的边界 Polygon，重点是**排除错误服务并把下一轮端点发现做成可测试的数据工作流**。
- 05 / 06 / 08 / 27 详情新增 **“GIS 服务发现”** 卡片：显示服务类型、几何类型、判定、证据级别、item/layer 元数据与下一步动作。
- 新增 `docs/service-discovery-audit.md`，记录当前官方 app、被排除的 Point 服务、harmonized layer 线索与后续 ArcGIS item/WebMap 解析步骤。

当前点位 / Polygon 统计与 v0.10 不变；新增 **3 条 service probe**：1 条当前官方应用确认、1 条边界源排除、1 条公开端点未解析，0 条 Polygon 服务候选。

## v0.10 本阶段变化

- 新增 **`SpatialMapTarget` 官方地图提取目标模型**：把“某份官方 PDF 存在”继续拆成“哪个组成遗产、对应哪两个范围、图页是否定位、是否已经提取、配准做到哪一步”。
- 为 UNESCO Document 132728 建立 4 个独立目标：`1442-025 克孜尔`、`1442-027 炳灵寺`、`1442-028 麦积山`、`1442-029 大佛寺`。当前 4 个均为 `page-location-needed + not-started`，没有虚构 PDF 页码。
- 新增 **UNESCO Sites Navigator** 作为第二条官方边界来源，资产类型为 `official-gis-platform`，状态为 `service-discovery-needed`。UNESCO 官方说明 Navigator 展示经过核验和地理配准的 UNESCO 边界，但没有出现的 World Heritage polygon 可能仍在等待缔约国提交或 UNESCO 审核，因此本项目不会假设四个组成遗产一定已有公开可导出 Polygon。
- 已发现一个公开 ArcGIS `UNESCO_0` 图层，但服务元数据明确显示其 Geometry Type 为 `esriGeometryPoint`；v0.10 把它记录为**不适合作为边界来源的排除线索**，不利用点图层反推 property / buffer polygon。
- 右侧详情新增 **“官方地图提取目标”** 模块：对 05 / 06 / 08 / 27 直接显示官方编号、图页定位状态、配准状态、关联范围和下一步动作。
- 新增 `docs/boundary-acquisition-pipeline.md`，固定“官方 PDF 配准路线”和“官方 GIS 服务路线”两条可闭环工作流。

当前空间数据本身保持克制：**17 条范围证据、2 个 verified 研究 Polygon、15 条 text-only**；源资产从 5 条增为 **6 条**（4 条 `text-extracted`、1 条 `georeference-needed`、1 条 `service-discovery-needed`、0 条 `vector-ready`）；新增 **4 个地图提取目标**，尚无任何目标被虚假标记为已定位页码或已配准。

## v0.9 本阶段变化

- 新增 **空间源资产注册表 `spatialSourceAssets`**。官方 PDF、官方地理数据页、保护范围文件、法规网页与官方案例不再只散落在 `sourceUrl` 字符串里，而是拥有稳定 `asset.id`、发布机构、资产类型、处理状态、角色、关联遗址与关联范围。
- 建立源资产生命周期：`registered` → `text-extracted` / `georeference-needed` → `vector-ready`。**来源权威性与处理完成度分开记录**：官方一级地图 PDF 也不能因为“很权威”就自动被视为已有边界矢量。
- 登记 UNESCO 官方 `Document 132728`：**Silk Roads: the Routes Network of Chang'an-Tianshan Corridor - maps of inscribed property**，2014-06-25，官方 Nomination 地图集。当前远程文件约 **40.6 MB**，关联 05 麦积山、06 炳灵寺、08 克孜尔、27 大佛寺四个展墙石窟项目；状态为 `georeference-needed`，尚未从 PDF 中提取并配准各组成遗产边界图。
- 登记 UNESCO `1442` 官方 geographical data 页面作为独立 `official-geodata-page`：它提供33个组成遗产的代表坐标、遗产区面积与缓冲区面积，可以支撑点位与面积证据，**不能仅凭面积反推边界形状**。
- **05 麦积山石窟**：补齐 UNESCO `1442-028` 世界遗产证据——遗产区 **483.71 ha**、缓冲区 **1,259.28 ha**；官方代表坐标与现有高德本体点相距约192米，作为独立交叉验证。两层边界继续 `text-only`。
- **27 大佛寺石窟**：补齐 UNESCO `1442-029 Bin County Cave Temple`——遗产区 **34.68 ha**、缓冲区 **587.26 ha**；官方代表坐标与现有高德点相距约63米。两层边界继续 `text-only`。
- 右侧详情新增 **“源图 / 源数据资产”** 卡片：展示源资产类型、证据等级、处理状态、来源日期、文件大小、官方编号、下一步处理动作及关联范围数量。
- 新增源资产一致性测试：任何 `linkedExtentId` 必须解析到实际空间证据；官方地图 PDF 在没有可用矢量/配准成果前不得标成 `vector-ready`。

当前空间证据进度：**17 条范围证据记录**，其中 **2 条 verified 研究 Polygon**、**15 条 text-only**；源资产注册表 **5 条**（1 条待提取/配准、4 条文字证据已提取）。点位统计仍为 **39 个父级 verified + 13 个 verified 子点 = 52 个默认 Marker**。

## v0.8 本阶段变化

- 建立 **空间证据来源等级与推导链**：每条规范范围证据现在显式保存 `evidenceTier`、`derivation`、`sourceDate`、`sourceUrl`；可选保存面积、原始/目标坐标系与官方编号。
- 新增两种世界遗产范围语义：`world-heritage-property` 与 `world-heritage-buffer`。它们与国内 `legal-protection` / `construction-control` 完全分层，不能互相替代。
- **06 炳灵寺石窟**：采用 UNESCO `1442-027` 官方 WGS84 代表坐标，经项目内确定性转换晋升为 GCJ-02 父级代表点 `103.049050, 35.807717`。同时录入遗产区 **132.62 ha**、缓冲区 **2,044.37 ha**；由于尚未取得可核验官方边界矢量，两层继续 `text-only`。
- **08 克孜尔千佛洞**：采用 UNESCO `1442-025` 官方代表坐标转换为 `82.508386, 41.785148`，并依据新疆文旅厅资料改为遗址群。录入自治区政府1999年法定保护范围/建设控制地带文字，以及 UNESCO 遗产区 **1,798.48 ha**、缓冲区 **9,849.17 ha**，均不凭面积或文字反推 Polygon。
- **09 库木吐喇千佛洞**：改为 `group`。最高检典型案例确认 2009 年保护规划、“两线”跨县及 2022 年8月保护范围土地权属办理；公开页面没有边界坐标，所以法定两线只以 `text-only` 保存，父级坐标仍保持 `unresolved`。
- 既有 **26 / 31 / 46** 范围证据补齐来源等级：26 为官方一级文字证据；31 / 46 为公开二手经纬范围，继续只作为研究 Polygon。
- 详情页现在直接显示 **来源等级 / 推导方式 / 面积 / 来源日期 / 官方编号**，便于在地图里判断“这个范围为什么可信到什么程度”。
- 新增 `docs/spatial-source-ledger.md`，作为未来官方 PDF、GIS、UNESCO 矢量和配准成果的来源台账。

当前空间范围进度：**13 条范围证据记录**，其中 **2 条 verified 研究范围 Polygon**、**11 条 text-only 证据**；地图仍只绘制那 2 条有可发布几何的研究范围。

## v0.7 本阶段变化

- 新增 **空间范围（Spatial Extent）** 数据模型，支持 `Polygon` / `MultiPolygon`，并把“法定保护范围”“建设控制地带”“已发表遗址分布范围”分成三种不同语义。
- 地图新增 **“空间范围”** 图层开关。只有 `geometryStatus: verified` 且具有可核验几何的数据才会绘制；纯文字“四至”不会被自动画成看似精确的边界。
- **26 千佛崖造像**：录入山东省 2022 年公布的千佛崖与九顶塔法定保护范围/建设控制地带文字。由于文件明确注明“具体范围以图纸为准”，而当前未取得可核验矢量图纸，两个范围均保持 `text-only`，网页详情显示证据但地图不画 Polygon。
- **31 森木塞姆千佛洞**：依据已发表经纬上下限建立可复算外接矩形，并逐角从 WGS84 转换为 GCJ-02。图层明确标注为 **“已发表遗址分布范围”**，不是国保保护范围，也不是洞窟实际轮廓。
- **46 克孜尔尕哈石窟**：同样把公开经纬上下限转换为研究型范围矩形；继续明确排除附近克孜尔尕哈烽燧。
- 右侧详情新增 **“空间范围证据”**：每条记录显示范围类型、几何状态、文字说明、来源及可用来源链接。
- 新增 `docs/spatial-boundaries.md`，固定“文字证据 ≠ 几何边界”“研究分布范围 ≠ 法定保护范围”的发布规则。

当前空间范围进度：**4 条范围证据记录**，其中 **2 条 verified 研究范围 Polygon**、**2 条 text-only 法定范围记录**；地图默认仍关闭范围图层。

## v0.6 本阶段变化

- **26 千佛崖造像** 完成三组成对象拆分：`26A 千佛崖石窟`、`26B 龙虎塔`、`26C 九顶塔`。父级继续 `unresolved`，三点之间的连线只表示“同属一个国保项目”，**不是保护范围边界**。
- **31 森木塞姆千佛洞** 晋升为遗址群级 `verified` 参考点。公开 WGS84 本体坐标先与“库车东北约40公里、洞窟分布直径约800米”等资料交叉核验，再通过项目内可复算的 WGS84→GCJ-02 转换落入高德坐标系；同时明确排除相距数十公里的冲突网络坐标。
- **33 灵泉寺石窟** 新增 `33A 灵泉寺石窟核心区参考点`；它只代表石窟群核心区，**不冒充大住圣窟或大留圣窟的精确洞口坐标**。
- **46 克孜尔尕哈石窟** 晋升为遗址群级 `verified` 参考点，并把附近的 **克孜尔尕哈烽燧** 明确列为必须排除的相邻不同遗迹。
- 新增 `src/geo/wgs84ToGcj02.ts`，把外部 WGS84 证据转换过程写成可测试、可复算代码，而不是手工抄坐标。
- 地图新增 **“显示组内关系”** 图层：只对至少拥有两个核验点的 `group` 项目绘制虚线，默认关闭；图例持续声明“遗址群组成关系·非保护边界”。

## v0.5 本阶段变化

- **07 响堂山石窟** 从“父级单点”纠正为复合遗址：父级改回 `unresolved`，新增 `07A 北响堂山石窟` 与 `07B 南响堂山石窟` 两个经高德人工核验的组成点；**小响堂**继续待核验。
- **26 千佛崖造像** 改为 `group + mixed`：国保对象同时涉及千佛崖造像、龙虎塔、九顶塔，因此不再允许用“四门塔景区中心”之类的单点冒充整个项目。
- **33 灵泉寺石窟** 改为遗址群模型，现行行政区更新为 **安阳市龙安区**；官方资料显示现存龛窟 230 余座，分布在宝山、岚峰山、马鞍山，后续将优先拆分大住圣窟、大留圣窟等代表性组成点。
- 本阶段的核心目标是**纠正空间语义**：Marker 数从 43 增到 44，但父级 `verified` 数反而从 36 降到 35，因为原来的 07 父级代表点被拆成更准确的 07A/07B。

## v0.4 本阶段变化

- 把 **28 安岳石窟** 改为严格的复合遗址表达：父级继续 `unresolved`，新增 `28A 圆觉洞`、`28B 孔雀洞` 两个高德本体 POI 核验子点。
- 明确 **41 毗卢洞石刻造像** 是展墙独立编号，不重复塞进 28 号子点。
- **45 文殊山石窟** 新增 `45B 文殊山千佛洞`，与既有 `45A 观音堂` 并列。
- 搜索逻辑现在会检索 `subpoints` 的名称和 `父编号+字母后缀`，因此输入“圆觉洞”“孔雀洞”“45B”都能定位到对应父级项目。
- 对 01–47 尚未晋升的重点遗址建立了更细的证据队列，见 `docs/coordinate-queue.md`。

## 地图交互

- 编号 / 名称 / 地区搜索；复合遗址的组成点名称与字母编号也可直接搜索（如“圆觉洞”“45B”）。
- 四大石窟区系、国保批次、类型、宗教属性筛选。
- 默认只显示人工核验点。
- **“检索当前遗址”**：只检索当前选中的 1 个未核验且无本地候选缓存的遗址。地图未就绪、该项已核验或已缓存、或已有检索正在运行时，按钮不可用。
- **“批量检索当前结果 N 项”**：只统计当前筛选后传入地图的 `sites` 中 `coordinateConfidence !== 'verified'` 且无本地候选缓存的项目。点击后先提示“预计调用高德搜索 N 次”，确认后才开始；已缓存项跳过。
- 批量请求串行执行，每次 `PlaceSearch` 完成后至少等待 **450ms** 才发下一次。运行时可点击 **“停止检索”**：已发出的请求可完成并保存候选，剩余项目不再发起；更改当前筛选结果也会停止原批次。
- 每项检索最多等待 **20 秒**。工具栏区分“找到候选 / 无合适结果 / 请求失败 / 检索超时”；失败或超时会结束剩余批量队列，不自动重试。无合适结果时，批量仍按 450ms 间隔继续下一项。
- 停止时会提示等待当前请求返回或达到原有 20 秒上限，再恢复操作。超时只结束应用等待，不保证取消高德已经收到的请求；超时后的迟到回调会被忽略，不会写入缓存或影响下一轮检索。
- 候选保存在当前浏览器的 localStorage。已完成缓存会保留；未产生候选的项目仍可再次手动检索。缓存不会同步到仓库或自动发布。
- “预览候选”模式可临时显示手动检索得到的 `probable` 候选点；候选默认隐藏，不会覆盖人工点，也不会自动升级为 `verified`。
- “显示组内关系”可绘制已核验组成点之间的虚线关系层；**关系线不是遗址范围、保护范围或古代道路**。
- “空间范围”图层只绘制带可靠几何的范围；当前研究型范围与法定保护范围在类型、样式和说明上严格分开。
- Marker、左侧编号索引、右侧详情联动。
- 遗址群组成点使用父级编号 + 字母后缀，如 `32A`、`45A`。
- 详情页保留岩性、造像尺度、毁损、缺失佛首、文献、历史照片和田野记录等后续研究字段。

## 结构

- `src/data/`：112 点规范数据、组成点、空间范围、空间源资产、官方地图提取目标、申遗卷宗页码定位器、远程 PDF 提取计划、GIS 服务发现探针、边界路线决策与获取尝试审计
- `src/features/sites/`：纯搜索 / 筛选逻辑
- `src/map/`：高德 JS API 加载、核验 Marker、候选点解析、遗址群关系线与空间范围 Polygon
- `src/geo/`：WGS84↔GCJ-02 等可复算坐标工具
- `src/georef/`：地图配准数学内核、现代底图控制点 provenance、QA、会话、GeoJSON 与 canonical patch 生成
- `src/components/`：筛选、索引、详情、浏览器配准工作台与内嵌高德控制点取点器
- `docs/coordinate-audit.md`：坐标核验进度与特殊遗址群说明
- `docs/spatial-boundaries.md`：保护范围 / 建设控制地带 / 世界遗产 / 研究分布范围的几何发布规则
- `docs/spatial-source-ledger.md`：空间证据来源等级、坐标系与推导过程台账
- `docs/spatial-asset-registry.md`：官方 PDF / GIS / 法规 / 案例等源资产的处理生命周期与登记规则
- `docs/boundary-acquisition-pipeline.md`：官方地图图页提取、配准与官方 GIS 服务发现的边界采集管线
- `docs/unesco-132728-extraction.md`：UNESCO 132728 下载、检查、页定位、contact sheet 与目标页提取续跑手册
- `docs/unesco-1442-range-extraction.md`：1GB Nomination file 的 HTTP Range 定向抽页、页窗 manifest 与网络预算手册
- `docs/georeference-workbench.md`：控制点、配准 QA、边界数字化与 canonical Polygon 晋升规则
- `docs/canonical-extent-promotion.md`：STRONG QA → human-approved patch → reviewed registry → verified geometry 的人工晋升链
- `scripts/unesco_pdf_pipeline.py`：可执行的 UNESCO PDF 下载 / 定位 / 本地抽页 / HTTP Range 远程抽页工具
- `scripts/apply_reviewed_extent_patch.py`：只接受 human-approved patch 的 canonical reviewed registry 写入工具
- `scripts/unesco_1442_targets.json`：与网页页码定位器锁步的 Nomination file 1442 机器可读页窗
- `docs/service-discovery-audit.md`：Sites Navigator / ArcGIS 服务端点的几何类型、适用范围、环境阻断与边界可用性审计
- `docs/superpowers/specs/`：设计规范
- `docs/superpowers/plans/`：实施计划

## 验证

完整依赖安装后：

```bash
npm test
npm run build
```


PDF 流水线单元测试：

```bash
python scripts/test_unesco_pdf_pipeline.py
python scripts/test_apply_reviewed_extent_patch.py
```

当前环境如果 npm registry 无法访问，也可对不依赖 React/Vite 的核心数据和地图纯函数运行：

```bash
node --experimental-strip-types --test \
  src/data/sites.node.test.ts \
  src/data/spatialSourceAssets.node.test.ts \
  src/data/spatialMapTargets.node.test.ts \
  src/data/spatialServiceProbes.node.test.ts \
  src/data/spatialBoundaryRoutes.node.test.ts \
  src/data/spatialAcquisitionAttempts.node.test.ts \
  src/data/spatialDocumentLocators.node.test.ts \
  src/data/spatialPdfExtractionPlans.node.test.ts \
  src/data/spatialPdfExtractionManifest.node.test.ts \
  src/map/spatialPdfExtractionPlanPresentation.node.test.ts \
  src/map/getMapDisplayPoints.node.test.ts \
  src/map/getVerifiedDisplayPoints.node.test.ts \
  src/map/getGroupRelationLines.node.test.ts \
  src/map/getSpatialExtentPolygons.node.test.ts \
  src/map/spatialExtentPresentation.node.test.ts \
  src/map/spatialSourceAssetPresentation.node.test.ts \
  src/map/spatialMapTargetPresentation.node.test.ts \
  src/map/spatialServiceProbePresentation.node.test.ts \
  src/map/spatialBoundaryRoutePresentation.node.test.ts \
  src/map/spatialDocumentLocatorPresentation.node.test.ts \
  src/geo/wgs84ToGcj02.node.test.ts \
  src/features/sites/filterSites.node.test.ts \
  src/georef/*.node.test.ts
```

## Open source and deployment

This project is open-sourced under the MIT License. See `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, and `DATA_AND_SOURCES.md`.

For deployment, the recommended first path is GitHub → Vercel. See [`docs/deployment.md`](docs/deployment.md).

> Do not commit real AMap keys or security codes. Keep them in local/deployment environment variables.
