# OpenBookmark 文档索引

OpenBookmark 是一个 local-first、开源的浏览器书签管理插件。项目以独立品牌和独立代码实现 Raindrop.io 的核心工作流及高还原度界面，并增加用户可控的自动备份能力。

## 文档

- [产品需求](./REQUIREMENTS.md)
- [MVP 规格（ready-for-agent）](./.scratch/openbookmark-mvp/spec.md)
- [领域词汇表](./CONTEXT.md)
- [Raindrop.io CRX 分析](./CRX_ANALYSIS.md)
- [ADR 0001：本地优先并分离备份与同步](./docs/adr/0001-local-first-and-separate-backup-from-sync.md)
- [ADR 0002：采用净室方式进行高还原度重实现](./docs/adr/0002-clean-room-reimplementation.md)
- [ADR 0003：采用 AGPL-3.0 许可证](./docs/adr/0003-use-agpl-3-license.md)
- [ADR 0004：申请全站读取权限但限制实际读取行为](./docs/adr/0004-broad-host-permission-with-narrow-use.md)
- [MVP 发布说明](./docs/release-mvp.md)
- [隐私检查清单](./docs/privacy-checklist.md)

## 当前状态

首个离线收藏闭环已经可用：快速收藏弹窗把当前页面保存到本地 IndexedDB，全页管理器会立即显示并在浏览器重启后保留数据。Manager 已整合收藏夹、标签、搜索筛选、回收站、迁移、缩略图缓存、WebDAV 加密备份、自动备份和安全恢复入口。

## 本地构建

要求 Node.js 20.12 或更高版本。

```sh
npm install
npm run build
npm run build:edge
npm run package:release
```

在 Chrome 或 Edge 的扩展管理页启用开发者模式，选择“加载已解压的扩展程序”，然后加载 `.output/chrome-mv3` 或 `.output/edge-mv3`。

```sh
npm run typecheck
npm test
```

## 隐私说明

扩展清单按项目权限决策声明全站访问，但当前版本没有常驻内容脚本，也不会监控或记录浏览历史。只有用户通过工具栏、右键菜单或快捷键明确触发收藏动作，或在全页管理器中主动刷新选中书签元数据时，扩展才读取对应页面的 URL、标题、描述和封面元数据。

缩略图缓存保存在独立本地缓存库中，可清空或重新生成，不进入 JSON 导出或 WebDAV 备份。WebDAV 备份只访问用户配置的目标地址；默认备份使用本地恢复密码加密，凭据和恢复密码只保存在扩展本地存储，不写入导出文件。OpenBookmark 不包含账号、遥测、分析 SDK 或网络后端。
