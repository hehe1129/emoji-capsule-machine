# 扭蛋黄

一台手势互动扭蛋机和一面共同积累作品的海报墙。

## 本地运行

Windows 安装 Node.js 22.12 或更新版本。首次用 PowerShell 运行：

```powershell
npm.cmd ci
npm.cmd run dev
```

打开终端显示的本机地址。依赖装好后还可双击 `Start Preview.cmd`，浏览器会打开 5181 端口。使用时保留启动窗口。

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run preview
```

Vite 本地预览使用浏览器存储。两个标签页能查看同一份本地记录，换设备或浏览器配置后独立。

## 展览操作

- 点击红色机器或海报墙进入放大视角，左上箭头返回。两处共用一个舞台，返回会保留机器里的状态和作品。
- 按住红色顶盖立即投放一枚，之后每 0.7 秒一枚。松开或切换窗口时关闭顶盖。用鼠标拖动或摄像头捏合抓取表情，碰撞可触发原有五组反应及猫追鱼。
- 向下拉黄色摇杆，松手后摇晃 3 秒并打开隔板。主仓和滞留区共用 Matter.js 世界，真实穿过开口的 Emoji 被单向挡板保留。
- 点「带走!」生成竖版海报。归档成功后才清空本次结果。海报可预览、下载 PNG，也可在墙上再次打开。靠近墙的上下沿滚动，移开或捏合时暂停。
- 右上摄像头图标可启用 MediaPipe。拇指和食指分开用来移动和松手，捏合表示按住。摄像头画面留在浏览器。本地 HTTP 或线上 HTTPS 可授权。用 `?exhibit=1` 隐藏调试入口。
- 键盘可以 Tab 选择入口与按钮，空格或回车长按顶盖，聚焦摇杆按 ↓ 抽取，Esc 关闭海报和说明。

## Cloudflare Pages 与共享海报墙

GitHub 继续使用 `main`。Cloudflare Pages 保持已有 Git 集成，构建命令 `npm run build`、产物目录 `dist`。仓库根目录 `functions/api/posters.ts` 提供 JSON 公共档案接口，仅 `/api/posters` 被 Pages Functions 接管。D1 保存规范化的 Emoji 种类、融合状态、排版、作品 ID 和时间。图片由任意访客按原排版重建，无需 R2 或图片上传。

首次为一个环境启用公共墙：

1. 在 Cloudflare 的 **Storage & Databases → D1** 中创建 `egg-posters`。
2. 从项目目录用已授权的 Cloudflare CLI 初始化数据库。

   ```powershell
   npx wrangler d1 execute egg-posters --remote --file migrations/0001_posters.sql
   ```

3. 在 **Workers & Pages → emoji-capsule-machine → Settings → Bindings** 中为 Production 添加 D1 绑定，变量名 `POSTERS`，指向该数据库。为预览分支单独配置数据库可避免测试数据进入正式墙。
4. 重新部署。浏览器打开 `/api/posters` 应返回 `"mode": "shared"`。用两个独立浏览器配置验证写入和读取。

未绑定 D1 时，API 明确返回本地模式。绑定存在但失败时会报告错误，保留滞留区和原作品编号供重试。媒体模型、WASM 和 Emoji 都由当前域名提供。

使用 Wrangler 本地测试实际 Functions 与独立的 SQLite/D1。下列配置写入被 Git 忽略的目录，可直接在本机运行：

```powershell
npm.cmd run build
New-Item -ItemType Directory -Force .wrangler | Out-Null
$localD1 = 'b0c70c61-c330-46f1-bcd2-3bf49da4af52'
$binding = @{ name = 'egg-exhibit-local'; compatibility_date = '2025-08-01'; d1_databases = @(@{ binding = 'POSTERS'; database_name = 'egg-posters-local'; database_id = $localD1 }) }
$binding | ConvertTo-Json -Depth 4 | Set-Content -Encoding ascii .wrangler/exhibit-local.json
npx wrangler d1 execute POSTERS --local --config .wrangler/exhibit-local.json --persist-to .wrangler/exhibit-state --file migrations/0001_posters.sql
npx wrangler pages dev dist --ip 127.0.0.1 --port 8793 --d1 "POSTERS=$localD1" --persist-to .wrangler/exhibit-state
```

用两个浏览器配置打开 `http://127.0.0.1:8793/`，可检查同一张海报是否出现在两个会话上。Vite 预览无需 Cloudflare 账号。

## 源码与素材

- `public/original-emoji/` 存放用户素材拆出的 11 张透明 PNG。画像本体使用原图，融合反馈用缩放、旋转与本套其他图形组合。
- `src/core/`、`src/physics/`、`src/reactions/` 管理坐标、共享物理区域及规则。
- `src/input/` 管理摄像头、关键点、捏合防抖和统一指针事件。
- `src/ui/` 管理单一舞台镜头、机器操作、四列海报墙和光标区域滚动。
- `src/capsule/` 管理物理结果快照、可复现竖版海报和本地／公共归档。
