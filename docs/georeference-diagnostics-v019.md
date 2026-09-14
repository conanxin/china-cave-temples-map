# v0.19 配准误差向量场与双模型诊断

更新：2026-09-13

## 目的

v0.16 已能回答“配准误差有多大”，v0.18 能把历史边界实时叠加到现代高德底图。v0.19 进一步回答：

> **误差往哪偏？偏差是不是全图一致？是模型不合适，还是控制点布局/质量有问题？**

诊断只影响研究判断，不改变 canonical 晋升流程。

## 1. Check-point 误差向量

误差箭头定义为：

```text
模型预测位置 → 独立 check point 的真实地面位置
```

因此箭头表达的是当前配准模型的预测误差，不是遗址的历史移动、地壳位移、道路变化或任何真实地理运动。

每个向量记录：

- residual distance（m）
- East component（m）
- North component（m）
- bearing（0°=北，90°=东）
- 控制点在原图的粗粒度象限（NW / NE / SW / SE）
- predicted / actual 的 WGS84 与 GCJ-02 坐标

现代高德地图中的线从 predicted GCJ-02 指向 actual GCJ-02。

### 颜色

使用会话当前 `qaThresholds` 的 max residual 阈值：

- `≤ PASS max`：绿色
- `≤ REVIEW max`：琥珀色
- `> REVIEW max`：红色

颜色是研究 QA 提示，不是测绘规范等级。

## 2. 系统偏移 vs 局部畸变

所有 check vectors 被分解成局部东、北米制分量。

### 系统偏移

计算平均向量：

```text
meanEast, meanNorth
systematicMagnitude = hypot(meanEast, meanNorth)
```

同时报告 bearing。

### Directional coherence

定义为：

```text
|mean error vector| / mean(|individual error vector|)
```

范围 0–1：

- 越接近 1：多个 check point 朝近似同一方向偏移；
- 越接近 0：误差方向互相抵消，更像局部形变或控制点问题。

### Local RMS

先去掉全局平均误差向量，再计算剩余局部误差 RMS。

它帮助区分：

- 整幅图整体向东偏约 40m；
- 整体位置没明显偏，但不同区域向不同方向扭曲。

### Pattern

当前启发式输出：

- `stable`
- `global-shift`
- `local-distortion`
- `mixed`

这些名称只是诊断标签，不是正式摄影测量分类。

## 3. 粗粒度热点

v0.19 把原图按中心分成：

```text
NW | NE
---+---
SW | SE
```

每个象限统计 check residual mean。如果某象限至少有2个 check points，且平均残差明显高于全局均值，则显示 `hotspotQuadrant`。

这是**快速现场诊断**，不是 DBSCAN / Moran's I / Getis-Ord Gi* 等正式空间聚类算法。不要把“NE hotspot”写成统计显著的空间聚集结论。

## 4. Affine vs Projective 双模型对照

两种模型必须使用：

- 完全相同的 fit points；
- 完全相同的 independent check points；
- 完全相同的 QA thresholds。

分别报告：

- fit QA
- holdout RMSE / max residual
- leave-one-out
- 当前 boundaryPixels 投影结果
- 两模型对应边界点的 mean / max separation（m）

### 模型建议

输出只有：

- `affine`
- `projective`
- `controls`
- `insufficient`

原则：

1. 少于2个独立 check points → `insufficient`。
2. 两模型都在 holdout 上失败 → 优先 `controls`，不要靠换模型掩盖坏控制点。
3. Affine 与 Projective holdout 基本等价 → 优先更简单的 Affine。
4. Projective 只有在独立 check 明显改善，且 LOO 不失败时才推荐。
5. Projective 恰好4个 fit points 时 LOO 不可用，因此不能只凭“Projective 完美穿过4点”推荐它。

## 5. 高德视觉层

现代地图可以独立开关：

- `误差向量`
- `双模型`

显示语义：

- 红色半透明 Polygon：当前 session.method 的实时草稿边界
- 绿色实线：Affine 对照边界
- 紫色虚线：Projective 对照边界
- 绿/琥珀/红箭头：独立 check point 误差

这三个覆盖层都属于 visual QA。

## 6. Draft GeoJSON provenance

v0.19 新增：

```text
errorPattern
systematicBiasM
systematicBearingDeg
directionalCoherence
localErrorRmsM
modelRecommendation
affineHoldoutRmseM
projectiveHoldoutRmseM
modelBoundaryMeanDivergenceM
modelBoundaryMaxDivergenceM
```

但继续强制：

```text
reviewStatus = draft-unreviewed
```

## 7. 与 canonical 晋升的边界

v0.19 不修改 `assessReviewReadiness()` 的人工晋升语义，也不会自动切换 session.method。

如果诊断建议 `Projective`，研究者必须主动：

1. 查看误差箭头；
2. 查看 Holdout / LOO；
3. 查看两模型边界差异；
4. 手动切换模型；
5. 重新执行拟合与全部 QA；
6. 重新进行 visual review；
7. 最终仍走 v0.17 `human-approved patch` 工作流。

## v0.20 延伸

v0.20 已实现控制点 influence / leverage：逐个移除 fit point 后重新拟合，并比较独立 Holdout、LOO 与边界漂移。它只给“复查优先级”，仍禁止自动删除。详细规则见 `docs/georeference-influence-v020.md`。

后续仍可扩展 true spatial clustering、局部 transformation diagnostics 与 robust/RANSAC 对照，但这些都不能绕过人工审核。
