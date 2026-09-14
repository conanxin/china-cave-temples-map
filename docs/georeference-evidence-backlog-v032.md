# v0.32 Evidence Backlog / Research Queue

更新：2026-09-14 · v0.32

## 目标

v0.31 已经能回答“这个 σ 有没有可追溯来源、是否经过人工复核”。v0.32 把这些审计缺口和既有模型诊断合并成一个**动态研究任务队列**，回答：

> 下一步最值得先补哪一个控制点的证据？

队列只改变研究顺序，不自动修改坐标、σ、fit/check 角色、模型、readiness 或 canonical geometry。

## 1. 动态任务，而不是第二套任务数据库

Research Queue 直接由当前 `session.controls` 与已有诊断实时计算：

- uncertainty evidence audit；
- Fit-point Influence；
- RANSAC；
- Huber / Tukey IRLS；
- independent check evidence-normalized residual。

不会另外保存一个“done”布尔值。补充 `evidenceRef`、校准 basis、review，或诊断风险消失后，任务会自动降级或离开队列。

这样避免出现“任务已手工勾完成，但 Session 里仍然没有证据”的状态漂移。

## 2. Evidence gap score

当前项目启发式基础分：

| Evidence audit grade | Base gap |
| --- | ---: |
| fallback | 40 |
| heuristic | 25 |
| evidence-backed | 10 |
| reviewed | 0 |

若 audit 仍包含 provenance issue，每项增加5分，最多增加10分。

这里的分值不是概率、置信度或控制点精度分，只用于排序研究工作。

## 3. Diagnostic score

在 evidence gap 之外，再叠加当前控制点对模型/验证的影响：

| 诊断 | 加分 |
| --- | ---: |
| Influence suspect | +45 |
| RANSAC outlier | +30 |
| RANSAC ambiguous | +10 |
| IRLS severe | +30 |
| IRLS downweighted | +10 |
| check inconsistent (>3σ) | +40 + `min(15, 2×z)` |
| check tension (2–3σ) | +20 |

因此：

- 一个没有来源但对 Holdout 极敏感的 fit point 会快速升到队首；
- 一个 evidence-backed 但 >3σ 冲突的 check 仍会进入高优先复核；
- 一个 clean + reviewed control 不再占据 backlog。

## 4. Priority

总分：

`score = evidenceGapScore + diagnosticScore`

当前项目阈值：

- `high`：score ≥ 60
- `medium`：30 ≤ score < 60
- `low`：0 < score < 30

这些阈值只是研究队列启发式，不进入任何 canonical QA gate。

## 5. Recommended action

根据最主要风险生成下一步动作：

- `calibrate-and-attach-evidence`：仍为 fallback，需要先校准 σ 并补原始证据；
- `attach-evidence`：已有 heuristic / 手工 σ，但缺 traceable evidenceRef；
- `review-uncertainty-claim`：已有 evidenceRef，下一步做人工 uncertainty review；
- `review-control-and-source`：fit point 同时存在 Influence / RANSAC / IRLS 风险；
- `verify-check-evidence`：independent check 出现 2σ 以上张力，需要核查 check 来源与地物对应。

## 6. UI

工作台新增：

### Evidence research queue 诊断卡

显示：

- task 总数；
- high / medium / low；
- fit / check task 数量；
- top control IDs。

### Research Queue 表

每条任务显示：

- priority；
- control / role；
- audit grade；
- total score；
- evidence gap score；
- diagnostic score；
- recommended action；
- reasons。

点击任务会选中对应控制点，可立即在上方 v0.31 provenance 编辑器补证。

## 7. Export provenance

Draft GeoJSON 与 canonical patch 保存当时的 backlog 快照：

- `evidenceBacklogTaskCount`
- `evidenceBacklogHighCount`
- `evidenceBacklogMediumCount`
- `evidenceBacklogLowCount`
- `evidenceBacklogFitTaskCount`
- `evidenceBacklogCheckTaskCount`
- `evidenceBacklogTopControlIds`

完整任务原因不复制到 canonical QA；原因可由保存的 Session 与诊断重新计算。这样避免把大段动态解释文本冻结成正式几何属性。

## 8. 不改变的安全边界

v0.32 **不会**：

- 因 high priority 自动删控制点；
- 因 fallback 自动降权；
- 因 check inconsistent 自动改成 fit；
- 因 evidence-backed 自动标记坐标 verified；
- 修改 `assessReviewReadiness()`；
- 自动批准 canonical patch。

Queue 是研究调度层，不是新的几何质量判定器。

## 9. 与 v0.31 的关系

v0.31 回答：

> 这个 σ 的依据成熟到什么程度？

v0.32 回答：

> 在所有证据缺口中，哪一个最值得先去查？

因此项目第一次形成明确的闭环：

`诊断异常 → 证据 backlog → 补原始来源 → 校准 σ → 人工 review → 重算 QA → backlog 自动更新`
