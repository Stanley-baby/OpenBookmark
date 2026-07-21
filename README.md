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

## 当前状态

需求已经确认并冻结。Raindrop.io CRX 的静态结构、权限、入口、可观察工作流和视觉令牌已经完成分析；登录态动态页面仍需在允许安装扩展的浏览器环境中补充验证。
