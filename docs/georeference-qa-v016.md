# v0.16 配准可信度 QA

更新：2026-09-13

## 目的

v0.15 已经能够拟合地图并报告参与拟合控制点的 residual，但**训练内 residual 不能单独说明配准结果在图幅其他位置是否可靠**。v0.16 加入独立检查点、Leave-one-out、空间分布和面积一致性四层 QA。

所有结果仍属于个人研究工作流。它们不是国家测绘规范、法定精度等级或 UNESCO 官方验收规则，也不会自动把任何草稿 Polygon 晋升为 canonical `verified`。

## 1. 拟合点与独立检查点

控制点现在有两种角色：

```ts
role: 'fit' | 'check'
```

- `fit`：参与 Affine / Projective 参数求解；
- `check`：**不参与拟合**，仅使用拟合完成后的模型预测其位置。

建议至少放置 **2 个独立 check points**，并尽量让它们与 fit points 空间错开。若检查点也是为了拟合而挑选或微调过，其“独立”意义会下降。

工作台分别报告：

- fit RMSE / max residual；
- holdout RMSE / max residual；
- holdout PASS / REVIEW / FAIL。

Holdout 使用与 fit residual 相同的可编辑米制阈值，但二者在 UI 和 GeoJSON 中分开保存。

## 2. Leave-one-out（LOO）

LOO 对每一个 `fit` 点执行：

1. 暂时移除该点；
2. 使用其他 fit points 重新拟合；
3. 预测被移除点；
4. 记录预测误差；
5. 对所有遗漏结果计算 RMSE 与最大残差。

最低点数：

- Affine：至少 **4 个 fit points**；
- Projective：至少 **5 个 fit points**。

因此 Projective 恰好 4 点时，即使训练 residual 接近 0，工作台仍会明确显示：

> LOO unavailable — requires at least 5 fit points.

LOO 不是独立外部真值，它主要检查**模型是否过度依赖某一个控制点、控制点体系是否稳定**。

## 3. 控制点空间分布评分

只评估 `fit` 点，并要求已知原图像素宽高。

项目计算：

- `xSpanRatio`：控制点 X 方向跨度 / 图像宽度；
- `ySpanRatio`：控制点 Y 方向跨度 / 图像高度；
- `hullAreaRatio`：控制点凸包面积 / 图像面积。

启发式评分：

```text
spanCoverage = sqrt(xSpanRatio * ySpanRatio)
hullCoverage = min(1, hullAreaRatio * 2)
score = 100 * (0.6 * spanCoverage + 0.4 * hullCoverage)
```

判定：

| Score | Verdict |
|---:|---|
| ≥65 | GOOD |
| 35–64 | REVIEW |
| <35 | POOR |

这是**项目启发式评分**，仅用于提示“控制点是否挤在图的一小块区域”，不代表统计置信度或法定测绘精度。

## 4. 数字化 Polygon 面积 vs 官方面积

当当前 `SpatialMapTarget` 关联的 `SiteSpatialExtent` 存在 `areaHa` 时，工作台可以选择：

- World Heritage Property；
- World Heritage Buffer；
- 或未来其他带官方面积的范围。

数字化边界转换为 WGS84 后，项目使用球面多边形面积近似计算 `computedAreaHa`，再比较：

```text
differencePercent = abs(computedAreaHa - officialAreaHa) / officialAreaHa * 100
```

默认研究提示：

| 差异 | Verdict |
|---:|---|
| ≤5% | PASS |
| ≤15% | REVIEW |
| >15% | FAIL |

面积一致只能说明**数量级/整体尺度**较合理。一个位置完全错置、但面积碰巧相同的 Polygon 仍然可以通过面积检查，因此面积绝不能替代空间位置 QA。

## 5. 进入人工边界审核建议

`assessReviewReadiness()` 只给出研究工作流建议：

### `INSUFFICIENT`

任一关键能力缺失，例如：

- 少于2个独立 check points；
- LOO 不可用；
- 图像尺寸缺失导致空间分布不可评估；
- 已描边且存在官方面积，但面积比较尚未完成。

### `FAIL`

存在明确失败：

- holdout FAIL；
- LOO FAIL；
- 控制点空间分布 POOR；
- 面积差异 FAIL。

### `REVIEW`

没有 FAIL，但至少有一个指标处于 REVIEW。

### `STRONG`

所需独立 QA 全部存在并通过。

**STRONG 仍不意味着 verified。** 它只表示这份草稿值得进入下一步人工审查：检查原图身份、source asset SHA-256、控制点真实性、边界语义、现代底图叠加和官方面积。

## 6. GeoJSON provenance

v0.16 导出的草稿 Feature properties 增加：

```text
boundaryExtentId
checkPointCount
holdoutRmseM
holdoutMaxResidualM
holdoutVerdict
looAvailable
looRmseM
looMaxResidualM
looVerdict
spatialDistributionScore
spatialDistributionVerdict
officialAreaHa
computedAreaHa
areaDifferencePercent
areaVerdict
reviewStatus=draft-unreviewed
```

这些字段用于人工复查和后续 provenance 保存，不触发任何自动写回。

## 7. 推荐的麦积山首次实战配置

当 `pp.4178–4180` 图页真正提取出来后：

1. 优先使用官方格网交点作为 fit points；
2. Affine 至少 6 个、Projective 至少 8 个 fit points；
3. 额外保留至少 2–4 个格网或稳定地物点作为 `check`；
4. fit / check 都应覆盖图幅不同区域；
5. 先拟合并观察 Holdout + LOO + 分布评分；
6. 再选择 `05-wh-property` 或 `05-wh-buffer` 描边；
7. 与 UNESCO 483.71 ha / 1,259.28 ha 做面积比对；
8. 只有经过现代底图人工叠加检查后，才考虑制作 canonical extent patch。
