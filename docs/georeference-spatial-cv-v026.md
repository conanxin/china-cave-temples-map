# v0.26 Spatial Holdout / Complexity Penalty

更新：2026-09-13 · v0.26

## 目标

v0.24–v0.25 已经可以发现局部形变、模拟 Piecewise Affine，并在历史图/高德底图上检查 seam 与 fold-over。但“Piecewise 看起来更贴合”仍不足以证明它更可靠：局部模型参数更多，本来就更容易贴住有限控制点。

v0.26 增加 **spatial block cross-validation + complexity adjustment**，专门回答：

> Piecewise 的收益能否在从未参与本轮拟合的空间块中继续存在？如果考虑参数复杂度后，分区模型还值得继续研究吗？

这仍然是研究诊断，不是自动模型选择器，也不是正式测绘精度认证。

## 1. 3×2 spatial block holdout

图幅固定划分为 **3列 × 2行**。每个 `fit` 控制点根据像素位置只属于一个空间块。

对每个非空空间块：

1. 将该块内全部 `fit` 点暂时移出训练集；
2. 用其余 `fit` 点重新拟合候选模型；
3. 只用被移出的点计算该 fold 的 RMSE / max residual；
4. 下一轮换另一个空间块；
5. 所有 fit 点必须被预测 **恰好一次**。

因此这里与普通随机 K-fold 不同：同一区域的点会成组被留出，更容易暴露“模型只在已有控制点附近准确”的空间过拟合。

### 严格 coverage 原则

候选只有在 **所有非空空间 fold 都能完成重拟合，并覆盖 100% fit points** 时，才标记为 `available`。

Piecewise 候选不会因为某个困难空间块无法重拟合，就跳过该块只报告容易部分。如果某一 fold 导致任一局部区域少于3个训练 fit points，该 Piecewise 模型直接标为 cross-validation unavailable。

## 2. 比较的五套模型

同一套 spatial folds 比较：

- Global Affine：6 parameters
- Global Projective：8 parameters
- Piecewise 2×1：2 × Affine = 12 parameters
- Piecewise 1×2：2 × Affine = 12 parameters
- Piecewise 2×2：4 × Affine = 24 parameters

每个局部模型仍固定为 Affine。v0.26 不在局部区域叠加 Projective，以免同时增加“分区”和“模型阶数”两个自由度，失去可解释性。

## 3. Complexity adjustment

当前使用透明、固定的项目启发式：

```text
complexitySurchargePercent = max(0, 5 × log2(parameterCount / 6))
adjustedCvRmseM = cvRmseM × (1 + complexitySurchargePercent / 100)
```

对应约为：

| 模型 | 参数数 | surcharge |
| --- | ---: | ---: |
| Global Affine | 6 | 0% |
| Global Projective | 8 | 2.1% |
| Piecewise 2×1 | 12 | 5% |
| Piecewise 1×2 | 12 | 5% |
| Piecewise 2×2 | 24 | 10% |

这个 surcharge **不是 AIC、AICc、BIC，也不是统计显著性检验**。它只是要求更复杂的模型提供可观测的空间泛化收益，而不是凭参数数量占便宜。

## 4. 参数支持度

对每个 fold 还记录最低训练支持度：

```text
supportRatio = 观测方程数 / 参数数
             = 2 × fitPointCount / parameterCount
```

对于局部 Affine：

- 3点 = 6个观测 / 6参数 = `1.00`，只是刚好可解；
- 4点 = `1.33`，开始存在冗余；
- 更多点提供更强约束。

`piecewise-supported` 要求最弱 fold 的 `minTrainingSupportRatio >= 1.33`。刚好3点可解的局部模型仍可显示，但不能获得最强推荐。

## 5. Fold 稳定性

每个模型报告：

- overall spatial-CV RMSE / max residual；
- fold RMSE mean；
- fold RMSE standard deviation；
- `foldStabilityRatio = std / mean`；
- worst fold ID，例如 `r1c2`。

最强 Piecewise 推荐要求：

```text
foldStd <= max(10m, foldMean × 0.75)
```

这仍是项目启发式。目的不是证明统计稳定，而是阻止“只有某几个空间块极准、另一些区域很差”的候选被轻易升级。

## 6. Independent check points 仍然独立

Spatial CV 使用的是原本的 `fit` points，通过空间留块把它们临时变成 pseudo-holdout。

真正标记为 `check` 的控制点：

- 从不参与 Spatial-CV 训练；
- 不参与任何 full-model 拟合；
- 仍然作为第二层、真正独立的外部验证。

因此 v0.26 有两种不同证据：

1. **Spatial block CV**：模型能否从其他空间区域外推回来；
2. **Independent checks**：从未进入任何拟合的点是否也支持结论。

二者不能混为一谈。

## 7. Recommendation

### `piecewise-supported`

必须同时满足：

- complexity-adjusted spatial-CV improvement ≥ 15%；
- v0.24 Piecewise candidate 没有 fold-over；
- seam max ≤ 当前 `reviewMaxM`；
- Piecewise independent Holdout 不是 fail；
- fold-to-fold 稳定；
- `minTrainingSupportRatio >= 1.33`；
- independent checks 同样支持 Piecewise（若存在可比较结果）。

这只表示：**分区模型值得进入下一轮人工研究**。

### `piecewise-review`

complexity-adjusted gain ≥ 5%，且基本 seam/fold-over 安全门通过，但稳定性、参数冗余或 independent checks 仍不足。

### `overfit-risk`

v0.24 当前 check points 看起来支持 Piecewise，但 spatial block CV 的 complexity-adjusted gain < 5%。这提示：现有分区收益可能依赖特定控制点布置。

### `global-preferred`

全局模型已经近乎完美，或 Piecewise 无法保留足够的 complexity-adjusted spatial-CV 收益。

### `insufficient`

没有足够 fit points / 图像尺寸，或没有全局模型能够完成全空间 fold 验证。

## 8. UI

工作台新增 **Spatial CV + Complexity** 卡片和完整模型表，显示：

- model / parameter count；
- raw Spatial CV RMSE；
- adjusted RMSE；
- full fold coverage；
- fold std / coefficient of variation；
- worst fold；
- independent check RMSE；
- 最终研究建议。

## 9. Provenance

Draft GeoJSON 和 Canonical patch 会保存：

- Spatial CV 是否可用；
- recommendation；
- best global model；
- best Piecewise model；
- raw / adjusted improvement；
- best global / Piecewise CV RMSE；
- Piecewise adjusted RMSE；
- worst fold；
- complexity surcharge；
- minimum training support ratio。

这些字段是审核旁证。即使人工最终批准边界，也保留当时模型复杂度与空间泛化证据。

## 10. 明确不做的事

v0.26 **不会**：

- 自动修改 `session.method`；
- 自动把 Piecewise 设为正式配准模型；
- 自动移动、删除或降权控制点；
- 修改 `assessReviewReadiness()`；
- 因 `piecewise-supported` 自动生成 verified Polygon；
- 绕过 v0.17 的精确人工批准令牌与 reviewed registry。

Spatial CV 回答的是“复杂模型是否值得继续研究”，不是“它已经可以发布”。
