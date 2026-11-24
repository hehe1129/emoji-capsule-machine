# 扭蛋黄

面向博物馆大屏的交互作品。当前版本支持用鼠标或摄像头手势完成投放、拖拽和抽取。

[打开扭蛋黄在线 Demo](https://emoji-capsule-machine.pages.dev/)

## 本地启动

Windows 上已安装项目依赖时，双击 `Start Preview.cmd` 即可启动并打开 [http://127.0.0.1:5181/](http://127.0.0.1:5181/)。使用时保留启动窗口。电脑重启后再双击一次。

首次设置需要 Node.js 22.12+。在项目目录打开 PowerShell。

```powershell
npm.cmd ci
npm.cmd run dev
```

手动运行开发服务时，打开终端显示的地址，默认是 [http://localhost:5173/](http://localhost:5173/)。点击上方 Emoji 投放。按住容器里的 Emoji 拖动，松手后恢复物理模拟。有五组碰撞反应可试，分别是小鸡和虫子、小鸡和月亮、乌龟和闪电、生气脸和爱心、泪汪汪和太阳。也可以把其中一个拖到另一个上方再松开。按住右侧摇杆向下拉，到位后松手即可抽取。手势模式下在摇杆上握拳、下拉并张手。键盘聚焦摇杆后可按 ↓。点击「开始新一轮」清空容器。抽取结果展示期间，场景暂停。

右上角「调试设置」可实时调整重力、弹性、摩擦、容量、光标平滑、抓取容差和反应冷却。已放入的 Emoji 会保留，降低容量会限制之后的投放。使用 [展览预览参数](http://localhost:5173/?exhibit=1) 可隐藏调试入口。退出此预览时删掉 URL 参数即可。

## 摄像头手势

1. 用 Edge 或 Chrome 打开 HTTPS 网页或本机预览地址，点击右上角「启用摄像头」并允许访问。如果内置预览无法授权摄像头，请直接在浏览器打开网页。
2. 让一只手完整入镜，光标会跟随手掌移动。先张手，再握拳抓取 Emoji 或操作按钮，张手可释放。手离开画面一小段时间后，抓住的 Emoji 会自动释放。重新入镜时先张手。光标未出现时，在「调试设置 → 手势校准」查看本地摄像头画面。
3. 用「调试设置 → 手势校准」调整置信度、水平镜像、水平和垂直裁边比例、手部高度，以及手势光标平滑。默认工作范围已向摄像头画面的下方移动。手还需要完整入镜，若仍觉得需要抬手，可把「手部高度」的数值调大。增大裁边可用更小的手部移动覆盖同一屏幕范围。校准值在当前页面内生效。
4. 点击「切回鼠标」可关闭摄像头。摄像头权限、设备或播放出错时，界面会提示原因并切回鼠标。画面暂时中断时会等待新画面，超时后在顶部提示。模型或识别出错时，调试预览仍可检查摄像头画面，顶部提示如何重试。
5. 「调试设置 → 手势校准」中的摄像头设备列表支持选择系统默认与浏览器可访问的设备。接入 USB 摄像头后如只显示「系统默认」，先点「连接摄像头」并授权，再选择外接设备。摄像头已启用时，切换设备会重新连接。采集模块位于 `src/input/CameraCapture.ts`，可通过 `CameraCapture.open()` 提供其他媒体流，手势模型无需调整。

## 类型检查与生产构建

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run preview
```

预览默认地址为 [http://localhost:4173/](http://localhost:4173/)。换电脑时可复制源码及锁文件，在新机器上运行 `npm.cmd ci` 并重新构建。也可以复制 `dist/`，通过目标电脑的本地静态 HTTP 服务提供文件。首次安装需要 npm 仓库访问。构建产物包含 MediaPipe WASM、模型和表情素材，运行时无需互联网。摄像头画面仅在浏览器本地处理，页面的连接策略会阻止 SDK 向外部发送使用指标。

表情来自 Google 的 [Noto Animated Emoji](https://googlefonts.github.io/noto-emoji-animation/)，使用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 许可。`public/emoji/` 内的 WebP 由原素材缩放并减少动画帧数，保持循环时长。系统启用减少动态效果时使用同一素材的静态首帧。

## Cloudflare Pages 部署

将 GitHub 仓库连接到 Cloudflare 控制台的 **Workers & Pages → Create application → Pages → Connect to Git**。首次连接时授权 GitHub，并选择本项目仓库。 [Cloudflare Pages Git 集成指南](https://developers.cloudflare.com/pages/get-started/git-integration/)

| 配置项 | 值 |
| --- | --- |
| Production branch | `main` |
| Root directory | 仓库根目录，保持默认 |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js | 从 `.node-version` 读取 |

首次发布选择 **Save and Deploy**。部署成功后，从 **Deployments** 打开分配的 `pages.dev` HTTPS 地址。保持 `main` 的自动生产部署开启。每次推送到 `main` 后，在 **Deployments** 核对提交编号和构建状态。

页面由 Vite 构建为单页静态站点，发布在域名根路径。MediaPipe 模型和 WASM 都从本站加载。每个标签页分别创建游戏场景，刷新会开始新一轮。访客打开网页即可使用鼠标，摄像头在主动点击并授权后启用。展览模式可以在地址后加 `?exhibit=1`，并用浏览器全屏功能展示。

目前无需环境变量或服务端。未来如果接入 AI，可以让浏览器请求同源的 Pages Functions `/api/` 路径，并在 Cloudflare 的服务端密钥配置中保存 API 密钥。

## 模块

| 路径 | 职责 |
| --- | --- |
| `index.html`、`src/ui/` | 投放区、调试设置、容器外观、出口、状态提示和屏幕命中测试 |
| `src/main.ts` | 装配输入、业务逻辑及渲染，驱动帧循环 |
| `src/core/AppController.ts`、`config.ts` | 本轮对象和抽取状态、交互操作、舞台尺寸和参数 |
| `src/input/` | 摄像头采集、MediaPipe 推理、独立手势过滤和校准、光标平滑、鼠标指针捕获 |
| `src/emoji/` | Emoji 目录和实体结构 |
| `src/physics/PhysicsManager.ts` | Matter.js 固定步长、边界、抓取期间禁用碰撞、速度与越界保护 |
| `src/render/SceneRenderer.ts` | 同步动画表情与物理坐标，用 PixiJS 渲染反应特效 |
| `src/reactions/` | 匹配和管理配置化反应，记录结果来源、限制重复触发 |
| `src/capsule/CapsuleResult.ts` | 基于本轮对象随机选取，生成结果数据 |

## API 与阶段边界

- PixiJS 8 使用异步 `Application.init()` 和 `app.canvas`。渲染位置采用 1200 × 500 的场景坐标，CSS 等比缩放视口。参见 [PixiJS Application](https://pixijs.com/8.x/guides/components/application)。
- Matter.js 0.20 通过固定步长调用 `Engine.update`，收集 `collisionStart` 后再修改对象，避免在碰撞回调中直接改世界对象。参见 [Matter.Engine](https://brm.io/matter-js/docs/classes/Engine.html)。
- `HandTracking.ts` 管理摄像头和识别生命周期，`MediaPipeRecognizer.ts` 读取 SDK 输出，`GestureFilter.ts` 管理判定、防抖、镜像及裁边。手势模块仅向 `InputManager` 发送归一化坐标和张手、握拳、丢手状态。屏幕命中、投放与抓取继续通过同一套交互入口完成。模型来源见 [Google 官方 Gesture Recognizer 模型](https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task)。
- 五条反应由规则表配置。每只小鸡可吃十条虫子，睡着后也能长大。闪电会留在场内，同一只乌龟可以再次碰到它并加速，每一对乌龟和闪电之间有反应冷却。
- 握拳时会短暂保持原来的瞄准点。拖动 Emoji 后立刻松手可以把它抛出，停稳后松手则会自然下落。
- Phase 4 基于 `CapsuleResult` 扩展卡片、出口动画与导出。Phase 5 完成展馆视觉、全屏和闲置恢复，并按场地校准。
