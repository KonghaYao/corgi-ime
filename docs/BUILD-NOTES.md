# 构建与验收分层

- 代码单元测试：Node.js 原生 test runner；Lua 真实解释器 + Rime API stub。
- 打包：Linux 上交叉组装 Electron 官方 macOS x64、macOS arm64、Windows x64 运行时。
- 二进制结构：ZIP/ASAR 文件比对，用来确认携带最终代码；不能证明该操作系统启动成功。
- 原生运行验收：macOS/Windows 未执行，没有对应实机；必须按 ACCEPTANCE.md 验证。
- Linux Chromium 截图尝试：本环境 socket() EPERM，含升级权限后仍受限，因此未获取真实 UI 浏览器截图。
- 签名：Windows 没有 Authenticode，macOS 没有签名/公证；不能当作正式发行包。macOS arm64 对签名的限制尤其需要本机验证，必要时在 macOS 从源码构建。
- 生产依赖 npm audit：检查时 0 个已知漏洞；这不是供应链或代码安全的全面保证。
- 构建产物的 Info.plist 实际声明 macOS 最低 13.0；macOS 12 或更旧不在本包支持范围。Windows 包为 x64，不提供 Windows ARM 原生版。

## 0.2 GUI 复核进展
通过 CUA 原生 Terminal 启动真实 Linux Electron。发现并修复 Linux 不支持预期 forward mousemove 导致全窗穿透的问题；Linux fallback 不启用窗口鼠标穿透，Mac/Windows 实现保留。录屏仅验证 Linux，不代替两平台输入法验收。

0.2 最终自动测试：50/50 通过（含 12 项提醒假时钟、13 项主进程集成、4 项 renderer 操作契约）。真实 Linux GUI 已观察到窗口拖动、摸头和饼干点击反馈；完整录屏与自然到期提醒证据由单独操作验收记录提供。假时钟测试不是实际等待 25 分钟的证据。

## 0.3 更新
无常驻工具条，单击/双击与右键菜单代替下方图标。工作态低频漫步采用 100ms 定时器，移动开关持久化，最近输入仅取数字增量，不读取内容。模拟测试可验证坐标与焦点调用，但不能代替 macOS/Windows 实机行为。旧版测试数量仅代表对应历史版本，最终 0.3 结果见 PACKAGE-QA 与 INTERACTION-QA。

## 0.4 依赖与回归
从 0.3 源码进行全新依赖恢复时发现历史锁文件中的 tmp-promise 依赖范围被版本字符串替换污染。0.4 已从固定顶层依赖重新生成 package-lock.json，干净 npm ci 成功；今后版本更新仅修改 package.json.version 与锁文件根版本字段，不全局替换依赖版本。Node 66/66 与真实 Lua 解释器桥接测试通过。最终原生包验收仍按静态构建与实际运行分层。

## 0.5 合并验证
根版本字段通过 JSON 结构更新，未替换任何依赖版本。Node 67/67 与真实 Lua 解释器桥接测试通过。环形按钮固定命中区域，首次触发限定 SVG corgi-body，菜单打开后共享范围保持。视觉与实际操作证据见本版 VIDEO-VERIFICATION 及独立 QA 记录。
