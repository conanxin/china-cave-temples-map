# v0.30 Uncertain Ground Truth / Check-point Uncertainty

## 目标

v0.29 已经允许每个 `fit` 控制点拥有独立的图像 σ 与地面 σ，但 `check` 控制点仍被视为“完全正确的固定真值”。v0.30 拆掉这个过强假设：**check 点仍然固定、不参与拟合，但允许带自己的证据等级与不确定性 profile。**

核心问题从：

> 模型离 check 点多少米？

扩展为：

> 这个 residual 相对于该 check 自身的证据精度，到底是正常、可疑，还是明显冲突？

## 1. Fit / Check 严格分层不变

v0.30 不会让 check points 进入训练集。

- `fit` 点：参与 Affine / Projective / Piecewise 拟合，也可在 Monte Carlo 中被扰动；
- `check` 点：坐标始终固定，不参与任何拟合，也不在 Monte Carlo trial 中随机移动；
- check uncertainty 只影响**验证解释层**，不影响模型参数。

因此不存在“训练点和验证点一起抖，导致验证失去独立性”的问题。

## 2. Check 继续复用 v0.29 evidence profile

check 点与 fit 点使用同一套 `uncertainty` 元数据：

- `pixelEvidence`
- `groundEvidence`
- `pixelSigmaPx`
- `groundSigmaM`
- `note`

图像侧仍使用：

- exact-corner
- clear-feature
- fuzzy-feature
- approximate-zone
- unknown

地面侧仍使用：

- official-survey-gis
- field-gps
- official-coordinate
- amap-poi
- manual-crosscheck
- osm-wikidata
- unknown

显式 numeric σ 永远覆盖 evidence 默认值。

## 3. Pixel σ 如何变成米

check 的地面误差不仅来自 ground coordinate，也可能来自历史图上点击 pixel 本身。

v0.30 在每个 check pixel 周围用当前拟合模型计算局部尺度：

- pixel 向 X 方向移动 1px 后，对应现代地理位置移动多少米；
- pixel 向 Y 方向移动 1px 后，对应现代地理位置移动多少米；
- 两者取 RMS，得到局部 `metersPerPixel`。

随后：

```text
pixelComponentM = pixelSigmaPx × localMetersPerPixel

effectiveSigmaM = sqrt(
  groundSigmaM² + pixelComponentM²
)
```

这个 effective σ 是“当前模型局部尺度 + 当前证据 profile”下的研究误差尺度，不是法定测绘精度。

## 4. Standardized residual

原始 residual 仍然以米计算：

```text
residualM = distance(predicted, observed check)
```

同时新增：

```text
standardizedResidual = residualM / effectiveSigmaM
```

解释规则：

- `≤ 2σ` → `compatible`
- `2–3σ` → `tension`
- `> 3σ` → `inconsistent`

这些阈值是项目研究型解释门槛，不是新的 PASS / REVIEW / FAIL 标准，也不是正式统计显著性检验。

## 5. Raw Holdout 永远保留

v0.30 **不修改**既有：

- Holdout RMSE（米）
- Holdout max residual（米）
- PASS / REVIEW / FAIL
- `assessReviewReadiness()`

因此即使一个低精度 check 的 80m residual 在标准化解释中没有达到 `>3σ`，raw Holdout 仍然是80m，原 QA 结论不会被“高 σ”洗白。

Evidence-normalized holdout 只回答：

> 这个 raw residual 是否远远超出 check 证据本身能合理解释的误差范围？

## 6. Monte Carlo 新增“双赢家”

v0.29 Monte Carlo 原本按固定 check truth 的**raw meter RMSE**比较模型。

v0.30 保留原 raw competition，同时新增一套：

```text
normalized RMS × complexity surcharge
```

模型结果现在同时记录：

- raw wins / raw win rate
- evidence wins / evidence win rate
- mean raw holdout RMSE
- mean normalized holdout（σ）

总结果同时保存：

- `winnerModelId`：原始米制 winner
- `evidenceWinnerModelId`：check evidence 标准化后的 winner

两者可以不一致。

如果不一致，含义不是“旧 winner 错了”，而是：

> 模型选择对 check 证据质量权重敏感，需要人工复核 check 来源。

## 7. 工作台

控制点表不再禁止 check 点编辑 uncertainty。

工作台新增：

### Check-point evidence uncertainty

显示：

- profiled / fallback check 数量
- effective σ min–max
- normalized RMS
- max standardized residual
- overall compatible / tension / inconsistent

### Independent check evidence 明细

逐点显示：

- raw residual
- effective σ
- standardized residual
- calibration source
- interpretation

### 高德 `Check ±2σ`

每个 check 的实际 WGS84 ground point 转成 GCJ-02 后绘制一个半径 `2 × effectiveSigmaM` 的圆。

它只是证据尺度可视化，不代表“真实位置95%置信圆”。

## 8. Provenance

Draft GeoJSON 与 canonical patch 保存：

- check uncertainty available
- overall interpretation
- normalized RMS
- max standardized residual
- profiled / fallback check count
- effective sigma min / max
- compatible / tension / inconsistent count
- Monte Carlo raw winner / runner-up
- Monte Carlo evidence winner / runner-up

完整逐点 uncertainty profile 仍随 session JSON 保存。

## 9. 安全边界

v0.30 不会：

- 让 check point 进入拟合；
- 在 Monte Carlo 中扰动 check point；
- 用 standardized residual 替换 raw Holdout；
- 修改 `assessReviewReadiness()`；
- 因 `compatible` 自动晋升；
- 因 `inconsistent` 自动拒绝 canonical patch；
- 自动修改任何遗址事实坐标。

v0.30 的价值是让验证证据从“单一真值”升级为“带质量等级的独立证据”，但不削弱独立验证本身。
