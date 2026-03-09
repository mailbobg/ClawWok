<div align="center">

<img src="docs/screenshots/01-home.png" width="680" alt="ClawWok Home" />

# ClawWok 炒龙虾

**OpenClaw GUI Installer & Manager for macOS**

[English](#english) · [中文](#中文)

[![macOS](https://img.shields.io/badge/macOS-12%2B-black?logo=apple)](https://github.com/mailbobg/ClawWok/releases)
[![Universal](https://img.shields.io/badge/arch-Apple%20Silicon%20%2B%20Intel-blue)](#)
[![Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8D8?logo=tauri)](https://tauri.app)

</div>

---

## English

ClawWok is a macOS desktop app that installs, configures, and manages [OpenClaw](https://openclaw.ai) — a self-hosted AI agent gateway — without touching the terminal. Connect AI models (Claude, DeepSeek, Minimax) to messaging channels (Feishu / WhatsApp) in under 5 minutes.

### Features

- **Zero-terminal setup** — guided 5-step wizard
- **Auto environment detection** — installs Node.js, npm, OpenClaw automatically
- **AI model selection** — Claude, DeepSeek (direct & free via OpenRouter), Minimax
- **Feishu WebSocket** — long-connection bot, no public IP or webhook URL needed
- **WhatsApp QR login** — scan once, works everywhere
- **Gateway manager** — start / stop OpenClaw Gateway from the UI
- **Universal Binary** — runs natively on Apple Silicon and Intel Macs

### Download

Download the latest `.dmg` from [Releases](https://github.com/mailbobg/ClawWok/releases).

### Screenshots

| Step | Preview |
|------|---------|
| Home — two entry points | <img src="docs/screenshots/01-home.png" width="480"> |
| Step 2 — Environment Setup | <img src="docs/screenshots/02-environment.png" width="480"> |
| Step 3 — AI Model Config | <img src="docs/screenshots/03-model.png" width="480"> |
| Step 4 — Channel (Feishu connected) | <img src="docs/screenshots/04-channel-feishu.png" width="480"> |
| Step 5 — Complete & Gateway running | <img src="docs/screenshots/05-complete.png" width="480"> |

---

### Feishu (Lark) Setup

ClawWok uses **WebSocket long connection** — the bot dials out to Feishu's servers.
**No public IP, no port forwarding, no reverse proxy needed.**

#### Step 1 — Create a Feishu app

1. Open [Feishu Open Platform](https://open.feishu.cn/app) and click **Create App → Custom App**
2. Fill in the name and description; upload an icon if you like
3. Under **Credentials & Basic Info**, copy your **App ID** and **App Secret**

#### Step 2 — Enable required permissions

Go to **Permissions & Scopes** and add the following, then publish a version to activate them:

| Permission | Purpose |
|---|---|
| `im:message` | Read incoming messages |
| `im:message:send_as_bot` | Send replies as the bot |
| `im:chat` | Access chat metadata |
| `contact:contact.base:readonly` | Read sender's profile |

#### Step 3 — Subscribe to message events

1. Go to **Event Subscriptions**
2. Set **Connection Mode** to **Long Connection** (长连接) — *not* webhook
3. Add the event `im.message.receive_v1`

#### Step 4 — Enable the bot and allow single-chat (单聊)

1. Go to **Features → Bot** and enable the bot
2. Enable **Allow users to send direct messages to the bot** (允许用户向机器人发送消息)

#### Step 5 — Paste credentials into ClawWok

Enter your **App ID** and **App Secret** in ClawWok's Channel step and click **Connect Feishu**.

ClawWok automatically:
- Verifies the credentials against the Feishu API
- Writes the config via `openclaw config set`
- Sets `dmPolicy=open` so any user can DM the bot
- Runs `openclaw doctor --fix` to add `allowFrom: ["*"]`

#### Finding your bot in Feishu

In the Feishu mobile app, search for your bot name — it appears under the **Apps** category. Tap it to open a direct-message conversation.

---

### WhatsApp Setup

ClawWok uses a WhatsApp Web-compatible library. **No business account or Meta approval needed** — it works with any regular WhatsApp number.

#### Step 1 — Select WhatsApp in ClawWok

Switch to the **WhatsApp** tab in the Channel step and click **Start WhatsApp Login**.

#### Step 2 — Scan the QR code

An ASCII QR code appears directly in the app window. On your phone:

| Platform | Path |
|---|---|
| Android | ⋮ menu → Linked Devices → Link a Device |
| iPhone | Settings → Linked Devices → Link a Device |

Point your camera at the QR code shown in ClawWok.

#### Step 3 — Wait for confirmation

After a successful scan the app shows **"WhatsApp 登录成功 ✓"**. The gateway is now connected.

> **Note:** Your phone must remain online with WhatsApp active — same requirement as WhatsApp Web.

---

### Build from Source

```bash
# Prerequisites: Rust toolchain, Node.js ≥ 18, Xcode Command Line Tools
git clone https://github.com/mailbobg/ClawWok.git
cd ClawWok

npm install

# Dev mode (hot-reload)
export PATH="$HOME/.cargo/bin:$PATH"
npm run tauri dev

# Production build — Universal Binary (Apple Silicon + Intel)
npm run tauri build -- --target universal-apple-darwin
# Output: src-tauri/target/universal-apple-darwin/release/bundle/dmg/
```

---

## 中文

ClawWok 是一款 macOS 桌面应用，无需打开终端，即可完成 [OpenClaw](https://openclaw.ai) 的安装、配置与管理。5 分钟内将 AI 模型（Claude、DeepSeek、Minimax）接入即时通讯渠道（飞书 / WhatsApp）。

### 功能亮点

- **零终端操作** — 5 步向导引导完成全部配置
- **自动环境检测** — 自动安装 Node.js、npm、OpenClaw 核心
- **多 AI 模型** — Claude、DeepSeek 直连 / 免费版（OpenRouter）、Minimax
- **飞书 WebSocket 长连接** — 无需公网 IP，无需内网穿透，无需回调地址
- **WhatsApp 扫码登录** — 手机扫一次即可收发消息
- **Gateway 管理页** — 界面中直接启动 / 停止 OpenClaw Gateway
- **Universal Binary** — Apple Silicon 和 Intel 芯片 Mac 均可原生运行

### 下载

从 [Releases](https://github.com/mailbobg/ClawWok/releases) 下载最新 `.dmg` 安装包。

### 界面截图

| 步骤 | 截图 |
|------|------|
| 首页 — 双入口 | <img src="docs/screenshots/01-home.png" width="480"> |
| 第 2 步 — 环境准备 | <img src="docs/screenshots/02-environment.png" width="480"> |
| 第 3 步 — 模型配置 | <img src="docs/screenshots/03-model.png" width="480"> |
| 第 4 步 — 渠道接入（飞书已连接） | <img src="docs/screenshots/04-channel-feishu.png" width="480"> |
| 第 5 步 — 完成 & Gateway 运行中 | <img src="docs/screenshots/05-complete.png" width="480"> |

---

### 飞书配置详细步骤

ClawWok 使用**长连接（WebSocket）**模式——机器人主动连接飞书服务器。
**无需公网 IP、无需内网穿透、无需配置回调地址。**

#### 第一步 — 创建飞书应用

1. 打开 [飞书开放平台](https://open.feishu.cn/app)，点击 **创建应用 → 企业自建应用**
2. 填写应用名称和描述（可上传图标）
3. 在 **凭证与基础信息** 页面，复制 **App ID** 和 **App Secret**

#### 第二步 — 开通权限

进入 **权限管理**，搜索并添加以下权限，完成后发布版本令权限生效：

| 权限标识 | 用途 |
|---|---|
| `im:message` | 读取收到的消息 |
| `im:message:send_as_bot` | 以机器人身份发送回复 |
| `im:chat` | 获取会话基础信息 |
| `contact:contact.base:readonly` | 读取发消息用户的基础信息 |
![Uploading image.png…]()

#### 第三步 — 订阅消息事件

1. 进入 **事件与回调 → 事件配置**
2. 将接收事件方式选择为 **使用长连接接收事件**（不要选 Webhook）
3. 点击 **添加事件**，搜索并添加 `im.message.receive_v1`

#### 第四步 — 开启机器人与单聊

1. 进入 **应用功能 → 机器人**，开启机器人功能
2. 找到 **允许用户向机器人发送消息**（单聊开关），将其开启

#### 第五步 — 填入 ClawWok

在 ClawWok 渠道配置步骤中，输入 App ID 和 App Secret，点击 **一键连接飞书**。

ClawWok 自动完成以下操作：
- 调用飞书 API 验证凭据有效性
- 通过 `openclaw config set` 写入配置
- 设置 `dmPolicy=open`，允许任意用户给机器人发消息
- 执行 `openclaw doctor --fix` 自动补全 `allowFrom: ["*"]`

#### 在飞书中找到机器人

在飞书 App 搜索框搜索机器人名称，在 **应用** 分类下找到它，点击开始对话。

---

### WhatsApp 配置详细步骤

ClawWok 底层使用 WhatsApp Web 兼容库，**使用普通 WhatsApp 账号即可，无需企业账号，无需 Meta 审批**。

#### 第一步 — 选择 WhatsApp 渠道

在 ClawWok 渠道配置步骤中切换到 **WhatsApp** 标签，点击 **开始 WhatsApp 登录**。

#### 第二步 — 扫描二维码

App 界面会直接显示 ASCII 艺术二维码。在手机 WhatsApp 中操作：

| 平台 | 操作路径 |
|---|---|
| Android | 右上角三点菜单 → 已关联设备 → 关联设备 |
| iPhone | 设置 → 已关联设备 → 关联设备 |

用摄像头对准 ClawWok 界面上的二维码扫描。

#### 第三步 — 确认连接

扫码成功后 App 显示 **"WhatsApp 登录成功 ✓"**，Gateway 即可收发消息。

> **注意：** 手机 WhatsApp 需保持正常在线状态（与 WhatsApp Web 机制相同）。

---

### 从源码构建

```bash
# 前置依赖：Rust、Node.js ≥ 18、Xcode Command Line Tools
git clone https://github.com/mailbobg/ClawWok.git
cd ClawWok

npm install

# 开发模式（热更新）
export PATH="$HOME/.cargo/bin:$PATH"
npm run tauri dev

# 正式打包（Universal Binary，同时支持 Intel 和 Apple Silicon）
npm run tauri build -- --target universal-apple-darwin
# 产物：src-tauri/target/universal-apple-darwin/release/bundle/dmg/
```

---

<div align="center">
<sub>Built with Tauri 2 · React 18 · Rust · macOS only · v0.1.0</sub>
</div>
