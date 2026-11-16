# 0.5 柯基视觉实装

仅修改 renderer/pet-markup.js 和 renderer/corgi.css，未修改环形菜单与交互。保留240×240 SVG viewBox、既有class/state接口。

- 双高光大眼、暖奶油脸、较柔和的棕色描边，粉色耳内与大腮红。
- 两只耳朵拆独立组，闲置轻抖；歪头和眼神同步；间歇尾摇、双眨眼，避免持续剧烈弹跳。
- 摸摸闭眼贴近，腮红加深；饼干真实小图形、咀嚼与掉屑；拖动小爪摆动；行走点头。
- 睡觉耳朵下垂，保留prefers-reduced-motion和data-motion停用动画。

真实Linux Electron已重启查看：高光眼/配色、双击饼干图形与咀嚼、单击摸摸闭眼歪头均可见，未看到裁切。随后将饼干由项圈位置向上微调12px到嘴边，交QA重启独立复核。SVG XML解析和JS语法通过。macOS/Windows未实测，未将Linux结果当双平台验收。
