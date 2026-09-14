# 中国代表性石窟寺互动地图网页设计

日期：2026-09-12

## 1. 目标

建立一个可长期迭代的个人研究型网页，把国博《中国代表性佛教石窟寺分布图》中 01–112 共 112 处点位全部落到高德地图上，并为后续扩展年代、朝代、国保批次、宗教属性、岩性、造像规模、残损/流失、参考文献与现场考察记录提供稳定的数据结构。

首版强调三件事：

1. 点位准确：每一处遗址使用人工核验后的地点记录，不使用“省/市中心点”冒充遗址坐标。
2. 可交互：搜索、筛选、聚合、编号索引、详情侧栏、地图联动。
3. 可继续开发：数据、地图逻辑、筛选逻辑、UI 组件拆分，避免一次性大文件。

## 2. 技术方案

- 前端：Vite + React + TypeScript
- 地图：高德地图 JavaScript API 2.0
- 样式：普通 CSS Modules / 组件级 CSS，不引入大型 UI 框架
- 数据：本地 TypeScript/JSON 静态数据集，后续可替换为远程数据源
- 测试：Vitest + React Testing Library
- 构建：纯静态站点，可直接部署到任意静态托管

## 3. 高德 Key 方案

采用用户选择的方案 A：源码中不写真实 Key。

运行时读取：

- `VITE_AMAP_KEY`
- `VITE_AMAP_SECURITY_CODE`

仓库仅提供 `.env.example`：

```text
VITE_AMAP_KEY=AMAP_KEY
VITE_AMAP_SECURITY_CODE=AMAP_SECURITY_CODE
```

如果未配置 Key，页面不静默失败，而是在地图区域显示清晰的配置提示，同时编号列表、数据浏览和筛选仍可使用。

## 4. 点位准确性定义

高德地图使用 GCJ-02 坐标系。每个点位记录保存为 GCJ-02 经纬度，并附坐标核验信息。

“准确”定义为：

- 单体石窟/寺院：标记到遗址本体或官方入口附近，而不是行政区中心。
- 大型遗址群：标记到官方认定遗址中心、主要洞窟群中心或核心参观点，并在详情中标记 `siteExtent = group`。
- 同名地点：必须依靠县/乡/村等行政信息消歧。
- 坐标不能只由名称自动地理编码后直接入库；自动地理编码只可作为辅助候选。

每条记录包含：

- `coordinateSource`：坐标依据
- `coordinateConfidence`：`verified` / `probable`
- `verificationNote`：说明核验方式

首版地图默认只展示 `verified` 数据。112 条数据全部完成核验后才发布“完整模式”。

## 5. 数据模型

每处遗址定义为 `CaveTempleSite`：

```ts
export type RegionGroup = 'xinjiang' | 'qingzang' | 'north' | 'south';
export type HeritageBatch = 1 | 2 | 3 | 4 | 5 | '5-supplement' | 6 | 7 | 8;
export type CoordinateConfidence = 'verified' | 'probable';

export interface CaveTempleSite {
  id: number;
  code: string;                 // "01" ... "112"
  name: string;
  aliases: string[];
  regionGroup: RegionGroup;
  province: string;
  prefecture: string;
  county: string;
  locality?: string;
  lng: number;                  // GCJ-02
  lat: number;                  // GCJ-02
  siteExtent: 'single' | 'group';
  heritageBatch: HeritageBatch;
  religion: 'buddhist' | 'daoist' | 'mixed' | 'other';
  siteType: 'cave-temple' | 'cliff-carving' | 'giant-buddha' | 'mixed';
  mainPeriods: string[];
  coordinateConfidence: CoordinateConfidence;
  coordinateSource: string;
  verificationNote: string;
  notes?: string;
}
```

后续兼容扩展字段：

- `geology`
- `maxStatueHeightM`
- `damageStatus`
- `missingHeadEvidence`
- `bibliography`
- `fieldNotes`
- `historicPhotos`
- `externalLinks`

## 6. 首版页面结构

### 顶部标题区

- 标题：中国代表性石窟寺互动地图
- 副标题：国博展墙 112 点数字化研究版
- 总数 / 当前筛选数

### 左侧控制栏

桌面端固定；移动端为抽屉。

包含：

- 全文搜索：编号、名称、别名、省市县
- 地区：新疆 / 青藏 / 中原北方 / 南方
- 国保批次：第一至第八批及第五批增补
- 类型：石窟寺 / 摩崖造像 / 巨型造像 / 综合
- 宗教：佛教 / 道教 / 混合
- “只显示已核验坐标”开关
- 重置筛选

### 地图区

- 高德地图底图
- 112 个自定义编号 Marker
- 缩放级别较小时启用点聚合
- 点击 Marker 打开详情侧栏并高亮
- Hover 显示名称 + 编号
- 根据筛选动态更新可见 Marker
- “适配当前结果”按钮自动调整视野

### 右侧详情栏

显示：

- 编号、名称、别名
- 行政位置
- 四大区
- 国保批次
- 主要年代
- 宗教属性
- 遗址类型
- 坐标核验状态
- 坐标来源说明
- 后续研究字段占位区域

### 编号索引

提供 01–112 紧凑索引，可按编号跳转到地图点位；支持按当前筛选结果隐藏/灰化。

## 7. 视觉设计

整体参考“研究档案 + 地图工作台”，而不是旅游门户。

- 背景：浅米白 / 纸张感
- 文字：深墨色
- 点位：暗朱红，呼应用户照片中的展墙红色编号
- 区域筛选可使用克制的辅助色，但不把地图做成彩虹色
- 编号 Marker 比普通地图 POI 更突出
- 详情面板强调信息层级与可读性

移动端优先保证：地图可全屏、筛选可折叠、详情从底部弹出。

## 8. 点位数据核验工作流

对 112 个地点逐条执行：

1. 从展墙照片确认官方名称与编号。
2. 根据全国重点文物保护单位名单确认正式名称、批次、省级行政区。
3. 使用至少一个可定位来源确认县/乡/村或具体山体/景区。
4. 获取候选经纬度并转换/确认至 GCJ-02。
5. 与高德底图中的遗址、景区入口、山体位置交叉检查。
6. 对大型遗址群明确 Marker 代表“核心点”而不是全部范围。
7. 写入 `coordinateSource` 与 `verificationNote`。

若资料发生冲突，记录冲突，不凭感觉选点。

## 9. 数据来源边界

首版数据来源优先级：

1. 国家文物局 / 国务院国保名录
2. 地方文旅、文物部门、遗址保护机构
3. 遗址官方景区或博物馆资料
4. 高质量学术资料
5. 高德地图 POI 用于最终空间复核

百科类来源只用于辅助消歧，不作为唯一坐标依据。

## 10. 错误处理

- 高德脚本加载失败：地图区显示可恢复错误信息。
- Key 未配置：显示 `.env.local` 配置说明。
- 数据缺失：详情中显示“尚未录入”，不伪造内容。
- 坐标未核验：首版默认不进完整地图层；开发模式可开启查看。

## 11. 可持续开发边界

首版不做：

- 用户账户
- 后端数据库
- 在线编辑器
- 路线规划
- 云端同步
- 评论系统

但数据模型和组件边界预留未来添加：田野记录、文献、历史照片、佛首流失追踪、专题路线等能力。

## 12. 首版验收标准

1. 项目可通过 `npm install && npm run dev` 启动。
2. 未配置高德 Key 时页面仍能浏览全部 112 条文字数据。
3. 配置 Key 后高德地图正常加载。
4. 112 条记录编号唯一且连续 01–112，无遗漏、无重复。
5. 所有发布 Marker 为 `coordinateConfidence = verified`。
6. 搜索和所有筛选可以组合使用。
7. Marker、编号索引、详情侧栏三者双向联动。
8. 桌面端和手机端均可用。
9. `npm test` 通过核心数据完整性、筛选逻辑和关键 UI 测试。
10. 后续新增字段无需修改地图核心逻辑。
