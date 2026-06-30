# 主题设计规范

本文档定义 PortalOS 前端主题接入规范。新增应用必须优先使用全局主题 token，避免在应用内部硬编码浅色或深色样式，确保语言、窗口和主题能力可以长期扩展。

## Token 分层

### 桌面与顶部栏

用于桌面背景遮罩和顶部 head 区域。

| Token | 用途 |
| --- | --- |
| `--portal-desktop-overlay` | 桌面壁纸上方的主题遮罩 |
| `--portal-header-bg` | 桌面顶部 header 背景 |
| `--portal-header-text` | 桌面顶部 header 文本和图标颜色 |
| `--portal-header-border` | 桌面顶部 header 内部分隔和边框 |

### 窗口与通用容器

用于应用窗口、弹窗、抽屉等系统级外壳。

| Token | 用途 |
| --- | --- |
| `--portal-window-bg` | 窗口、弹窗、抽屉外壳背景 |
| `--portal-window-header-bg` | 窗口标题栏、弹窗头部、抽屉头部背景 |
| `--portal-window-border` | 窗口标题栏、弹窗、抽屉边框 |
| `--portal-window-title` | 窗口标题、弹窗标题、抽屉标题 |
| `--portal-window-content-bg` | 窗口内容区背景 |
| `--portal-window-content-text` | 窗口内容区默认文本 |

### 通用应用界面

用于设置页、工具页、列表页、表单页等常规应用。

| Token | 用途 |
| --- | --- |
| `--portal-app-bg` | 应用主背景 |
| `--portal-app-surface` | 卡片、面板、侧栏背景 |
| `--portal-app-surface-subtle` | 分段控件、弱背景区域 |
| `--portal-app-text` | 主要文本 |
| `--portal-app-muted` | 描述、辅助文本 |
| `--portal-app-subtle` | 分组标题、弱标签 |
| `--portal-app-border` | 面板、控件边框 |
| `--portal-app-shadow` | 面板阴影 |
| `--portal-app-accent` | 主强调色 |
| `--portal-app-accent-strong` | 强调态文本 |
| `--portal-app-accent-soft` | hover、弱强调背景 |
| `--portal-app-accent-surface` | 选中态背景 |
| `--portal-app-accent-contrast` | 强调色背景上的文本 |
| `--portal-app-accent-shadow` | 强调控件阴影 |
| `--portal-app-control-hover` | 控件 hover 背景 |

### 预览与展示型页面

用于设置页预览、文档占位页等更具展示性的区域。

| Token | 用途 |
| --- | --- |
| `--portal-preview-bg` | 主题预览背景 |
| `--portal-preview-surface` | 主题预览窗口背景 |
| `--portal-preview-text` | 主题预览主要文本 |
| `--portal-preview-muted` | 主题预览辅助文本 |
| `--portal-feature-bg` | 展示型应用背景 |
| `--portal-feature-surface` | 展示型应用主卡片背景 |
| `--portal-feature-eyebrow` | 展示型应用 eyebrow 文本 |
| `--portal-feature-status-bg` | 展示型状态标签背景 |
| `--portal-feature-status-text` | 展示型状态标签文本 |
| `--portal-feature-status-shadow` | 展示型状态标签阴影 |

## 新应用检查清单

提交新应用前确认：

- 应用根容器使用 `--portal-app-bg` 或合适的展示型背景 token。
- 主要卡片、侧栏、面板使用 `--portal-app-surface`。
- 正文、标题、辅助文本分别使用 `--portal-app-text`、`--portal-app-muted` 或 `--portal-app-subtle`。
- 边框、阴影、hover、选中态使用对应 token。
- 没有新增 `html[data-theme='dark']` scoped 覆盖。
- 没有让窗口内容区露出浅色硬编码背景。
- 在浅色和深色主题下都手动打开应用检查 header、内容区、弹窗和滚动区域。
- 运行 `pnpm build` 确认构建通过。

## 主题切换与持久化

- 设置应用通过 `portal_theme` 保存主题。
- 应用启动时在 `apps/frontend/src/main.ts` 读取 `portal_theme`，并写入 `document.documentElement.dataset.theme`。
- 组件只读取 CSS token，不直接读取本地存储。
- 未来如增加“跟随系统”，应在启动和设置逻辑中解析最终主题，再继续写入 `html[data-theme]`。
