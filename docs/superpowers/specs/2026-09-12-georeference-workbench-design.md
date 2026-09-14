# v0.15 地图配准工作台设计

日期：2026-09-12

## 目标

在现有中国石窟 GIS 网页中增加一个本地浏览器配准工作台，使未来从 UNESCO 132728 或 Nomination file 1442 提取出的官方地图页能够直接完成：控制点录入、仿射/单应性拟合、残差 QA、像素边界转地理坐标、GeoJSON 导出，并保留完整的本地研究会话。

## 边界

- 不依赖新后端，不上传用户地图图片。
- 所有会话默认只保存在浏览器内存 / localStorage；可导出 JSON。
- 控制点目标坐标使用 WGS84；最终地图发布几何可同时导出 WGS84 与 GCJ-02。
- v0.15 不自动 OCR、不自动识别格网、不自动声称配准成功。
- 配准 QA 只报告数学残差，不替代人工检查地图年代、CRS、控制点分布和边界语义。

## 变换方法

### Affine

至少 3 个控制点，拟合：

- `lng = a*x + b*y + c`
- `lat = d*x + e*y + f`

3 点为精确解，4 点以上使用最小二乘。

### Projective / Homography

至少 4 个控制点，固定 `h33 = 1`，拟合 8 参数单应性：

- `lng = (h11*x + h12*y + h13) / (h31*x + h32*y + 1)`
- `lat = (h21*x + h22*y + h23) / (h31*x + h32*y + 1)`

4 点为精确解，多点使用最小二乘。

## QA

每个控制点输出：

- 预测经纬度
- 经度/纬度差
- Haversine 残差（米）

会话汇总：

- RMSE（米）
- 最大残差（米）
- 控制点数量
- 变换方法
- 矩阵/参数

默认研究阈值仅用于界面提示：

- RMSE ≤ 25m 且 max ≤ 50m：`pass`
- RMSE ≤ 75m 且 max ≤ 150m：`review`
- 其他：`fail`

这些阈值不是文保测绘规范，只是个人研究 QA 提示，可在会话 JSON 中修改。

## 浏览器工作台

新增顶部“配准工作台”入口，打开全屏/大面板。功能：

1. 选择当前遗址的 `SpatialMapTarget`，或创建自由会话。
2. 导入本地 PNG/JPEG 地图页，仅通过 `URL.createObjectURL()` 本地显示。
3. 点击图片记录像素点；填写对应 WGS84 经度/纬度。
4. 控制点表格支持编辑、删除。
5. 选择 affine / projective，执行拟合。
6. 显示 RMSE / 最大残差 / 每点残差。
7. 边界采点模式：在图上依次点击形成像素 Polygon。
8. 把 Polygon 转换成 WGS84、GCJ-02，并生成 GeoJSON Feature。
9. 导出：会话 JSON、WGS84 GeoJSON、GCJ-02 GeoJSON。
10. localStorage 按 mapTarget/session id 自动保存控制点、边界点、方法和 QA 阈值；图片本身不持久化。

## 数据结构

新增独立 `src/georef/` 子系统，不把草稿控制点写入 canonical `sites.ts`。

核心类型：

- `PixelPoint`
- `GroundPoint`
- `GeoreferenceControlPoint`
- `GeoreferenceMethod`
- `AffineModel`
- `ProjectiveModel`
- `GeoreferenceFitResult`
- `GeoreferenceSession`

只有人工审查后的导出结果，未来版本才可进入 `SiteSpatialExtent.geometry`。

## 安全与准确性约束

- 不允许少于最小控制点数量时拟合。
- 拒绝奇异/病态线性系统。
- Projective 投影分母接近 0 时抛错。
- Polygon 至少 3 个不同像素点；导出时自动闭环。
- 界面持续显示“工作台输出 ≠ 已审核 official boundary”。
- 不自动写回 canonical data。
