# v0.25 Piecewise 视觉预演与 Seam / Fold-over 现场检查

更新：2026-09-13 · v0.25

## 目的

v0.24 只能用表格比较 2×1、1×2、2×2 Piecewise Affine 候选的 Holdout、seam continuity 与 fold-over 风险。v0.25 把同一候选真正放回历史图与现代高德底图，回答：

- 分区边界在原图上到底落在哪里；
- 相邻局部模型在 seam 同一 pixel 上会跳开多少米；
- 局部 orientation flip 发生在哪个具体分区；
- Piecewise 边界与当前全局模型边界在现代地图上相差多少。

它仍然只是 **visual preview**，不会让 Piecewise 模型成为 session 当前模型，也不会创建 canonical geometry。

## 共享布局选择

工作台中的候选表、历史图分区和高德叠加共享同一个预演布局。选择规则：

1. 用户手动选择且该候选可用时，优先使用该布局；
2. 否则使用 v0.24 `bestLayout`；
3. 若 bestLayout 不可用，则回退到第一个可用候选。

因此不会出现“表格看 2×1、地图却还显示 2×2”的状态漂移。

## 历史图预演

历史图增加 Piecewise 分区覆盖层：

- `vertical-2`：W / E；
- `horizontal-2`：N / S；
- `quadrants-4`：NW / NE / SW / SE。

每区显示局部 Affine orientation 与当前全局模型在该区中心的 orientation。若符号相反或接近退化，则该区标记为 **FOLD** 并使用红色斜纹风险层。

这里的 fold-over 是局部几何拓扑风险提示，不等同于完整的连续变形证明。

## 现代高德地图预演

高德 QA 地图新增 Piecewise 开关，并显示三类对象：

1. **Piecewise 边界**：每个 boundary pixel 使用其所属分区的局部 Affine 投影，转换为 GCJ-02 后显示为紫红虚线；
2. **分区轮廓**：把每个图幅分区四角通过对应局部 Affine 投影到现代地图；出现 fold-over 风险的区域用红色高亮；
3. **Seam 跳变线段**：在分区接缝上取与 v0.24 相同的抽样 pixel，分别用两侧局部模型预测，直接连接两预测位置。

Seam 线段按现有 `passMaxM / reviewMaxM` 阈值分为 pass / review / fail。它展示的是“同一个历史 pixel 在两侧模型下会落到两个不同现代位置”的不连续，而不是实际地物位移。

## 全局模型 ↔ Piecewise 边界分离

对现有 `boundaryPixels`，v0.25 同时计算：

- 当前全局 session 模型预测；
- Piecewise 所属分区模型预测。

报告：

- mean divergence；
- max divergence。

这项指标回答“若真的改用分区模型，数字化边界会整体移动多少”，但不参与自动 canonical readiness。

## 风险色阶

Piecewise visual preview 的总色阶：

- 任一分区存在 fold-over → FAIL；
- 无 fold-over，但 seam max > `reviewMaxM` → FAIL；
- seam max 位于 `passMaxM` 与 `reviewMaxM` 之间 → REVIEW；
- seam max ≤ `passMaxM` → PASS。

这些仍是项目研究阈值，不是法定测绘规范。

## 与 v0.24 的关系

v0.24 决定“候选是否值得看”，v0.25 负责“把候选放回空间里看”。

v0.25 **不会**修改：

- v0.24 `promising / review / reject` 判定；
- `session.method`；
- `assessReviewReadiness()`；
- `reviewStatus: draft-unreviewed`；
- v0.17 human-approved patch / reviewed registry 流程。

因此 Piecewise 视觉吻合也不等于可以发布正式边界。
