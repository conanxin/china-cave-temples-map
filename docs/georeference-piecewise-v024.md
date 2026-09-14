# v0.24 Piecewise / Segmented Registration 候选模拟

更新：2026-09-13 · v0.24

## 目的

v0.23 只能判断局部形变是否持续存在。v0.24 增加分区配准的**候选模拟**，回答：如果把图幅分成简单区域，各自使用局部 Affine，独立 check point 是否显著改善，而且分区接缝是否仍然连续？

这不是正式分区配准实现，也不会改变 canonical readiness。

## 当前候选布局

- `vertical-2`：2×1 左右分区。
- `horizontal-2`：1×2 上下分区。
- `quadrants-4`：2×2 四象限。

每个局部区域只允许 **Affine**。这样可以把“需要分区”与“继续提高局部模型自由度”分开研究。

## 发布门槛

候选区域必须：

1. 每区至少3个 `fit` 控制点；
2. 每区至少1个 independent `check` point；
3. 所有区 Affine orientation 一致，不出现 fold-over；
4. 使用独立 check points 计算 Piecewise Holdout；
5. 沿分区 seam 抽样比较相邻局部模型在相同 pixel 的预测坐标。

### 推荐规则（项目启发式）

`promising`：
- Holdout 比全局模型改善 ≥25%；
- Piecewise Holdout 不为 FAIL；
- seam 最大跳变 ≤ 当前 PASS max residual；
- 无 fold-over。

`review`：
- 改善 ≥10%；
- seam ≤ REVIEW max residual；
- 无 fold-over。

否则为 `reject`。

这些阈值是研究工作流启发式，不是测绘规范。

## Seam continuity

Seam 指相邻局部模型在分区边界的空间不连续。系统沿分割线取多个相同 pixel，分别投影到两侧局部 Affine，计算两预测坐标的米制距离。

即使每个分区内部 Holdout 很好，只要 seam 出现上百米跳变，也必须拒绝。

## Fold-over

每个局部 Affine 都计算二维 Jacobian determinant 的符号。不同分区 orientation sign 不一致，或 determinant 接近0，视为 fold-over 风险。

它是几何拓扑检查，不是完整局部变形证明。

## 与 v0.23 的关系

`consider-piecewise` 只有在局部形变已经跨多个全局/稳健模型持续存在时才特别值得关注；但 v0.24 自身仍会独立计算候选。

Piecewise 候选更好不意味着自动采用局部模型。正式分区配准还需要：

- 更密集的每区独立 check points；
- seam 连续性人工检查；
- 边界跨 seam 的连续性 QA；
- 分区模型外推风险评估。

## Provenance

Draft GeoJSON 与 human-approved canonical patch 会保存：

- `piecewiseRecommendation`
- `piecewiseBestLayout`
- `piecewiseBestHoldoutRmseM`
- `piecewiseBestSeamMaxM`
- `piecewiseBestFoldOverRisk`

但这些字段只是风险/诊断旁证，不改变 `reviewStatus` 或 `assessReviewReadiness()`。
