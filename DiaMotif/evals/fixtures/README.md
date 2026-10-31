# 真模型验收图像样本

| fixtureId | 文件 | 来源及可见内容 |
| --- | --- | --- |
| `synthetic-table-chairs` | [PNG](synthetic-table-chairs.png)／[SVG 源码](synthetic-table-chairs.svg) | 复用 2026-10-27 本项目 AI 连通试验的程序绘图；中心一张圆桌、左右各一把椅子，家具落地。是合成示意图，不是实拍舞台。 |
| `reference-stage` | [仓库现有照片](../../../apps/editor/public/photo-stage/reference-stage.jpg) | 原仓库参考图，上下拼接同一布景的两个画面；可见左侧门、后区右侧沙发、高台和左侧台阶。验收题须明确采用上图或下图，不能把两个画面叠成一个场景。 |

2026-10-29 已目视核对上述内容。合成图直接复制既有 PNG 与 SVG，未重新生成或修改像素。参考照片复用原路径，不新增分发许可声明。

六道照片题来自两个图源，含同源条件变化；不能报告为六个独立场景，也不能据此宣称照片泛化能力达标。图片没有实测舞台尺寸；只能检验标准道具替代、相对位置、支撑与几何约束。视觉接近程度仍待用户验收。

| 文件 | SHA-256 |
| --- | --- |
| `synthetic-table-chairs.png` | `987a3102ed41883e3bf9d50fa0e6c622a8d6c853f94cefc9958ab0e2fc0ce91c` |
| `synthetic-table-chairs.svg` | `5c571e79938669311b5bf33509417bc2300a78c1e585f54af7e2ec30a7e4cc2a` |
| `reference-stage.jpg` | `335921739e6720156e264ce36c91573d84461cf1c8423ebc5bc4eb369f770ac9` |

此前用户微信临时照片的原路径已失效，本轮不使用或上传该私有照片。历史模型输出与人工修正版不作为新的图像识别答案。
