# gameAgent

AI Agent 的前端工作台，用于通过自然语言创建和迭代网页工具、2D 游戏和 3D 游戏。工作台把 AI 对话、文件编辑、实时预览、图像生成、项目配置、版本快照及部署进度放在同一界面，帮助用户从需求描述推进到可运行的项目。

配套后端是同级目录中的 `agentNode`，负责账户、数据库、服务器项目文件、模型调用、对象存储和部署。本项目负责页面交互、状态管理、消息订阅，以及浏览器中的编辑和预览。

## 主要功能

| 页面 / 模块 | 能力 |
| --- | --- |
| 登录与账户 | 注册登录、QQ / 微信扫码、第三方账户绑定、用户资料与主题切换 |
| 项目中心 | 创建工具 / 2D / 3D 项目、筛选项目、编辑资料和进入工作台 |
| AI 对话 | 流式回复、历史会话、消息重连、停止生成、图片输入和工具执行状态 |
| 模型与强度 | 使用后台默认模型，选择可用模型与支持的推理强度，恢复会话选择 |
| 文件编辑 | 文件树、Monaco 编辑器、内容保存与项目预览同步 |
| 实时预览 | WebContainer 安装依赖、启动开发服务、iframe 预览与刷新 |
| 图像工作台 | 文生图、参考图片、任务进度和历史结果 |
| 配置与素材 | 项目外观配置、素材上传和管理 |
| 版本与模板 | 项目快照、恢复差异查看、模板版本查看与升级 |
| 日志与发布 | 会话工具日志、构建步骤、部署结果及线上链接 |
| 管理控制台 | 全站统计、用户权限、项目、素材、生图任务、模型同步与默认模型设置 |

## 技术栈

- Vue 3、TypeScript、Vite，使用 Vue Router 和 Pinia。
- Element Plus 提供组件，Monaco 提供代码编辑，WebContainer 提供浏览器运行环境。
- Axios 与认证 fetch 处理 HTTP / SSE，腾讯 COS SDK 上传素材。
- ECharts 展示后台统计；Markdown-it 和 DOMPurify 渲染对话内容。
- 工作台采用 CSS 变量维护主题与界面样式；项目模板拥有各自的依赖和构建配置。

本项目的 Node.js 范围以 `package.json` 的 `engines` 为准；与后端一起开发时可统一使用 Node.js 22.12+。包管理器使用 pnpm 11.5.2。

## 项目结构

```text
gameAgent/
├── public/                     # SVG、图标等静态资源
├── src/
│   ├── main.ts                 # 应用入口、路由、状态和主题初始化
│   ├── App.vue                 # 根组件
│   ├── router/                 # 页面路由及登录、管理权限守卫
│   ├── ajax/                   # 统一请求、错误处理和 Token 刷新
│   ├── http/                   # 按业务划分的接口与类型
│   ├── stores/                 # 账户、项目、主题、外观和 Token 用量状态
│   ├── components/             # 用户菜单、资料、扫码登录等公共组件
│   ├── login/                  # 登录与注册页面
│   ├── home/                   # 项目中心
│   ├── builder/                # 项目工作台
│   │   ├── chat/               # 消息、Markdown、模型与强度选择
│   │   ├── session/            # 会话列表与共享状态
│   │   ├── file/               # 文件树与 Monaco 编辑器
│   │   ├── preview/            # WebContainer、预览与文件同步
│   │   ├── image/              # 图像生成工作台
│   │   ├── config/             # 外观配置及素材管理
│   │   ├── snapshot/           # 快照、文件差异及恢复
│   │   ├── temp/               # 模板版本与升级
│   │   ├── log/                # 会话及工具日志
│   │   └── build/              # 构建事件、类型与共享状态
│   ├── admin/                  # 管理控制台、统计图表及管理模块
│   ├── a_template/             # 工具、2D、3D 项目模板源文件
│   ├── styles/                 # 全局样式、主题变量及基础布局
│   └── utils/                  # 主题、项目配置和跨源隔离等工具
├── .env.development            # 开发环境 API 地址
├── .env.production             # 生产模式 API 地址
└── vite.config.ts              # Vite、组件自动导入与响应头配置
```

## 本地开发

先按 `agentNode` 的 README 准备并启动后端，默认地址为 `http://localhost:3000`。随后在本项目目录运行：

```sh
pnpm install
pnpm dev
```

默认打开 `http://localhost:5173`。登录后在项目中心创建或选择项目，再进入工作台进行对话、编辑和预览。管理控制台需要后端授予 `admin` 或 `super` 角色。

### API 环境配置

| 文件 | 默认配置 | 用途 |
| --- | --- | --- |
| `.env.development` | `VITE_API_URL=http://localhost:3000` | 本地前后端分别运行 |
| `.env.production` | `VITE_API_URL=/api` | 与前端同源，通过反向代理访问后端 |

修改后端端口或访问域名时，应调整 API 地址，并同步修改后端的来源白名单。`VITE_` 变量会进入前端构建产物，用于公开配置。

`pnpm dev:prod` 使用生产模式配置启动 Vite，因此会读取 `.env.production`。它只切换运行模式，不会启动后端，也不会自动把 `/api` 代理到本地服务；当前 `vite.config.ts` 没有配置 API 代理。

## 页面与权限

| 路由 | 内容 |
| --- | --- |
| `/login`、`/register` | 登录与注册，无需登录即可访问 |
| `/` | 登录后的项目中心 |
| `/builder?projectId=...` | 指定项目的工作台 |
| `/admin` | 管理控制台，需 `admin` / `super` 权限 |
| `/agent`、`/mine` | 当前为预留占位页面 |

认证状态由 Pinia 持久化，请求层统一附带 Access Token，并在需要时使用 Refresh Token 刷新。前端路由守卫负责页面访问体验，实际业务权限由后端接口校验。

## 工作台运行方式

1. 项目中心从后端读取项目资料，创建项目时由后端复制对应模板到服务器目录。
2. 工作台加载会话、项目文件和配置，文件编辑器与预览使用当前项目状态。
3. AI 对话通过 SSE 接收回复和工具事件；生成任务由后端托管，前端支持重连订阅与主动停止。
4. 项目文件挂载到 WebContainer，在浏览器中安装依赖并启动开发服务，预览显示在 iframe 中。保存文件和相关 AI 工具结果会同步到预览。
5. 构建发布请求发送给后端，由后端安装、构建并发布到 Cloudflare Pages，前端展示步骤和结果链接。

浏览器预览与服务器发布是两条独立流程；预览可用不代表后端构建环境或部署凭证已经配置完成。

### 模型与图像

可用模型和默认模型由后台维护，新会话未指定模型时使用默认值。输入框底部的模型名称和强度文字都打开强度面板；面板使用 Element Plus 滑块，点击顶部模型 / 强度标题进入模型选择菜单。没有强度配置的模型只提供模型选择。

对话中的图片可用于视觉分析，图像工作台也可以创建独立生图任务。素材上传使用后端签发的 COS 临时凭证，生成结果由后端处理并保存到 COS。

### 项目模板

`src/a_template/projectTemp`、`gameTemp2d`、`gameTemp3d` 分别提供工具、2D 和 3D 模板。模板包含自己的 `package.json`、样式、提示词以及 `agent_base` 版本记录。

新增或升级模板时，需要同步后端实际使用的模板目录；只修改本仓库的模板源文件不会自动更新服务器上的模板。

## 构建与代码检查

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 启动本地开发服务 |
| `pnpm dev:prod` | 使用生产模式环境变量启动开发服务 |
| `pnpm build` | 类型检查并生成生产构建，输出到 `dist/` |
| `pnpm build-only` | 只生成生产构建 |
| `pnpm type-check` | 使用 vue-tsc 检查 Vue / TypeScript 类型 |
| `pnpm preview` | 本地预览已经生成的构建产物 |
| `pnpm lint` | 运行 Oxlint 与 ESLint，脚本包含自动修复 |
| `pnpm format` | 使用 Prettier 格式化 `src/` |

仓库通过 `.gitattributes`、`.editorconfig` 和 Prettier 配置统一 LF 换行。组件及 Element Plus 类型由自动导入插件维护，`components.d.ts` 可能随使用的组件更新。

## 部署与预览要求

生产构建完成后部署 `dist/`，并为 Vue Router 的 history 模式配置页面回退：非静态文件的页面路径需要返回 `index.html`。使用默认生产 API 地址时，将 `/api/` 反向代理到后端实际端口，并移除 `/api` 前缀。

WebContainer 与编辑器的运行检查要求页面处于跨源隔离环境。Vite 的开发和 preview 服务已经注入以下响应头；生产静态服务器也需设置 COOP/COEP，其中 COEP 可以选择 `credentialless` 或 `require-corp`：

```text
Cross-Origin-Embedder-Policy: credentialless
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: cross-origin
```

`WebContainer.boot` 的 `coep` 参数必须与页面响应头保持一致。启动代码会读取当前页面实际返回的 COEP 值（`credentialless` 或 `require-corp`）后传入 SDK。部署在 Vercel 时由 `vercel.json` 设置响应头；其他平台需在实际返回的 HTML 响应中配置，并确认 CDN 或反向代理没有移除这些响应头。

生产页面应使用 HTTPS；本地可通过 localhost 开发。聊天、生图、OAuth 和构建进度使用 SSE，API 代理需要关闭响应缓冲并配置足够的连接超时。浏览器预览还需要访问 WebContainer 运行环境和项目依赖仓库，外部图片及 COS 素材需要满足对应的跨源访问配置。

若提示“预览环境初始化超时”，先在浏览器开发者工具的 Network 中检查 `stackblitz.com/headless`。`net::ERR_TIMED_OUT` 表示浏览器未能加载 StackBlitz 启动页，需要让浏览器网络或代理稳定访问 `stackblitz.com`、`c.staticblitz.com`、`w-corp-staticblitz.com` / `w-credentialless-staticblitz.com` 及动态生成的 `*.webcontainer-api.io` 域名，并检查第三方 Cookie / 存储限制。此时还未进入模板依赖安装；若已显示“正在安装依赖”，再检查 `pnpm install` 控制台输出和模板的 `dev` 脚本。模型、数据库和服务器构建问题则在 `agentNode` 中排查。
