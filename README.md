# Memory Record — Sound Map / Childhood Photo Atlas

**在线体验 Live site:** https://huanggedv.github.io/memory-record/
**项目文章 Article:** [Memory Record: Putting Childhood Memories Back into the Playlist](https://medium.com/@chloe_huang_19782/memory-record-putting-childhood-memories-back-into-the-playlist-82f67aacb88e)

童年照片不是静态相框，而是一张可以探索的声音地图。158 张童年照片被做成黑白颗粒感的圆形唱片，中心是克莱因蓝（`#002FA7`）。点击照片里的彩色标记或按空格，会出现手绘声音贴纸和一段合成环境声，并在右下角 SOUND ORBIT 留下记录。

Childhood photographs become playable records. Each photo is a black-and-white vinyl; clicking the coloured markers (or pressing SPACE) plays a synthesized ambient sound and leaves a trace in the SOUND ORBIT.

## 操作 Controls

| 操作 | 效果 |
| --- | --- |
| 点击页面一次 | 解锁浏览器声音 |
| 点击照片上的彩色点 / 空格 | 触发声音贴纸 |
| ← → | 切换照片 |
| `CONNECT`（Chrome / Edge） | 用 Web Serial 连接 Arduino（115200） |

## Arduino（可选）

不接硬件也能在网页上体验。接上 Arduino Uno 后：FSR 接 A0（按压切换下一张照片并发声），旋钮电位器接 A1（把照片从黑白调到原色），piezo 接 D8，LED 经 220Ω 接 D5。约 0.9 秒内快速按 FSR 三次，会随机弹出一张专辑封面，并可点 `DOWNLOAD` 保存。代码见 `arduino/sound_map/sound_map.ino`。

## 文件

```
index.html / sketch.js / styles.css   p5.js 网站
assets/photos/      158 张照片（为网页压缩到最长边 2000px）
assets/photos.json  照片清单
assets/covers/      17 张专辑封面
arduino/            Arduino 程序
```

Built with [p5.js](https://p5js.org/) for UC Berkeley Tangible UI.
