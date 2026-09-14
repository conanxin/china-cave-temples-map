# v0.23 局部形变场 / Spatially Varying Residuals

更新：2026-09-13 · v0.23

## 目的

v0.23 不再只问“整张图平均误差多少”，而开始问：

> **误差是否随图幅位置系统变化？某一区域是否持续比其他区域更差？**

这类信号可能来自扫描透视、纸张局部伸缩、折痕、原始制图变形、控制点局部误认，或全局 Affine / Projective 模型本身无法解释的空间变化。

本阶段只做**诊断**。它不会自动创建局部模型、不会自动分区、不会修改 `session.method`，更不会自动晋升 canonical geometry。

## 1. 只使用 Independent Check Points

`analyzeLocalDistortion(session, model)` 只读取：

```text
control.role === check
```

fit points 的训练内 residual 不进入局部形变场。至少需要：

- **4 个 independent check points**；
- 已知历史图 `imageWidth / imageHeight`。

不足时结果明确为 `available: false`。

## 2. 残差定义

每个 check point 的残差来自：

```text
模型预测位置 → check point 真值
```

并转换成局部东向 / 北向米制分量：

```text
eastM
northM
```

v0.23 复用 v0.19 的 `analyzeCheckErrorField()`，因此 residual 方向语义与误差箭头完全一致。

## 3. 一阶残差向量场

历史图 pixel 先归一化到：

```text
x,y ∈ [-1, 1]
```

然后分别拟合：

```text
east(x,y)  = a0 + a1*x + a2*y
north(x,y) = b0 + b1*x + b2*y
```

由此报告：

- `gradientExplainedFraction`：相比“仅整体平移”模型，一阶空间场解释了多少残差平方和；
- `postFieldRmsM`：减去一阶场之后剩余的 RMS；
- `fieldVariationM`：图幅四角预测残差向量之间的最大差异。

### Gradient 指标

项目同时给出：

```text
divergenceM = eastDxM + northDyM
rotationM   = northDxM - eastDyM
shearM      = hypot(eastDxM - northDyM, eastDyM + northDxM)
```

这些只是**归一化图像坐标上的研究诊断量**。单位虽然由米制 residual 构成，但它们不是地球物理 strain、旋度或法定测绘参数，不能脱离本项目模型解释。

## 4. 去掉整体平移再找局部热点

整体向东偏 30m 并不等于“东北角局部变形”。因此 4×4 热区计算时，先从每个 check residual 中减去：

```text
meanEastM
meanNorthM
```

再做 inverse-distance weighting (IDW)。

每个格网 cell 保存：

- east / north residual；
- magnitude；
- supportScore；
- pass / review / fail；
- NW / NE / SW / SE 象限。

### IDW 参数

当前使用固定 **4×4** 网格，权重：

```text
1 / (dx² + dy² + 0.04)
```

`supportScore` 根据最近 check point 的归一化图幅距离计算。

这是一张**探索性 residual heatmap**，不是 kriging、核密度估计、显著性检验或正式空间插值成果。check points 稀疏时不能把格网颜色理解成真实连续纸张形变。

## 5. 四种局部形变模式

### `stable`

独立检查点整体通过当前 PASS 阈值，同时图幅场变化较小。

### `structured-gradient`

一阶空间场解释率较高，并且跨图幅 variation 足够大。典型情形可能是整体拉伸、剪切、透视残留或扫描比例随位置变化。

当前启发式要求：

```text
gradientExplainedFraction >= 0.55
fieldVariationM >= max(15m, PASS_RMSE * 0.6)
```

### `localized-hotspot`

某个局部区域明显高于其他受支持区域，但一阶全局梯度不足以解释它。

当前启发式包括：

```text
hotspot magnitude >= max(20m, PASS_RMSE * 0.8)
hotspot contrast >= 1.7
gradientExplainedFraction < 0.72
```

### `irregular`

存在明显空间误差，但既不能简单归为稳定、平滑梯度，也没有足够清晰的单一局部热点。

所有阈值都是**个人研究工作流启发式**，不是国家测绘、摄影测量或文物保护技术标准。

## 6. 跨模型持久性

v0.23 不只分析当前 LS 模型。只要对应模型可用，还会对以下模型使用同一批 independent check points：

- Affine
- Projective
- RANSAC robust model
- Huber IRLS
- Tukey IRLS

随后由 `compareLocalDistortionAnalyses()` 给出研究建议。

### `global-model-sufficient`

当前全局模型已经稳定，无需提高模型复杂度。

### `prefer-projective`

Projective 把 Affine 留下的空间残差场明显消除，并达到当前 PASS 水平。优先考虑全局 Projective，而不是立即上局部模型。

### `review-controls`

RANSAC / Huber / Tukey 中至少一个稳健模型消除了 LS 的局部异常。优先回头检查 fit point，而不是把问题归咎于纸张局部形变。

### `consider-piecewise`

只有当：

- 至少 3 个可比较模型仍是 non-stable；
- 多数 non-stable 模型持续指向同一 NW / NE / SW / SE 热点；
- 最佳模型的独立检查点平均残差仍高于 PASS；

才提示：

> **考虑人工评估分区配准**

它仍然不是“自动采用分区模型”的指令。

### `inspect-local-distortion`

证据混合，需要更多 check points 或人工查看热点。

### `need-more-checks`

没有足够独立检查点完成诊断。

## 7. 为什么不直接自动做 Piecewise Registration

局部模型自由度极高。对于历史地图，很容易出现：

> 控制点附近看起来非常准，但边界在没有检查点的区域产生不受约束的扭曲。

因此 v0.23 只回答：

> **是否已经有充分证据说明“继续换一个全局模型”可能不够？**

真正的分区模型必须作为下一阶段单独设计，并至少解决：

- 分区如何产生；
- 区域间连续性；
- seam / fold-over；
- 每一区域独立 check points；
- 区域外 extrapolation；
- 与全局模型的 Holdout 对照。

## 8. UI 语义

历史图新增 **「局部形变场」**开关。

4×4 cell 使用当前 QA 阈值：

- pass：绿色；
- review：琥珀；
- fail：红色。

透明度同时受 `supportScore` 影响，远离独立 check points 的 cell 会减弱显示。

右侧 QA 显示：

- pattern；
- gradient explained %；
- field variation；
- post-field RMS；
- divergence / rotation / shear；
- hotspot；
- Affine / Projective / Robust / Huber / Tukey 对照；
- cross-model recommendation。

## 9. Provenance

Draft GeoJSON 与 canonical patch QA 保存：

```text
localDistortionPattern
localDistortionGradientExplainedFraction
localDistortionPostFieldRmsM
localDistortionFieldVariationM
localDistortionHotspotRegion
localDistortionRecommendation
localDistortionBestModelId
localDistortionPersistentHotspotRegion
localDistortionPiecewiseSuggested
```

即使人工最终仍然批准某条边界，这些风险旁证也不会消失。

## 10. Canonical 安全边界

v0.23 **不修改** `assessReviewReadiness()`。

因此：

```text
localized-hotspot != 自动 FAIL
consider-piecewise != 自动采用局部模型
structured-gradient != 自动切 Projective
稳定热区 != 自动 STRONG
```

真正晋升仍然必须经过：

```text
来源审核
→ independent Holdout / LOO
→ 空间分布 / 面积
→ visual QA
→ Influence / RANSAC / IRLS / local-distortion 旁证
→ STRONG
→ 精确人工批准令牌
→ reviewed registry
→ canonical verified geometry
```
