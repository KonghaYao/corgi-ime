# 来源与许可

本仓库新增 JavaScript/Lua/配置/柯基 SVG 与 CSS：MIT（见 LICENSE）。

依赖 Electron：MIT；Electron 附带 Chromium/Node 等许可包含于分发包。yaml：ISC；electron-builder：MIT（构建工具）。完整依赖以 package-lock.json 为准。

外部必须单独安装：
- Rime Squirrel / Weasel：GPL-3.0，https://github.com/rime/squirrel / https://github.com/rime/weasel
- librime：BSD-3-Clause，https://github.com/rime/librime
- librime-lua：BSD-3-Clause，https://github.com/hchunhui/librime-lua
- rime-luna-pinyin：LGPL-3.0，https://github.com/rime/rime-luna-pinyin

本包没有复制或重分发上述原生输入法二进制与词典。schema 是独立编写的组件配置，通过 dictionary: luna_pinyin 引用用户已安装的词典。若未来把这些依赖随安装器分发，必须同时满足对应许可和源代码义务，不能沿用本包 MIT 声明覆盖它们。
