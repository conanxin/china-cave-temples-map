# v0.28 Correlated / Systematic Error Scenario Stress Test

## 目标

v0.27 Monte Carlo 解决的是：

> 如果每个 fit 控制点都发生相互独立的小幅随机误差，模型选择与边界位置是否稳定？

v0.28 进一步测试另一类更危险、也更容易被独立 Gaussian 模型漏掉的问题：

> 如果误差不是独立随机噪声，而是整组同向、同区域相关、具有尺度或波浪结构，当前配准与数字化边界是否仍稳定？

本阶段是**情景压力测试（scenario stress test）**，不是概率模型，也不是对某张 UNESCO 图或某个控制点真实误差来源的断言。

## 核心原则

压力只作用于参与拟合的 `fit` observations：

- independent `check` points 完全保持固定，继续作为外部真值；
- `boundaryPixels` 完全保持固定，作为已完成的历史图描边；
- 每个压力变体都重新拟合当前 `session.method`；
- 同时比较 Global Affine / Projective / Piecewise 2×1 / 1×2 / 2×2 的 complexity-adjusted check score；
- 压力测试不会改写 session 控制点，也不会切换当前模型。

这意味着 v0.28 测量的是：**如果支撑配准的控制证据本身带有结构化系统误差，解算出来的边界会移动多少。**

## 默认六类压力情景

### 1. 控制点像素整体旋转

默认幅度：`±0.25°`。

所有 fit 点的像素坐标围绕图像中心统一旋转。它代表一种研究型“图像控制坐标整体旋转误差”情景，例如扫描/裁切/控制点测量参考方向存在微小系统偏差。

它**不是**把整张历史图、控制点和描绘边界一起旋转；如果三者一起旋转，Affine 本身会吸收该变换，无法测试控制证据与边界描绘之间的系统偏差。

### 2. X / Y 各向异性比例尺偏差

默认幅度：`±0.35%`。

分别测试：

- X +0.35%
- X -0.35%
- Y +0.35%
- Y -0.35%

缩放围绕图像中心进行，只改变 fit 点像素 observations。用于测试控制点坐标体系存在轻微横向或纵向比例尺偏差时的敏感性。

### 3. 全体地面控制点共同平移

默认幅度：`10 m`。

分别把全部 fit ground points 统一向：

- 东
- 西
- 北
- 南

移动 10 m。

它用于模拟“多个地面控制点共享同一方向系统偏差”的极简压力情景，例如同一来源 POI、同一坐标转换链或同一参考底图产生共同偏移。

### 4. 区域相关地面偏移

默认幅度：`15 m`。

当前测试四个变体：

- 西半幅 fit points 统一向东 15 m；
- 西半幅 fit points 统一向西 15 m；
- 北半幅 fit points 统一向北 15 m；
- 北半幅 fit points 统一向南 15 m。

它不表示真实误差一定按“半幅”分区，而是用一个可重复、可解释的相关结构测试：**如果同一区域的一组控制点共享偏差，边界是否发生局部拉扯。**

### 5. 单个控制点 Gross Error

默认幅度：`40 m`。

系统会让每一个 fit point **单独**成为一次压力变体：其余 fit points 保持不变，只把目标控制点的 ground observation 沿“图幅中心 → 该控制点”对应的外向方向偏移40m。这样同一情景可以逐点扫描：

- 哪个单点错误最容易抬高 independent Holdout；
- 哪个单点错误最容易拉动边界；
- 哪个单点错误最容易改变 complexity-adjusted model winner。

这里选择“向外”方向只是为了得到确定、可复现且方向随控制点位置变化的一组 stress vectors，并不表示真实 gross error 必然沿该方向发生。它与 v0.20 Influence / v0.21 RANSAC 的区别是：前两者从现有观测数据寻找可疑点；本情景主动假设“如果任意一个点突然错40m，会怎样”。

### 6. 图像局部波浪形变

默认幅度：`2 px`。

当前测试：

- `Y ± 2px × sin(2πX / width)`
- `X ± 2px × sin(2πY / height)`

它用于模拟扫描纸张、页面起伏、拼接或局部非线性图像误差的简化结构。它不是正式的纸张物理形变模型，也不代表实际扫描仪畸变函数。

## 每个变体计算什么

对每一个压力变体：

1. 生成一份**只在内存存在**的 stressed fit controls；
2. 用 stressed fit controls 重拟合当前 `session.method`；
3. 使用原始 independent check points 计算 Holdout RMSE；
4. 使用原始 `boundaryPixels` 计算 stressed boundary；
5. 与 baseline boundary 比较每个顶点球面位移；
6. 报告边界 mean / max shift 和最不稳定边界段；
7. 同时让五类候选模型竞争，比较 winner 是否相对 baseline 发生变化。

候选模型胜负继续沿用 v0.26 / v0.27 的轻度复杂度 surcharge：

`5 × log₂(parameterCount / 6)%`

当两个模型 adjusted score 的差异小于 `0.01 m` 时，优先参数更少的模型，避免近乎零误差的浮点噪声让 Piecewise 假性胜过 Affine。

## 情景汇总

每一种情景记录：

- worst variant；
- 最大 Holdout RMSE；
- 相对 baseline 的最大 Holdout 增量；
- 最大边界位移；
- model winner flip 次数。

项目级汇总记录：

- baseline complexity-adjusted winner；
- dominant scenario；
- 所有情景中的最大 Holdout 增量；
- 所有情景中的最大边界位移；
- model winner 总翻转次数。

## 推荐语义

当前输出四类研究建议：

### `stable`

测试过的系统性情景没有触发现有研究 QA 的明显风险，也没有改变 complexity-adjusted model winner。

### `model-sensitive`

边界尚未超过 PASS 最大残差阈值，但至少一个系统性变体改变了模型赢家。说明模型选择对结构化误差敏感。

### `boundary-sensitive`

系统性情景使当前边界最大漂移超过现有 `passMaxM`，但未达到 `reviewMaxM` / review RMSE 的严重级别。

### `systematic-fragile`

满足任一条件：

- 最坏 stressed boundary shift > `reviewMaxM`；
- 最坏 stressed Holdout RMSE > `reviewRmseM`。

这只表示当前配准对本项目默认系统误差情景脆弱，不自动判定控制点“错误”。

## 高德视觉层

v0.28 新增 `系统压力` overlay：

- 灰色虚线：baseline boundary；
- 橙红实线：所选情景的 worst stressed boundary；
- 橙色有向线：每个边界顶点 baseline → stressed 位移；
- 深红粗线：该情景最不稳定边界段。

工作台中的六类情景表可以切换地图预演对象；默认显示 overall dominant scenario。

所有统计在 WGS84 中完成，GCJ-02 只用于高德显示。

## Provenance

Draft GeoJSON 与 canonical patch 保存：

- `systematicStressRecommendation`
- `systematicStressDominantScenarioId`
- `systematicStressBaselineWinnerModelId`
- `systematicStressModelFlipCount`
- `systematicStressMaxHoldoutIncreaseM`
- `systematicStressMaxBoundaryShiftM`
- rotation / scale / common shift / regional bias / single-control gross error / pixel wave 六类默认压力幅度

因此人工批准后，仍然可以追溯当时做过什么系统性压力假设，以及当前边界最怕哪一类结构化误差。

## 不能如何解释

v0.28 不是：

- 实测的扫描仪畸变参数；
- 控制点真实 covariance matrix；
- 正式测绘误差预算；
- UNESCO 边界官方精度；
- “最坏情景必然会发生”的预测。

特别是 0.25°、0.35%、10 m、15 m、2 px 都是**项目研究默认 stress amplitudes**。当未来取得扫描 DPI、地图比例尺、测量控制点、官方 GIS 或 POI 精度资料时，应使用证据重新设定压力幅度。

## 与 v0.27 的关系

- v0.27：独立 Gaussian 随机误差传播，回答“随机小误差下是否稳定”；
- **v0.28：相关 / 系统性情景压力测试，回答“成组、同向、结构化误差下是否稳定”。**

两者都稳定，才比单独一个 Monte Carlo P95 更有说服力；两者任何一个脆弱，都只会提高人工复查优先级，不会自动改变 `session.method`、`assessReviewReadiness()` 或 canonical 晋升状态。
