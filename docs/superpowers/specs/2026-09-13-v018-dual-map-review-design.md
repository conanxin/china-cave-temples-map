# v0.18 双地图联动视觉验收设计

日期：2026-09-13

## 目标

在现有地图配准工作台中增加“历史图页 ↔ 高德现代底图”的并排联动视觉验收，使控制点、边界和配准结果可以在两个视图中双向检查，同时不改变 v0.17 的人工晋升安全边界。

## 关键行为

1. 历史图页左侧继续作为像素坐标采集面板；现代高德地图作为右侧常驻 QA 面板，不再只在弹窗中临时取点。
2. 控制点在两个视图中共享选中状态；fit 与 check 使用不同样式；点击列表、历史图标记或现代地图标记都能选中同一控制点。
3. 高德地图点击可以创建/更新当前 pending 控制点的 ground 坐标；原始 GCJ-02 与反算 WGS84 provenance 继续保存。
4. 拟合完成且存在 boundaryPixels 时，把历史图上的数字化 Polygon 实时投影为 GCJ-02 叠加到高德地图；允许调节填充透明度。
5. 叠加仅用于 visual QA，不能写入 canonical geometry；正式晋升仍必须经过 v0.17 的 STRONG QA + 人工批准令牌 + reviewed registry 流程。
6. 若无高德 Key，历史图页、控制点表、拟合、QA 和导出继续可用；现代地图面板显示明确配置提示。

## 数据与接口

新增纯逻辑：

- `getControlDisplayStyle(role, selected)`：fit/check/selected 的视觉语义。
- `getProjectedBoundaryGcj02(session, fit)`：把 boundaryPixels 经 WGS84 模型投影后转换到 GCJ-02，返回闭合路径。
- `getDualMapControlMarkers(session)`：输出 WGS84 / GCJ-02 双坐标 marker 数据，优先复用 AMap 原始 GCJ-02 provenance。

UI 新增：

- `AmapGeoreferenceQaMap`：常驻现代底图 QA 组件。
- `GeoreferenceWorkbench` 增加 `selectedControlId`、overlay opacity 和 dual-map 联动状态。

## 视觉边界

- fit：深朱红；check：蓝灰；selected：外圈高亮。
- 历史图边界草稿：朱红虚线。
- 高德投影边界：蓝灰/朱红半透明 Polygon，默认透明度 0.18，可在 0.05–0.60 调整。
- 明确提示“实时投影 = visual QA draft，不是 verified boundary”。

## 验收

- 控制点双视图选择状态一致。
- AMap-linked 控制点优先使用原始 GCJ-02，不二次转换；manual 控制点才从 WGS84 转 GCJ-02。
- boundary overlay 经过拟合模型实时投影并闭合。
- fit/check 样式可区分；opacity 可调。
- 无 Key 时不影响非地图功能。
- canonical promotion 流程与 registry 逻辑不变。
