# v0.20 控制点 Influence / Leverage 诊断

更新：2026-09-13

## 目的

v0.19 能判断“误差往哪里偏、Affine 还是 Projective 更合适”。v0.20 继续回答：

> **当前配准异常，是不是被某一个 fit 控制点强烈牵着走？**

核心做法是逐点敏感性实验，而不是自动异常点剔除。

## 前置条件

Influence 诊断必须同时满足：

- 至少 2 个独立 `check` points；
- Affine 至少 4 个 `fit` points；
- Projective 至少 5 个 `fit` points。

原因：每次都必须拿掉一个 fit point 后重新拟合。如果只保留数学最小点数，就无法对每个点做可比较的删除实验。

## 计算过程

先用全部 fit points 拟合 baseline model，并只在 check points 上计算：

```text
baselineHoldoutRMSE
```

然后对每个 fit point `CPi`：

```text
remove CPi
→ refit same model type
→ evaluate same independent check points
→ compare omittedHoldoutRMSE with baseline
→ reproject current boundaryPixels
→ compare boundary shift with baseline boundary
→ run LOO on the remaining fit points when available
```

每个点记录：

- baseline Holdout RMSE
- omitted Holdout RMSE
- Holdout improvement（m）
- Holdout improvement（%）
- boundary mean shift（m）
- boundary max shift（m）
- omitted-model LOO 状态

## 当前启发式分类

阈值只是本个人研究项目的提示规则，不是测绘规范：

### `suspect`

移除该点后：

```text
Holdout RMSE 至少下降 5m
AND
下降比例至少 25%
```

界面显示：

> `SUSPECT · 复查`

它的含义只是：**这个点值得优先核查**。

可能原因包括：

- 历史图 pixel 点错位；
- 现代地物对应错误；
- 地物本身历史时期已迁移；
- GCJ-02 / WGS84 provenance 被手工修改；
- 图幅局部有变形；
- 该点虽“正确”，但与当前模型假设不兼容。

因此系统绝不自动删除。

### `supportive`

移除该点后：

```text
Holdout RMSE 至少上升 5m
AND
上升比例至少 25%
```

表示它当前对独立检查点表现有明显支撑作用，但**不是“绝对正确”认证**。

### `neutral`

删除后 Holdout 变化没有达到上述显著阈值。

## Leverage：边界漂移

`boundaryMeanShiftM / boundaryMaxShiftM` 衡量拿掉该点后，当前数字化边界在两个模型之间移动了多少。

它回答：

> **这个 fit point 对最终边界形状/位置有多强的控制力？**

Leverage 与异常是两回事：

- 高 leverage + Holdout 改善 → 高优先级 suspect；
- 高 leverage + Holdout 恶化 → 可能是关键 supportive point；
- 高 leverage + Holdout 基本不变 → 模型结构对该点敏感，需要人工解释。

因此 boundary shift **不直接参与** suspect/supportive 分类。

## 与 LOO 的区别

LOO：

> 拿掉一个 fit point，用其他 fit points 预测被拿掉的这个 fit point。

Influence：

> 拿掉一个 fit point，用**独立 check points**判断整个模型是否变好/变坏。

两者互补。LOO 更像内部交叉验证，Influence 更关注控制点对独立验证性能和最终边界的影响。

## 双地图 UI

Influence 结果同时出现在：

- 历史图 Marker；
- 高德现代地图 Marker；
- 控制点主表；
- Influence / Leverage 明细表。

颜色：

- suspect：红色警示环；
- supportive：绿色支撑环；
- neutral：保持普通 fit 样式。

点击明细表中的点只会设置 `selectedControlId`，联动两幅地图查看。没有“一键删除”动作。

## Provenance

Draft GeoJSON 新增汇总字段：

```text
controlInfluenceAvailable
controlInfluenceTopSuspectId
controlInfluenceSuspectCount
controlInfluenceSupportiveCount
controlInfluenceMaxHoldoutImprovementM
controlInfluenceMaxBoundaryShiftM
```

Canonical patch QA 也保存同类风险旁证。因此即便研究者最终人工批准，未来仍能知道晋升时是否存在高影响可疑控制点。

## 与 canonical 晋升的边界

v0.20 不改变 `assessReviewReadiness()`。

所以：

```text
SUSPECT 存在
≠ 自动 FAIL
≠ 自动删除
≠ 自动禁止 human approval
```

审核者必须：

1. 双地图重新检查该点；
2. 检查 ground provenance；
3. 查看移除前后 Holdout；
4. 查看 boundary shift；
5. 查看 LOO；
6. 决定是否修正、删除或保留；
7. 如果控制点改变，必须重新拟合、重新跑全部 QA，再重新生成 patch。

## 后续

下一阶段可以继续加入：

- robust fitting / RANSAC 对照，但默认只做诊断、不自动替换模型；
- jackknife 参数稳定性；
- 控制点组合敏感性（pairwise removal）；
- Influence 与空间 hotspot 联合分析。
