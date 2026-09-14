# v0.22 Huber / Tukey IRLS 连续权重稳健诊断

更新：2026-09-13

## 目的

v0.21 的 RANSAC 回答的是：

> 哪些控制点持续不进入最佳几何共识？

这是一种“硬”诊断：点要么被共识纳入，要么被排除。

历史地图配准中还存在另一类更常见的情况：控制点本身未必完全错误，但受纸张伸缩、扫描局部变形、地图绘制误差、像素点击不确定性影响，可能只应该**降低影响力**，而不是直接“删掉”。

v0.22 因此加入 Huber / Tukey IRLS（Iteratively Reweighted Least Squares）：

```text
普通 LS
↔ RANSAC 硬 inlier/outlier
↔ IRLS 连续 weight 0..1
```

三者是互补证据，不互相替代。

## 前置条件

IRLS 诊断要求冗余 fit points 和独立真值：

- Affine：至少 **5 个 fit points**；
- Projective：至少 **6 个 fit points**；
- 至少 **2 个 independent check points**。

check points 从不参与 IRLS 权重计算或模型参数求解，只用于比较 LS / Huber / Tukey 的泛化表现。

## 算法

实现：`src/georef/robustIrls.ts`。

### 初值

IRLS 从当前 session.method 的普通最小二乘模型开始。

### 米制残差

每轮用当前模型预测全部 fit points，并用 Haversine 距离得到米制残差：

```text
r_i = distance(predicted_i, observed_i)
```

### Robust scale

当前使用残差的 MAD（Median Absolute Deviation）估计尺度：

```text
scale = 1.4826 × MAD(residuals)
```

当 MAD 接近0时，退回到 residual median 的稳健尺度，并设置很小的数值下限，防止除零。

这是项目内部数值策略，不是文保/测绘行业标准。

## Huber 权重

当前 tuning constant：

```text
k = 1.345
```

标准化残差：

```text
u = |r| / (k × scale)
```

权重：

```text
u <= 1  → w = 1
u > 1   → w = 1/u
```

Huber 会连续降低大残差点影响，但不会突然把权重变成0。

## Tukey biweight

当前 tuning constant：

```text
c = 4.685
```

```text
u = |r| / (c × scale)
```

权重：

```text
u < 1   → w = (1 - u²)²
u >= 1  → w ≈ 0
```

实现中使用一个极小正权重数值下限，避免加权正规方程因完全零权重产生不必要的数值退化。

## 加权拟合

一个控制点的经度和纬度两条观测方程始终共享同一个权重。

计算等价于：

```text
A'_i = sqrt(w_i) × A_i
b'_i = sqrt(w_i) × b_i
```

然后使用现有 least-squares solver 求解 Affine / Projective 参数。

当前最多迭代30轮。当最大控制点权重变化：

```text
<= 1e-4
```

则记为 converged。

## 权重显示

为了让 UI 可读，连续权重映射成三个提示档：

| Weight | 显示 | 含义 |
|---:|---|---|
| `>= 0.80` | FULL | 当前稳健模型基本保留全部影响 |
| `0.35–0.80` | DOWNWEIGHTED | 值得检查，但不是严重警告 |
| `< 0.35` | SEVERE · 复查 | 当前稳健模型强烈降低该点影响 |

这些阈值是研究 UI 启发式，不是统计显著性边界。

最重要的是：

> **weight 不是“控制点正确概率”。**

例如 `weight=0.2` 不代表“这个点只有20%可能正确”。

## Independent Holdout

普通 LS、Huber、Tukey 都使用完全相同的 independent check points 评估：

```text
LS Holdout RMSE
Huber Holdout RMSE
Tukey Holdout RMSE
```

只有 check points 决定“IRLS 是否泛化更好”。

当前 material-improvement 提示仍使用：

```text
至少改善 5m
AND
最佳 IRLS RMSE <= LS RMSE × 0.75
```

## Recommendation

### `review-downweighted`

至少存在 severe downweighted fit point，同时 Huber/Tukey 的 independent Holdout 明显优于 LS。

含义：优先人工复查这些低权重点。

### `irls-improves`

IRLS Holdout 明显改善，但没有单个 severe 点。

可能表示多处轻微局部变形共同影响 LS。

### `least-squares`

普通 LS 在 independent checks 上明显更好。

### `agree`

LS / IRLS 没有达到 material-change 门槛。

这些 recommendation 都不会自动改变 session.method。

## Boundary divergence

历史边界像素同时通过：

- LS；
- Huber；
- Tukey。

逐顶点计算：

```text
LS ↔ Huber mean/max divergence
LS ↔ Tukey mean/max divergence
```

高德视觉语义：

- 当前 session 模型：红色 Polygon；
- RANSAC：青蓝虚线；
- Huber：橙色实线；
- Tukey：蓝色虚线。

这些都只是 visual QA，不是新 canonical boundary。

## 与 Influence / RANSAC 的关系

### Influence

问：

> 拿掉这个点后，独立 check points 是否显著改善？

### RANSAC

问：

> 最佳最小样本共识是否反复排除这个点？

### IRLS

问：

> 在连续权重稳健模型中，这个点应保留多少影响力？

v0.22 新增多证据一致性：

```text
Influence = SUSPECT
AND RANSAC = OUTLIER
AND IRLS = SEVERE
→ 高优先复查
```

两条警告同时成立只标普通“复查”。

无论哪一种：

```text
复查 ≠ 删除
高优先复查 ≠ 自动删除
```

## Provenance

Draft GeoJSON 保存：

```text
irlsAvailable
irlsRecommendation
irlsTopDownweightedId
huberHoldoutRmseM
tukeyHoldoutRmseM
huberMinWeight
tukeyMinWeight
huberSevereCount
tukeySevereCount
irlsBoundaryMaxDivergenceM
```

Canonical patch QA 同样保存这些核心字段，所以人工批准后也能知道当时是否存在强烈降权点。

完整逐点权重表保存在 session/UI 运行时诊断中，不复制进每个 GeoJSON，避免导出文件被重复诊断明细撑大。

## 与 canonical 晋升的边界

v0.22 **不修改** `assessReviewReadiness()`。

所以：

```text
IRLS severe
≠ 自动删除
≠ 自动 FAIL
≠ 自动阻止批准

IRLS Holdout 更好
≠ 自动采用 Huber / Tukey
≠ 自动晋升 Polygon
```

最终仍须沿用：

```text
独立 Holdout
→ LOO
→ 空间分布
→ 面积比较
→ Influence
→ RANSAC
→ IRLS
→ 双地图 visual QA
→ 人工确认
→ reviewed registry
→ canonical geometry
```
