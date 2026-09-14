# v0.18 双地图联动视觉验收

更新：2026-09-13

## 目的

配准数值指标可以发现很多问题，但仅看 RMSE 仍很难回答一个直观问题：

> 历史/官方图上的边界，投影到现代底图以后，在河谷、道路、山脊和遗址核心区上是否整体合理？

v0.18 因此把历史图与现代高德底图并排显示，提供人工视觉空间 QA。它是 v0.16 数值 QA 的补充，不是替代。

## 双地图结构

### 左侧：官方历史图页

- 图像仍只通过本地 `Object URL` 加载，不上传。
- 点击控制点记录 pixel 坐标。
- `fit` 点深朱红、`check` 点蓝灰色。
- 当前选中控制点增加金色外圈。
- 边界像素继续显示为草稿折线。

### 中间：现代高德底图

- 同一批控制点投影成 AMap Marker。
- 点击 Marker 会选中左侧同一控制点和表格同一行。
- 历史图选中控制点后，现代地图自动平移到对应位置。
- 历史图已经选择 pending pixel 时，点击现代地图会生成 `GCJ-02 → WGS84` 配对坐标并填入 pending 控制点。

### 右侧：数据 / QA

保持既有 v0.16/v0.17 功能：

- fit / check 角色
- 拟合残差
- Holdout
- Leave-one-out
- 空间分布评分
- 面积比较
- canonical patch 人工批准

## 坐标 provenance

`getDualMapControlMarkers()` 遵循：

1. `groundSource === amap-click` 且保存了 `groundSourceOriginal + GCJ-02`：现代地图直接复用这个原始点击点；
2. 手工 WGS84 控制点：只为了现代地图显示而执行 WGS84 → GCJ-02；
3. 绝不把二次转换后的坐标覆盖原始 provenance。

因此双地图联动不会让高德原始点击证据逐轮漂移。

## 实时边界叠加

成功拟合且 `boundaryPixels >= 3` 后：

1. pixel Polygon 经当前 Affine / Projective 模型变换为 WGS84；
2. WGS84 逐点转换成 GCJ-02；
3. 闭合路径以半透明虚线 Polygon 叠加到高德地图；
4. 填充透明度可在 0.05–0.60 范围内调整。

用途是观察：

- 整体平移；
- 旋转方向错误；
- Projective 透视失真；
- 控制点只覆盖局部导致的远端漂移；
- 边界与山谷、道路、寺院或已知遗址点明显错位。

## 不能推导出的结论

双地图看起来“很贴”并不意味着：

- 已达到法定测绘精度；
- UNESCO / 国保边界已经 verified；
- 控制点没有系统误差；
- Projective 模型在图幅边缘同样可靠；
- 可跳过 Holdout / LOO / 面积检查。

所以实时高德 Polygon 永远只是 `visual QA draft`。

## Canonical 安全边界

v0.18 不改变 v0.17 晋升链：

`draft-unreviewed` → STRONG QA → 精确批准令牌 → `human-approved patch` → CLI → `reviewedExtentPatches.json` → runtime merge。

双地图组件本身没有 canonical 写权限，也不会调用 registry 写入脚本。

## 无高德 Key 时

右侧现代地图只显示配置提示。以下能力仍完整可用：

- 历史图控制点；
- 手工 WGS84；
- Affine / Projective；
- Holdout / LOO / 空间分布；
- 面积比较；
- WGS84 / GCJ-02 GeoJSON 草稿；
- canonical patch 草稿与人工审批。

## v0.19：从视觉叠加进入误差诊断

v0.19 在双地图之上新增两类覆盖层：

1. 独立 check point 的预测→真值误差箭头；
2. 同一控制点集拟合出的 Affine / Projective 两套边界。

误差箭头可以点击并联动选择对应控制点。双模型边界仅用于模型诊断，不改变当前 `session.method`。具体算法与启发式边界见 `docs/georeference-diagnostics-v019.md`。
