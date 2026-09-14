# UNESCO 132728 地图集提取与配准准备

更新：2026-09-12 · v0.13

## 目标

把 UNESCO World Heritage Centre 的官方地图集：

- Document ID：`132728`
- 标题：*Silk Roads: the Routes Network of Chang'an-Tianshan Corridor - maps of inscribed property*
- 远程原文件：`https://whc.unesco.org/document/132728`
- 已观测文件长度：`40,574,291 bytes`

从“远程资产已经确认”推进到：

1. 原始 PDF 本地物化；
2. SHA-256 锁定；
3. 总页数与 PDF metadata 记录；
4. 自动搜索 `1442-025 / 027 / 028 / 029`；
5. 文本定位失败时生成编号 contact sheet；
6. 提取目标图页为单页 PDF + PNG；
7. 为下一阶段控制点与配准 QA 提供稳定输入。

本阶段**不做自动边界推断**。即使成功提取图页，也必须经过 CRS/格网判断、控制点配准和残差 QA 后，才能进入 `georeferenced-official-map`。

## 当前环境实测

v0.13 在当前执行环境中实际运行：

```bash
python scripts/unesco_pdf_pipeline.py fetch \
  https://whc.unesco.org/document/132728 \
  artifacts/unesco/132728.pdf \
  --expected-size 40574291 \
  --timeout 10
```

结果：DNS 解析 `whc.unesco.org` 失败，未生成 `.part` 或 PDF 文件。

因此当前状态仍是：

`download-blocked-environment`

这表示**当前运行环境不能访问原文件**，不是文档不存在。项目同时保留 web 侧已经确认的远程文件长度，用于未来下载后的完整性检查。

## 一键续跑命令

### 1. 安装 PDF 工具依赖

```bash
python -m pip install -r scripts/requirements-pdf.txt
```

### 2. 可断点续传地下载官方地图集

```bash
python scripts/unesco_pdf_pipeline.py fetch \
  https://whc.unesco.org/document/132728 \
  artifacts/unesco/132728.pdf \
  --expected-size 40574291
```

下载器使用 `.part` 文件；服务支持 HTTP Range 时会从已有字节继续。下载完成后才原子替换成最终 PDF，并输出 SHA-256。

### 3. 锁定 PDF 元数据

```bash
python scripts/unesco_pdf_pipeline.py inspect \
  artifacts/unesco/132728.pdf \
  > artifacts/unesco/132728-inspect.json
```

必须保存：

- bytes
- SHA-256
- page count
- PDF metadata

### 4. 首先尝试文本页定位

```bash
python scripts/unesco_pdf_pipeline.py locate \
  artifacts/unesco/132728.pdf \
  --output-json artifacts/unesco/132728-page-hits.json
```

默认检索：

- `1442-025 / Kizil Cave-Temple Complex`
- `1442-027 / Bingling Cave-Temple Complex`
- `1442-028 / Maijishan Cave-Temple Complex`
- `1442-029 / Bin County Cave Temple`

命中页仍需人工确认它是边界地图，而不是目录、图例或正文提及。

### 5. 如果 atlas 是 image-only，生成 contact sheet

```bash
python scripts/unesco_pdf_pipeline.py contact \
  artifacts/unesco/132728.pdf \
  artifacts/unesco/contact \
  --pages-per-sheet 20 \
  --columns 4 \
  --dpi 60
```

Contact sheet 每格显式写 `PDF p.N`。人工找到目标页后再进入提取步骤，不做 OCR 猜页码。

### 6. 提取目标页

示例：

```bash
python scripts/unesco_pdf_pipeline.py extract \
  artifacts/unesco/132728.pdf \
  12,17,21,24 \
  artifacts/unesco/target-pages \
  --dpi 180
```

每页输出：

- 单页 PDF
- PNG
- 单页 PDF SHA-256
- PNG SHA-256

目标页实际页码不得使用示例值硬编码，必须来自步骤4/5的真实定位。

## 第二条官方卷宗路线：UNESCO Nomination file 1442

UNESCO documents 页面另有约 1,018 MB 的完整申遗卷宗：

`https://whc.unesco.org/uploads/nominations/1442.pdf`

它与 40.6 MB 的 Document 132728 **不是同一份文件**。

中国丝绸博物馆 IIDOS 已对该申遗卷宗建立页码索引，因此 v0.13 将这些页窗保存为 `SpatialDocumentLocator`：

| Site | individual annex | management plan |
|---|---:|---:|
| 1442-025 Kizil | 2233–2396 | 3788–3877 |
| 1442-027 Bingling | 2448–2572 | 3967–4086 |
| 1442-028 Maijishan | 2573–2711 | 4087–4243 |
| 1442-029 Bin County | 2712–2773 | 4244–4307 |

此外，一篇 UCL 博士论文把麦积山“三层缓冲区”图的来源具体指向申遗卷宗 **pp.4178–4180**。该线索在项目中标记为 `published-secondary`，只用于缩小扫描窗口；它**不是 Document 132728 的页码**。

## 两条路线如何分工

### Document 132728（40.6 MB）

优先用途：

- 快速定位官方 inscribed property / buffer maps；
- 作为后续配准的首选地图资产；
- 文件较小，适合完整物化与 contact-sheet 扫描。

### Nomination file 1442（约 1,018 MB）

优先用途：

- 补管理规划、保护分区、缓冲区层级等详细图件；
- 利用 IIDOS 页码窗进行定向提取，避免全卷逐页扫描；
- 与 132728 地图交叉验证。

## 配准前置门槛

提取图页后，仍不得直接矢量化。下一阶段至少记录：

- 原 PDF SHA-256
- PDF 1-based page number
- 图号 / 图名
- 单页 PDF SHA-256
- PNG SHA-256
- 比例尺文字
- 坐标格网 / CRS 提示
- 控制点清单及每点来源
- 配准变换类型
- RMSE
- 最大控制点残差
- 视觉 QA 截图

只有这些证据闭合后，对应 `SpatialMapTarget.georeferenceStatus` 才可从 `not-started` / `control-points-needed` 进入 `georeferenced`。


## v0.14 补充：1GB 申遗卷宗不再要求整卷下载

Nomination file 1442 已新增 HTTP Range 定向抽页能力与机器可读页窗。该路线与本页 Document 132728 流程并行，详见 `docs/unesco-1442-range-extraction.md`。优先目标为麦积山 p.4178–4180。
