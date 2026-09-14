# v0.21 Robust / RANSAC 对照诊断

更新：2026-09-13

## 目的

v0.20 已能回答“拿掉某个 fit 控制点后，独立 Holdout 是否明显变好”。v0.21 再增加一个不同视角：

> **如果反复用最小控制点子集建立模型，稳健共识是否持续排除同一个控制点？**

它用于识别“当前普通最小二乘模型可能被少数异常 fit points 拉偏”的情况。

它不会自动删除控制点、自动切换模型、自动替换当前 session.method，也不会改变 canonical 晋升门槛。

## 前置条件

Robust 诊断必须具有模型冗余和独立真值：

- Affine：至少 **5 个 fit points**；
- Projective：至少 **6 个 fit points**；
- 至少 **2 个 independent check points**。

原因是最小样本分别为3点和4点。只比数学最小样本多一个点时，共识诊断仍过于脆弱；因此本项目要求至少多2个 fit points。

## 当前实现：deterministic RANSAC-style consensus

实现文件：`src/georef/robustRansac.ts`。

### 1. 最小样本

Affine 每个 trial 使用3个 fit points；Projective 使用4个。

当前最多检查512个最小样本组合。对于当前实际控制点规模，通常会遍历全部组合，因此结果具有确定性；未来如果控制点大幅增加，可再把采样器升级为固定随机种子的均匀采样。

### 2. Inlier 阈值

当前：

```text
thresholdM = max(10m, session.qaThresholds.passMaxM)
```

因此默认会使用50m。它只是本个人研究项目的启发式共识阈值，不是摄影测量、测绘或文保行业规范。

### 3. Candidate 评分

每个有效 minimal-sample model 会预测全部 fit points。

满足：

```text
residual <= thresholdM
```

的点属于该 candidate 的 inlier set。

首先最大化：

```text
inlier count
```

同 inlier count 时优先：

```text
inlier median residual 更小
```

### 4. Outlier vote

`outlierVoteRate` 只在**最佳 inlier-count 的 elite candidate 集合**中统计：

```text
outlierVoteRate =
该点被 elite candidates 排除的次数 / elite candidate 数
```

当前显示：

- `>= 0.60` → `outlier`
- `<= 0.40` → `inlier`
- 中间 → `ambiguous`

因此它不等于传统统计检验里的概率，也不表示“60%概率这个点是错的”。它只描述稳健共识模型之间的一致性。

## Robust model

根据 elite consensus 重新选择稳健 inlier controls，然后使用**与 session 相同的模型类型**重拟合：

```text
session.method = affine
→ robust affine

session.method = projective
→ robust projective
```

Robust 诊断绝不会暗中把 Affine 改成 Projective，或反过来。

## 独立 Holdout 比较

普通 LS 和 Robust model 使用完全相同的 independent check points。

报告：

```text
baselineHoldoutRMSE
robustHoldoutRMSE
```

只有 check points 决定“Robust 是否泛化更好”。

当前 material-change 提示：

```text
Robust RMSE 至少改善 5m
AND
Robust RMSE <= LS RMSE × 0.75
```

才认为改善具有研究意义。

## Recommendation

输出：

### `review-outliers`

存在稳定 outlier，同时 Robust Holdout 明显改善。

含义：

> 优先重新检查这些控制点。

不等于删除。

### `robust-improves`

Robust Holdout 明显改善，但 elite vote 没有形成稳定单点 outlier。

可能表示多个控制点共同存在小偏差，或普通 LS 对控制点组合较敏感。

### `least-squares`

普通 LS 在 independent checks 上明显优于 Robust。

### `agree`

Robust 与 LS 没有达到 material-change 阈值。

## Boundary divergence

当前 boundaryPixels 同时通过：

- 普通 LS 模型；
- Robust 模型。

逐点计算两套 WGS84 边界的距离，报告：

```text
boundary mean divergence
boundary max divergence
```

高德地图上 Robust 边界显示为**青蓝虚线**。

它只用于 visual QA，不是新 canonical boundary。

## 与 v0.20 Influence 的区别

### Influence

```text
拿掉 CP7
→ 使用其余全部 fit points 重拟合
→ independent checks 是否变好？
```

回答：

> **这个点对普通模型的泛化表现有什么影响？**

### RANSAC consensus

```text
很多 minimal subsets
→ 哪些点持续进入最佳共识？
→ 哪些点持续被最佳共识排除？
```

回答：

> **这个点是否和多数几何一致的控制点不兼容？**

如果某控制点同时满足：

```text
Influence = SUSPECT
RANSAC = OUTLIER
```

则应当成为最高优先级人工复查对象，但仍然不能自动删除。

## 双地图 UI

Robust 诊断出现在：

- 历史图 Marker；
- 高德 Marker；
- 控制点主表；
- Robust / RANSAC 明细表；
- 高德 Robust boundary overlay。

视觉语义：

- RANSAC outlier：紫红警示环；
- ambiguous：紫色虚线环；
- inlier：普通样式；
- Robust boundary：青蓝虚线。

点击 RANSAC 表记录只会修改 `selectedControlId`，不会改变控制点集合。

## Provenance

Draft GeoJSON 新增：

```text
robustAvailable
robustMethod
robustThresholdM
robustTrialCount
robustValidTrialCount
robustOutlierCount
robustTopOutlierId
robustHoldoutRmseM
robustBaselineHoldoutRmseM
robustBoundaryMeanDivergenceM
robustBoundaryMaxDivergenceM
robustRecommendation
```

Canonical patch QA 同样保留核心 Robust 风险旁证。因此即使研究者最终仍然 human-approve，未来也能知道批准时是否存在稳定 RANSAC outlier。

## 与 canonical 晋升的边界

v0.21 **不修改** `assessReviewReadiness()`。

所以：

```text
RANSAC outlier
≠ 自动删除
≠ 自动 FAIL
≠ 自动阻止批准

Robust Holdout 更好
≠ 自动采用 Robust model
≠ 自动晋升边界
```

如果 Robust 与 LS 差异明显，正确步骤是：

1. 双地图检查 outlier 点；
2. 检查 ground provenance；
3. 同时查看 v0.20 Influence；
4. 判断是否存在历史地物迁移、像素误识别、地图局部变形等原因；
5. 人工修正控制点后重新拟合；
6. 重新跑 Holdout / LOO / spatial distribution / area / Influence / RANSAC；
7. 重新生成 draft patch；
8. 最终仍由人工批准。

## 后续

可继续加入：

- Huber / Tukey IRLS，与 RANSAC 做连续权重对照；
- pairwise / multi-point contamination diagnostics；
- RANSAC 阈值敏感性曲线；
- bootstrap boundary uncertainty envelope；
- outlier vote 与图幅局部 hotspot 联合显示。
