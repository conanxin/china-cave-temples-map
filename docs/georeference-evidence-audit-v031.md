# v0.31 Evidence Audit / Calibration Provenance

## 目的

v0.29–v0.30 已经允许 fit/check 控制点分别拥有 `pixelEvidence / groundEvidence / σ`，但仅有一个数值或 evidence category 仍然不能回答：

> **这个 σ 为什么是 2m、5m、15m？它来自哪份原始证据？谁复核过？**

v0.31 增加 uncertainty claim 的可追溯审计层。它不改变配准数学，只把“误差假设的依据”变成结构化、可保存、可审核的数据。

## 新增 provenance 字段

每个 `GeoreferenceControlPoint.uncertainty` 可以保存：

- `evidenceRef`：URL、档案号、GIS layer id、GPS log、扫描页码等可追溯标识；
- `evidenceDate`：证据产生或核验日期；
- `calibrationBasis`：`metadata / measured / heuristic / manual-override`；
- `reviewStatus`：`unreviewed / reviewed`；
- `reviewedAt`：人工复核时间；
- `note`：σ 的计算、比例尺、DPI、设备或人工判断说明。

旧 session 没有这些字段时继续兼容。

## 四级审计等级

### `fallback`

控制点没有显式 uncertainty evidence，也没有可推断来源，继续使用旧版 fallback（例如 1.5px / 10m）。

### `heuristic`

已经选择 evidence category、由 AMap 来源推断，或人工输入了显式 σ，但**没有 traceable `evidenceRef`**。

重要原则：

> `groundEvidence = official-survey-gis` 本身并不能证明真的存在官方 GIS 原件。

因此默认表和手工 override 都不会自动冒充 evidence-backed。

### `evidence-backed`

存在非空 `evidenceRef`。这说明 uncertainty claim 已经能够追溯到某个原始来源或研究材料。

若有 `calibrationBasis`，系统同时记录 σ 是来自元数据、直接测量、启发式换算还是人工 override。

### `reviewed`

必须至少满足：

- traceable `evidenceRef`；
- `calibrationBasis`；
- `reviewStatus = reviewed`。

工作台在人工切换到 reviewed 时自动记录 `reviewedAt`。

这里的 reviewed 只表示：

> **“这个 uncertainty claim 已经被人工复核。”**

它不代表控制点坐标本体已经 verified，也不代表边界可以 canonical 晋升。

## Audit summary

工作台会分别汇总：

- total / fit / check controls；
- fallback 数；
- heuristic 数；
- evidence-backed 数和比例；
- reviewed 数和比例；
- fit evidence-backed 数；
- check evidence-backed 数；
- 当前最低审计等级控制点（weakest controls）。

如果某些控制点仍然是 fallback，它们会被列为优先补证对象，而不是自动删除或降权。

## 工作台编辑流

主控制点表继续负责：

- fit/check role；
- pixel / WGS84；
- evidence category；
- σ 数值。

选中任一控制点后，下方的 **Uncertainty evidence audit** 面板负责：

- evidenceRef；
- evidenceDate；
- calibrationBasis；
- reviewStatus；
- reviewedAt；
- calibration note。

这样“误差数字”和“为什么相信这个数字”不会挤在同一张横向表中。

## Session 校验

v0.31 parser 新增：

- 非法 `calibrationBasis` 拒绝导入；
- 非法 `reviewStatus` 拒绝导入；
- 空白 `evidenceRef` 拒绝导入；
- 无效 `evidenceDate / reviewedAt` 拒绝导入；
- provenance 可以完整 serialize / parse round-trip。

## GeoJSON / Canonical provenance

Draft GeoJSON 与 human-approved canonical patch 保存：

- `uncertaintyAuditEvidenceBackedCount`
- `uncertaintyAuditReviewedCount`
- `uncertaintyAuditFallbackCount`
- `uncertaintyAuditHeuristicCount`
- `uncertaintyAuditEvidenceBackedRatio`
- `uncertaintyAuditReviewedRatio`
- `uncertaintyAuditFitEvidenceBackedCount`
- `uncertaintyAuditCheckEvidenceBackedCount`
- `uncertaintyAuditWeakestControlIds`

完整的逐点来源仍保存在 georeference session JSON 中。

## 不改变的安全边界

v0.31 **不会**：

- 因 evidence-backed 比例高而提高 `assessReviewReadiness()`；
- 因 reviewed 而把控制点坐标变成 verified；
- 因缺少 evidenceRef 自动删除控制点；
- 因 heuristic 自动降低模型权重；
- 自动批准 canonical polygon。

Evidence Audit 的作用是：

> **让研究者知道哪一个 σ 有依据，依据是什么，哪些地方仍然只是默认假设。**
