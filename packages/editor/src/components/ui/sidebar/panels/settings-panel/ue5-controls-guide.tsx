type ControlRow = { action: string; keys: string; note: string }

const CONTROL_GROUPS: { title: string; source: number; rows: ControlRow[] }[] = [
  {
    title: '工具与物体变换',
    source: 1,
    rows: [
      {
        action: '选择',
        keys: 'Q；左键单击物体',
        note: '选择场景中的道具实例。',
      },
      {
        action: '移动',
        keys: 'W，再用左键拖动移动轴',
        note: '拖箭头约束单轴；拖平面控制柄约束双轴。',
      },
      {
        action: '旋转',
        keys: 'E，再用左键拖动旋转圆弧',
        note: '绕选定轴和支点旋转；单按 E 只切换工具。',
      },
      {
        action: '缩放',
        keys: 'R，再用左键拖动缩放柄',
        note: '单轴拉伸；中心控制柄等比缩放。',
      },
      {
        action: '切换变换工具',
        keys: '空格',
        note: '循环移动、旋转、缩放。',
      },
      {
        action: '精确变换',
        keys: 'Details → Transform 数值输入',
        note: 'Location 是位置；Rotation 是角度；Scale 是倍率。',
      },
      {
        action: '世界 / 局部坐标',
        keys: 'Ctrl + 反引号（`），或工具栏坐标图标',
        note: '世界轴固定，局部轴随物体朝向变化。',
      },
      {
        action: '临时移动支点',
        keys: '中键拖动变换器的支点',
        note: '改变旋转中心；临时偏移不等于修改网格原点。',
      },
      {
        action: '保存 / 恢复支点偏移',
        keys: '右键菜单 → Pivot',
        note: '使用 Set as Pivot Offset / Reset Pivot Offset。',
      },
    ],
  },
  {
    title: '透视视口：观察与飞行',
    source: 0,
    rows: [
      {
        action: '原地环视',
        keys: '按住右键，移动鼠标',
        note: '改变视线方向；道具不动。',
      },
      {
        action: '前后 / 左右飞行',
        keys: '按住右键 + W / S；A / D',
        note: 'W 前进，S 后退，A 左移，D 右移。',
      },
      {
        action: '沿世界竖直轴升降',
        keys: '按住右键 + Q / E',
        note: 'Q 下降，E 上升。',
      },
      {
        action: '沿相机局部上下轴移动',
        keys: '按住右键 + R / F',
        note: 'R 局部向上，F 局部向下；视角倾斜时与世界升降不同。',
      },
      {
        action: '飞行速度',
        keys: '按住右键 + 滚轮',
        note: '调整移动速度。',
      },
      {
        action: '视野范围',
        keys: '按住右键 + Z / C',
        note: 'Z 增大视野角度，C 减小；不是缩放道具。',
      },
      {
        action: '鼠标前后移动 / 转向',
        keys: '左键拖动空白视口',
        note: '前后移动并左右转向；命中控制柄时优先操作控制柄。',
      },
      {
        action: '平移画面',
        keys: '中键拖动，或同时按左右键拖动',
        note: '观察位置上下左右移动，视线方向保持。',
      },
      {
        action: '推近 / 拉远',
        keys: '滚轮',
        note: '逐步前后移动观察位置。',
      },
      {
        action: '聚焦选择',
        keys: 'F',
        note: '将选中物体纳入观察范围。',
      },
      {
        action: '围绕焦点观察',
        keys: 'Alt + 左键拖动',
        note: '可先按 F 聚焦，再绕焦点观察。',
      },
      {
        action: '围绕焦点推拉 / 平移',
        keys: 'Alt + 右键 / Alt + 中键拖动',
        note: '分别推拉、平移观察视角。',
      },
    ],
  },
  {
    title: '选择、正交视图与显示',
    source: 0,
    rows: [
      {
        action: '追加选择',
        keys: 'Ctrl 或 Shift + 左键单击',
        note: '加入当前选择；与拖动物体的变换操作区分。',
      },
      {
        action: '正交框选',
        keys: '左键拖出选框',
        note: '替换当前选择；Shift + 左键框选追加。',
      },
      {
        action: '正交框选移除',
        keys: 'Ctrl + 右键拖出选框',
        note: '从当前选择中移除框内物体。',
      },
      {
        action: '正交观察',
        keys: '右键拖动；滚轮',
        note: '分别平移、缩放平面视图。',
      },
      {
        action: '切换透视 / 正交',
        keys: '视口 Camera 菜单',
        note: '选顶、底、左、右、前、后等观察方向。',
      },
      {
        action: '游戏视图',
        keys: 'G',
        note: '隐藏编辑辅助显示；不等于开始排演或录制。',
      },
      {
        action: '沉浸视口',
        keys: 'F11',
        note: '扩大视口显示。',
      },
      {
        action: '实时视口',
        keys: 'Ctrl + R',
        note: '切换视口实时更新；不等于保存或重做。',
      },
    ],
  },
  {
    title: '放置、对齐与吸附',
    source: 2,
    rows: [
      {
        action: '添加道具',
        keys: '从内容浏览器拖入视口',
        note: '创建独立实例，再调整位置与姿态。',
      },
      {
        action: '位置 / 旋转 / 缩放吸附',
        keys: '工具栏分别开启并设置增量',
        note: '三种吸附独立；连续旋转需关闭旋转吸附。',
      },
      {
        action: '贴到表面',
        keys: 'End',
        note: '将选中道具贴到最近的可吸附表面；检查目标是否为预期地面。',
      },
      {
        action: '拖动贴面',
        keys: '开启 Surface Snapping',
        note: 'Surface Offset 设置与表面的偏移距离。',
      },
      {
        action: '随表面倾斜',
        keys: '开启 Rotate to Surface Normal',
        note: '贴面时按法线调整朝向；关闭时保持原朝向。',
      },
      {
        action: '顶点吸附',
        keys: '使用 W 移动工具时按住 V',
        note: '以几何顶点进行对齐。',
      },
      {
        action: '复制并移动',
        keys: 'Alt + 拖动移动轴',
        note: '生成新实例，并摆到新位置。',
      },
    ],
  },
  {
    title: '编组与批量变换',
    source: 5,
    rows: [
      {
        action: '编组 / 重新编组',
        keys: 'Ctrl + G',
        note: '所选道具按组共同变换。',
      },
      {
        action: '取消编组',
        keys: 'Shift + G',
        note: '解除组关系，保留道具。',
      },
      {
        action: '切换组选择',
        keys: 'Ctrl + Shift + G',
        note: '切换 Allow Group Selection。',
      },
      {
        action: '锁定 / 解锁组',
        keys: '右键菜单 → Group → Lock / Unlock',
        note: '解锁后可调整成员；锁定时整体变换。',
      },
    ],
  },
]

const SOURCES = [
  [
    '视口键鼠操作',
    'https://dev.epicgames.com/documentation/en-us/unreal-engine/viewport-controls-in-unreal-engine?application_version=5.6',
  ],
  [
    '物体变换',
    'https://dev.epicgames.com/documentation/en-us/unreal-engine/transforming-actors-in-unreal-engine?application_version=5.6',
  ],
  [
    '吸附与贴面',
    'https://dev.epicgames.com/documentation/en-us/unreal-engine/actor-snapping-in-unreal-engine?application_version=5.6',
  ],
  [
    '工具栏与坐标空间',
    'https://dev.epicgames.com/documentation/en-us/unreal-engine/viewport-toolbar?application_version=5.6',
  ],
  [
    '坐标系统与支点',
    'https://dev.epicgames.com/documentation/en-us/unreal-engine/coordinate-system-and-spaces-in-unreal-engine?application_version=5.6',
  ],
  [
    '编组',
    'https://dev.epicgames.com/documentation/en-us/unreal-engine/grouping-actors-in-unreal-engine?application_version=5.6',
  ],
] as const

export function Ue5ControlsGuide() {
  return (
    <details className="space-y-4 rounded-md border border-border/80 p-3" open>
      <summary className="cursor-pointer font-medium text-sm">UE5 标准操作与方块练习</summary>
      <p className="text-sm">
        统一按 UE5.6 Windows 默认关卡编辑器规格适配。本文是标准指南，运行时键位尚未同步。
        现有操作请查下方“当前版本快捷键”。
      </p>
      <p className="text-muted-foreground text-xs">
        松开右键时 Q 选择、W 移动、E 旋转、R 缩放；按住右键时切换为相机导航，Q 下降、E 上升。
        输入框或其他编辑工具获得焦点时，不套用关卡视口命令。网页中的 F11、Ctrl+R
        需另行适配浏览器行为。
      </p>
      {CONTROL_GROUPS.map((group) => (
        <section className="space-y-2" key={group.title}>
          <h3 className="font-medium text-sm">{group.title}</h3>
          <div className="space-y-2">
            {group.rows.map((row) => (
              <div className="space-y-1 border-border/60 border-b py-2 text-sm" key={row.action}>
                <p className="font-medium">{row.action}</p>
                <p>{row.keys}</p>
                <p className="text-muted-foreground text-xs">{row.note}</p>
              </div>
            ))}
          </div>
          <a
            className="text-xs underline underline-offset-2"
            href={SOURCES[group.source]?.[1]}
            rel="noreferrer"
            target="_blank"
          >
            Epic：{SOURCES[group.source]?.[0]}
          </a>
        </section>
      ))}
      <section className="space-y-2 text-sm">
        <h3 className="font-medium">一个方块：移动、旋转和摆放</h3>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            在 UE5 中放入边长 100 cm、支点居中的方块。地面 Z=0 时，未旋转方块的中心高度为 50 cm。
          </li>
          <li>按 W 拖轴移动；按 E 拖蓝色 Z 圆弧水平转向 45°。先复原，再绕 Y 轴倾斜 30°。</li>
          <li>绕中心倾斜可能穿地；把支点移到底边可模拟翻倒，或重新调整高度。End 用于贴面。</li>
          <li>按 R 拖中心等比缩放，拖单轴拉成长方体；使用 Details → Transform 精确输入。</li>
          <li>W 工具下 Alt+拖动移动轴复制；多选后 Ctrl+G 编组，Shift+G 取消编组。</li>
          <li>按 F 聚焦，Alt+左键环绕检查。观察操作改变相机，道具姿态保持。</li>
        </ol>
        <p>
          UE5 的 X 向前、Y 向右、Z 向上。当前 DiaStage 底层用 Y
          表示高度、以米计量，适配前不能直接照抄轴名与数值。
        </p>
        <p>静态倾斜保存一个姿态；持续摆动需要时间线。E 不会自动生成动画，也不作为门窗开合键。</p>
      </section>
      <section className="space-y-2 text-sm">
        <h3 className="font-medium">适配前的关键差异</h3>
        <p>
          当前 V 选择、E 交互、R/T 转向、Ctrl+右键旋转、F 切换图层和空格平移，都需要迁移到上面的 UE5
          规格。
        </p>
        <p>
          End 贴面、V 顶点吸附、三轴操纵器、支点编辑与组保存仍须逐项接入和验证。编组取消键也需从
          Ctrl+Shift+G 改为 Shift+G。
        </p>
        <p>
          复制、粘贴、删除、撤销、重做和保存使用对应编辑命令；键位以目标版本的关卡编辑器设置核对。网格建模和时间线采用各自工具上下文。
        </p>
      </section>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {SOURCES.map(([label, href]) => (
          <a
            className="underline underline-offset-2"
            href={href}
            key={href}
            rel="noreferrer"
            target="_blank"
          >
            Epic：{label}
          </a>
        ))}
      </div>
    </details>
  )
}
