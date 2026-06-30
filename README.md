# PortalOS

[![Project Status: Early Pre-release](https://img.shields.io/badge/Project%20Status-Early%20Pre--release-amber.svg)](https://github.com/guowenju/portal-os)
[![Version: 0.1.0-alpha.1](https://img.shields.io/badge/Version-0.1.0--alpha.1-blue.svg)](https://github.com/guowenju/portal-os)
[![Container: Docker](https://img.shields.io/badge/Container-Docker-2496ed.svg)](https://hub.docker.com/r/guowenju/portal-os)
[![License: MIT](https://img.shields.io/badge/License-MIT-16a34a.svg)](https://opensource.org/license/mit)

PortalOS 是一个动物森林风格的仿桌面系统博客。它把博客、文档和个人内容组织成一个可以在浏览器中运行的轻量桌面环境，让访问者像打开应用一样阅读内容、切换窗口和探索站点。

## 项目状态

PortalOS 仍处于早期预发布阶段，核心体验和接口可能会随着设计迭代继续调整。当前版本适合预览、试用和参与反馈。

## 项目预览

![PortalOS 项目预览](https://raw.githubusercontent.com/guowenju/portal-os/main/docs/images/portal-os-preview.png)

## 项目特性

- 仿桌面系统体验：以窗口、应用和工作区组织内容，而不是传统博客列表。
- 动物森林风格界面：面向轻松、温暖、可探索的个人站点体验。
- 应用化内容入口：博客、文档和工具可以作为独立应用运行在统一桌面壳中。
- 前后端一体化：前端负责交互体验，Rust 后端提供服务能力与静态资源承载。
- Docker 部署支持：提供脚本和 Compose 示例，便于自托管和发布。

## 技术栈

- 前端：React、TypeScript、Vite
- 后端：Rust、Axum
- 包管理：pnpm、Cargo
- 容器化：Docker、Docker Compose

## 快速开始

安装前端依赖：

```bash
pnpm install
```

启动开发服务：

```bash
pnpm dev
```

构建前端资源：

```bash
pnpm build
```

## 开发命令

- 前端格式化：`pnpm format`
- 前端检查：`pnpm lint`
- 前端构建：`pnpm build`
- 后端格式化：`cargo fmt`
- 后端检查：`cargo clippy --all-targets --all-features -- -D warnings`

## Docker 镜像

一键构建镜像：

```bash
./scripts/build-docker-image.sh
```

可通过环境变量覆盖镜像名、标签或基础镜像：

```bash
IMAGE_NAME=portal-os IMAGE_TAG=0.1.0 scripts/build-docker-image.sh
NODE_IMAGE=node:24-bullseye-slim RUST_IMAGE=rust:1.94-bullseye RUNTIME_IMAGE=debian:bullseye-slim scripts/build-docker-image.sh
```

未显式设置 `IMAGE_TAG` 时，脚本会默认读取根目录 `Cargo.toml` 中的 `workspace.package.version`。

启动 Compose 示例：

```bash
docker compose -f docker-compose.example.yml up -d
```

## 开源协议

本项目基于 MIT 协议开源。
