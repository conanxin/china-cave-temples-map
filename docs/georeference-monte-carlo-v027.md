# v0.27 Monte Carlo / Bootstrap 不确定性传播

## 目标

v0.27 不再只问“哪个配准模型平均表现更好”，而是进一步问：

> 如果控制点位置本身存在合理的小幅误差，模型选择和数字化边界会不会明显变化？

这一阶段把控制点误差作为输入假设，通过重复扰动与重拟合传播到模型胜负和边界位置。它是研究敏感性分析，不是正式测绘精度评定，也不是统计学意义上的法定置信区间。

## 默认模拟设置

默认每次分析运行 200 次 trial，使用固定随机种子 `27027`，因此同一个 session 在输入不变时可完全复现。

每个 trial 只扰动 `fit` 控制点：

- 图像像素位置：二维独立 Gaussian，σ = 1.5 px；
- 地面 WGS84 坐标：东西/南北二维独立 Gaussian，σ = 10 m；
- `check` 控制点完全不扰动，继续作为独立外部真值。

这些 σ 是项目研究默认值，不表示某张 UNESCO 图、某个高德点击点或某个具体控制点的真实测量标准差。未来取得扫描分辨率、地图比例尺、控制点来源精度后，应按证据更新。

## 每个 trial 比较哪些模型

每次扰动后同时重新拟合：

1. Global Affine（6 参数）
2. Global Projective（8 参数）
3. Piecewise 2×1（12 参数）
4. Piecewise 1×2（12 参数）
5. Piecewise 2×2（24 参数）

模型只使用扰动后的 `fit` 点拟合，胜负只使用固定 `check` 点计算 Holdout RMSE。

为了延续 v0.26 的复杂度约束，trial 选择分数为：

`adjusted score = holdout RMSE × (1 + complexity surcharge / 100)`

其中 surcharge 仍采用：

`5 × log₂(parameterCount / 6)%`

因此 Monte Carlo 的“获胜频率”不是单纯按训练拟合优度统计，而是经过独立 check 与轻度复杂度约束后的模型稳定性指标。

## 输出指标

### 模型稳定性

每个候选模型记录：

- `validTrials`
- `wins`
- `winRate`
- `meanHoldoutRmseM`
- `meanAdjustedScoreM`

总结果记录 winner、runner-up 和两者胜率。

### 当前边界不确定性

边界位置不确定性只对当前 `session.method`（Affine 或 Projective）传播，不自动使用 Monte Carlo 获胜模型替换当前模型。

对每一个 `boundaryPixels` 顶点：

1. 用未扰动 fit points 拟合 baseline；
2. 每个 trial 用扰动 fit points 重拟合当前模型；
3. 计算 trial 顶点位置相对 baseline 的球面距离；
4. 汇总 P50、P95、最大观测位移。

边界段的不确定性由相邻顶点 P95 汇总，并自动标记 P95 最大的“最不稳定边界段”。

### 高德视觉层

现代高德底图新增：

- 每个边界顶点的 P95 半径圆；
- 最不稳定边界段高亮线；
- 开关 `P95不确定性`。

GCJ-02 只用于显示；Monte Carlo 统计本身基于 WGS84。

## 推荐语义

当前只输出四种研究型建议：

- `global-stable`：某个全局模型在扰动下稳定占优；
- `piecewise-stable`：某个 Piecewise 模型在扰动下稳定占优；
- `model-uncertain`：winner 与 runner-up 胜率接近，模型选择对控制点误差敏感；
- `boundary-uncertain`：当前边界 P95 已超过现有 review 最大阈值。

这些建议不会修改：

- `session.method`
- fit/check 角色
- 控制点内容
- `assessReviewReadiness()`
- canonical patch 的人工批准要求

## Provenance

Draft GeoJSON 与 canonical patch 会保存：

- Monte Carlo trials / successful trials
- seed
- pixel sigma / ground sigma
- winner / runner-up model
- winner / runner-up rate
- recommendation
- boundary mean/max P95
- maximum observed boundary displacement
- most unstable boundary segment

因此未来人工批准某个边界后，仍然可以追溯当时模型和边界对控制点误差假设是否敏感。

## 统计边界

特别注意：本阶段的 P95 是“在当前模拟误差模型下，200 次重复扰动得到的经验 95 分位数”。它不是：

- 法定测绘 95% 置信区间；
- Bayesian posterior credible interval；
- UNESCO 官方边界精度声明；
- 对真实控制点误差分布的直接观测。

如果误差不是独立 Gaussian，例如扫描图存在系统性纸张变形、所有高德点共享方向性偏差、同一图幅局部控制点误差相关，则当前 P95 可能低估或错估真实不确定性。

## 与前序阶段的关系

- v0.20 Influence：单点删除后泛化是否改善；
- v0.21 RANSAC：硬共识下哪些点反复成为 outlier；
- v0.22 IRLS：连续降权后模型如何变化；
- v0.23 Local distortion：误差是否具有空间结构；
- v0.24–v0.25 Piecewise：局部分区模型是否值得研究、视觉上是否连续；
- v0.26 Spatial CV：Piecewise 是否跨空间块泛化并经得起复杂度惩罚；
- **v0.27 Monte Carlo**：上述模型选择和最终边界对控制点位置误差是否稳定。

只有这些证据共同指向同一结论，才值得进入后续人工地理配准审核；没有任何一项可以单独触发 canonical 晋升。
