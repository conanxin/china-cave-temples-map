# v0.17 Canonical 边界人工晋升工作流

更新：2026-09-13

## 目的

v0.15–v0.16 已能把官方地图页配准并输出 `draft-unreviewed` GeoJSON，但草稿与 canonical `SiteSpatialExtent.geometry` 之间此前仍需要人工复制。v0.17 把这一步做成**显式、有审计链、默认拒绝自动发布**的晋升流程。

完整路径：

```text
官方地图页
→ fit/check 控制点
→ Holdout / LOO / 空间分布 / 面积 QA
→ readiness = STRONG
→ draft canonical patch
→ 人工输入 APPROVE 令牌
→ human-approved patch JSON
→ apply_reviewed_extent_patch.py
→ reviewedExtentPatches.json
→ runtime merge
→ SiteSpatialExtent.geometry = verified GCJ-02 Polygon
```

## 1. 高德现代底图控制点

### 为什么高德点击不能直接作为 WGS84

高德 JS API 返回 **GCJ-02**。配准数学层一直使用 WGS84，因此 v0.17 新增 `gcj02ToWgs84()` 迭代反算。

用户流程：

1. 在历史/官方地图页点击一个明确地物，得到 pixel `x/y`；
2. 点击“从高德取点”；
3. 在现代高德地图点击同一个真实地物；
4. 页面显示原始 GCJ-02 和反算后的 WGS84；
5. 点击“使用此位置”；
6. 再选择 `fit` 或 `check` 并加入控制点。

保存到会话中的字段：

```text
ground                 WGS84，用于模型拟合/检验
groundSource            amap-click
groundSourceCrs         GCJ-02
groundSourceOriginal    原始高德点击坐标
```

如果用户之后手工修改 ground 经纬度，该点自动改为：

```text
groundSource=manual
groundSourceCrs=WGS84
groundSourceOriginal=undefined
```

这样不会把一个已经人工编辑的坐标继续冒充“高德原始点击点”。

## 2. 生成 canonical patch 的门槛

`buildCanonicalExtentPatch()` 会拒绝以下情况：

- readiness 不是 `strong`；
- 没有选择 `boundaryExtentId`；
- extent 在当前遗址中不存在；
- extent 已经是 `geometryStatus: verified`；
- 边界像素不足3点；
- session 的 site 与当前 site 不匹配。

Patch 同时保存：

- WGS84 Polygon：研究和审计；
- GCJ-02 Polygon：最终高德 canonical geometry；
- source session / source map target；
- fit/check 数量；
- AMap-linked 控制点数量；
- fit / holdout / LOO / spatial distribution / area QA 摘要；
- `reviewStatus: draft-unreviewed`。

## 3. 人工批准令牌

草稿生成后页面显示精确令牌：

```text
APPROVE <site-code> <extent-id>
```

例如：

```text
APPROVE 05 05-wh-property
```

大小写、空格和 extent id 都必须完全一致。只有通过 `approveCanonicalExtentPatch()` 后，JSON 才变为：

```text
reviewStatus = human-approved
confirmation.token
confirmation.confirmedAt
```

“STRONG”并不等于批准。它只代表这份草稿满足进入人工审核的项目内门槛。

## 4. Reviewed registry

浏览器不拥有源代码写权限。因此 human-approved patch 下载后，需要在项目根目录执行：

```bash
python scripts/apply_reviewed_extent_patch.py path/to/05-05-wh-property.approved-patch.json
```

默认 registry：

```text
src/data/reviewedExtentPatches.json
```

脚本拒绝：

- 非 `human-approved` patch；
- confirmation token 不匹配；
- QA readiness 不是 strong；
- 非 Polygon geometry；
- 同一 site+extent 已存在 reviewed patch。

只有明确需要替换一条**尚未进入 canonical verified extent 的 reviewed patch**时，才允许：

```bash
python scripts/apply_reviewed_extent_patch.py patch.json --replace
```

## 5. Runtime merge

`src/data/sites.ts` 先建立 base 112-site 数据，再调用：

```text
applyReviewedExtentPatches(baseSites, reviewedExtentPatches)
```

每条 approved patch 会把匹配 extent 更新为：

```text
geometryStatus = verified
geometry = geometryGcj02
derivation = georeferenced-official-map
sourceCrs = WGS84
targetCrs = GCJ-02
```

同时把 patch id、session id、确认时间追加到 `verificationNote`。

如果 base extent 本身已经 `verified`，runtime merge **拒绝覆盖**，即使 registry 里存在 patch。这样防止 reviewed registry 意外改写已经正式进入 canonical 的边界。

## 6. 当前状态

v0.17 发布时：

```text
src/data/reviewedExtentPatches.json = []
```

所以本版本不新增任何 verified Polygon。只有未来真正完成一份 STRONG 配准、人工审查并执行 CLI 后，才会发生 canonical geometry 晋升。
