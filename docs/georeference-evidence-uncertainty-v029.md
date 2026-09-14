# v0.29 Evidence-calibrated Control Uncertainty

## 目标

v0.27–v0.28 已经可以传播随机误差与系统误差，但此前所有 fit 控制点默认共享同一个 `1.5px / 10m` 随机误差假设。v0.29 将它升级为**逐控制点证据校准**：每个 fit point 根据图像辨识质量与现代地面坐标来源，拥有自己的 pixel σ 和 ground σ。

这一步的目标不是宣称“官方 GIS 一定就是2m”或“高德 POI 一定就是10m”，而是把原来隐含的统一假设拆成**透明、可编辑、可追溯的证据模型**。

## 图像侧 evidence → 默认 σ

| 图像证据 | 默认 σ | 解释 |
| --- | ---: | --- |
| `exact-corner` | 0.7 px | 清晰建筑角点、塔心、明显交点等可重复定位特征 |
| `clear-feature` | 1.2 px | 轮廓清楚但不是唯一数学角点的地物 |
| `unknown` | 1.5 px | 旧 session 与未校准点的兼容回退 |
| `fuzzy-feature` | 3.0 px | 边缘模糊、老照片/扫描不清、符号位置有解释空间 |
| `approximate-zone` | 5.0 px | 只能定位到一个近似区域，不应假装是精确点 |

## 地面侧 evidence → 默认 σ

| 地面证据 | 默认 σ | 解释 |
| --- | ---: | --- |
| `official-survey-gis` | 2 m | 有明确 GIS / 测绘级来源的控制点；仍是项目起始值，不是对具体数据精度的声明 |
| `field-gps` | 5 m | 现场 GPS / 手机 GNSS 等经人工核验的实地点 |
| `official-coordinate` | 8 m | 官方名录、正式文本、世界遗产代表坐标等非测绘控制点 |
| `amap-poi` | 10 m | 高德 POI / 地图点击点；与 v0.27 默认 ground σ 保持兼容 |
| `manual-crosscheck` | 12 m | 多源人工交叉核对，但没有更高等级的测量来源 |
| `osm-wikidata` | 15 m | OSM、Wikidata、Mapcarta 等公开二级地理数据 |
| `unknown` | 10 m | 旧 session 或证据未填写时的兼容回退 |

这些数值是**项目默认校准表**。一旦获得更具体的 DPI、比例尺、GPS 记录、官方 GIS 元数据或控制点测量精度，应使用显式 σ 覆盖默认值。

## 显式 σ 永远优先

每个 control 的 session JSON 可以保存：

```text
uncertainty.pixelEvidence
uncertainty.groundEvidence
uncertainty.pixelSigmaPx
uncertainty.groundSigmaM
uncertainty.note
```

如果只选 evidence，不填数值，则使用校准表默认 σ；如果填了 numeric σ，则 numeric override 优先。

## 自动推断

目前只做一条保守自动推断：

- `groundSource === amap-click` → `groundEvidence = amap-poi`

其它手工输入控制点不会根据文字或来源名称偷偷猜证据等级，仍然回退为 `unknown`，由研究者明确选择。

## Monte Carlo 两种模式

### evidence-profiled（默认）

工作台默认调用 Monte Carlo 时不传统一 σ。每个 fit point 分别读取自己的 profile；未校准点仍回退到 `1.5px / 10m`，因此旧 session 结果保持兼容。

### uniform（兼容模式）

如果 API 显式传入 `pixelSigmaPx` 或 `groundSigmaM`，则继续使用 v0.27 的统一误差模式。该模式会覆盖逐点 evidence profile，方便重现旧实验或做统一情景对照。

## Check points

v0.29 仍然不扰动 `check` points。工作台中的 uncertainty 编辑对 check 点禁用，因为它们继续承担独立外部真值。

这并不意味着 check point 在现实中“零误差”，而是当前研究设计刻意把其不确定性留到下一层，而不是同时扰动训练证据和验证真值导致可解释性下降。

## 工作台

控制点表新增：

- 图像证据 / σpx；
- 地面证据 / σm。

输入框为空时显示由 evidence 自动解析得到的有效 σ；手工输入则成为 explicit override。

QA 新增 **Evidence uncertainty calibration** 卡片，显示：

- profiled fit point 数；
- fallback 数；
- pixel σ min–max；
- ground σ min–max。

Monte Carlo 卡片同步显示当前模式与实际 σ 范围。

## Provenance

Draft GeoJSON 与 canonical patch 保存：

- `monteCarloUncertaintyMode`
- `monteCarloProfiledControlCount`
- `monteCarloFallbackControlCount`
- `monteCarloPixelSigmaMinPx / MaxPx`
- `monteCarloGroundSigmaMinM / MaxM`

完整逐点 profile 则保存在 georeference session JSON 中，避免在 Polygon GeoJSON 属性里重复塞入长数组。

## 安全边界

v0.29 不修改：

- `session.method`
- fit/check 角色
- canonical readiness
- human-approved patch 流程
- 112 条遗址事实坐标

更小的 σ 不会自动把边界变成 verified；更大的 σ 也不会自动删除控制点。它只是让 Monte Carlo 的误差假设从“所有点一样”变成“每个点有证据来源”。
