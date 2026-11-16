# 独立包验收记录 · 0.5.0

2026-11-15，QA独立运行测试、实际观察Linux GUI及核对最终三平台包。静态验包不能代替Mac/Windows真机运行。

## 回归及视觉

最终源码独立npm test：67/67通过，0失败/跳过。新增关闭时透明外环不展开/不扩大命中、真实身体触发、展开后跨环保留及离开延迟收起。六图标、提醒、拖动、输入计数、隐私、安装保护和漫步旧项保留通过。

QA本人实际操作Linux：透明外围点不展开，身体展开六方向椭圆；跨间隙右上饼干和上方爱心可点，显示反馈；离开收起。视觉相比0.4更柔软，亮眼/粉耳/歪头、闭眼亲昵有清楚变化，固定按钮不跟随身体动画移动且不盖脸。

QA发现旧运行版饼干偏项圈，视觉作者上移12px并重启最终版实测嘴边通过；六图标、自然漫步x984→856及右边界x1004完整环由GUI验收者复核。QA独立完整解码最终85秒、1224239字节视频无错，8秒抽帧确认环布局、间距和平台限制标签。饼干补丁完整操作复测由GUI验收者完成，不冒称QA重新操作。

## 最终ZIP

|包|字节数|条目数|CRC/源码一致性|
|---|---:|---:|---|
|Corgi-IME-0.5.0-win-x64.zip|153424997|79|通过|
|Corgi-IME-0.5.0-mac-x64.zip|121464872|588|通过|
|Corgi-IME-0.5.0-mac-arm64.zip|117350419|588|通过|

独立检查CRC完整，无绝对路径及`..`条目。ZIP内13个src/renderer/rime文件逐字节匹配最终冻结源码，package版本0.5.0。五外置文档README、LICENSE-Corgi.txt、THIRD_PARTY.md、ACCEPTANCE.md、INTERACTIONS.md全部逐字节匹配。

三ZIP与三unpacked ASAR一致：`9141c158aca8d228503063d206b0230dec0c4e04d05ec0cf6c264dce582e6615`。

独立解析程序头：Windows PE x86-64，macOS Mach-O x86_64/arm64，匹配包名。

```
5bcce6d8ff42c08d78d130d929fe8ab82e63c29c9bbd5161fcce873d44aa1f68  Corgi-IME-0.5.0-win-x64.zip
1f2f6f5141a7fd3fbd4c2aac9362bc31ee6326cfeb17861e4057d94f37d139bb  Corgi-IME-0.5.0-mac-x64.zip
b2717b593f7f904de0db96a2723ebf47d775f6b163f9bc9821beb4e73b3bd1d6  Corgi-IME-0.5.0-mac-arm64.zip
```

## 限制

无已确认未解决P0/P1。Mac/Windows真机、原生Rime输入链路及原生安装/卸载、签名/公证/SmartScreen、跨屏/DPI、睡眠及长期稳定性未实机验收。保留非聚焦桌宠完整键盘导航限制；鼠标与mock通过不表示键盘/读屏通过。预览包未签名。
