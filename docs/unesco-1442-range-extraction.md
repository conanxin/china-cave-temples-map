# UNESCO Nomination file 1442 — HTTP Range 定向抽页

更新：2026-09-12 · v0.14

## 为什么需要 Range 抽取

UNESCO 完整申遗卷宗：

`https://whc.unesco.org/uploads/nominations/1442.pdf`

远程对象大小已由 UNESCO 抓取响应确认：**1,018,487,777 bytes**。项目已有 9 条页码定位器，其中最优先的是麦积山缓冲区图线索 **p.4178–4180**。

如果先下载完整约 1 GB PDF，只为获取 3 页，成本和失败面都过大。v0.14 因此新增 seekable HTTP Range reader：只要源服务器支持 byte-range，`pypdf` 可以像访问本地文件一样 seek/read，脚本按需抓取 PDF 对象并输出目标页。

## 0. 安装 PDF 依赖

```bash
python -m pip install -r scripts/requirements-pdf.txt
```

依赖包括 PyMuPDF、Pillow 与 pypdf。

## 1. 先探测远程能力

```bash
python scripts/unesco_pdf_pipeline.py probe-remote \
  https://whc.unesco.org/uploads/nominations/1442.pdf
```

关注：

- `bytes` 是否为 `1018487777`
- `acceptRanges` 是否为 `true`
- `linearized` 是否为 `true/false`
- `contentType` 是否为 PDF

当前容器实测仍在 DNS 阶段失败，因此项目只记录 `blocked-environment`，**没有假设 UNESCO 一定支持 Range**。

## 2. 最高优先：麦积山 p.4178–4180

推荐直接按 manifest target ID：

```bash
python scripts/unesco_pdf_pipeline.py extract-target \
  scripts/unesco_1442_targets.json \
  nomination-1442-maijishan-buffer-map-hint \
  artifacts/unesco/nomination-1442/maijishan-buffer \
  --max-fetch-bytes 268435456
```

也可以直接写页码范围：

```bash
python scripts/unesco_pdf_pipeline.py extract-remote \
  https://whc.unesco.org/uploads/nominations/1442.pdf \
  4178-4180 \
  artifacts/unesco/nomination-1442/maijishan-buffer \
  --expected-size 1018487777 \
  --max-fetch-bytes 268435456
```

输出包括目标单页 PDF / PNG、每页 SHA-256，以及远端读取统计：

- `requestCount`
- `bytesFetched`
- `fetchedFraction`
- `blockSize`
- `maxFetchBytes`

因此能量化“为3页实际读取了多少远端字节”。

## 3. 机器可读页窗 manifest

`scripts/unesco_1442_targets.json` 与网页 `SpatialDocumentLocator` 由自动测试锁步。

当前页窗：

| target | pages |
|---|---:|
| Kizil annex | 2233–2396 |
| Kizil management | 3788–3877 |
| Bingling annex | 2448–2572 |
| Bingling management | 3967–4086 |
| Maijishan annex | 2573–2711 |
| Maijishan management | 4087–4243 |
| **Maijishan buffer-map hint** | **4178–4180** |
| Bin County annex | 2712–2773 |
| Bin County management | 4244–4307 |

页码依据来自中国丝绸博物馆 IIDOS 对原始 nomination PDF 的索引；麦积山 4178–4180 另由 UCL 博士论文的引用缩小到地图窗口。

## 4. 页码不是“自动信任”

即使成功抽出 p.4178–4180，也必须检查：

1. 页眉 / 章节是否属于 Maijishan management plan；
2. 图题是否确实对应 buffer / protection zoning；
3. 页面是否包含比例尺、北箭头、坐标格网或可识别控制点；
4. 若 IIDOS 页码与 PDF 实际页码发生封面偏移，记录 offset，不静默修正；
5. 抽出的页图必须保存 SHA-256。

只有图页身份确认后，才进入控制点和配准阶段。

## 5. 网络预算保护

`HTTPRangeReader` 默认远端读取预算为 **256 MiB**。如果 `pypdf` 为了解析页树 / xref 需要读取超过预算，会主动失败，而不是悄悄把整个 1 GB 文件拉下来。

可以显式调整：

```bash
--block-size 1048576 \
--max-fetch-bytes 268435456
```

如果服务器不支持 Range，脚本会失败并要求回退到完整下载，不会退化成无提示的 1 GB GET。

## 6. 下一步：配准输入包

成功提取目标地图页后，下一阶段每张图至少要产生：

- 原卷宗 URL / Content-Length
- target locator ID
- PDF 1-based page number
- 单页 PDF SHA-256
- PNG SHA-256
- 图名 / 图号
- 比例尺
- CRS / 坐标格网提示
- 控制点候选表
- 原图像素坐标
- 目标 WGS84/GCJ-02 坐标
- 配准模型
- RMSE / 最大残差

在这套证据闭合前，不把图上的红线/绿线转成 `verified Polygon`。
