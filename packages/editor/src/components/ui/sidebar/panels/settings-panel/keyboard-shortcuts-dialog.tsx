import { Keyboard } from 'lucide-react'
import { Button } from './../../../../../components/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './../../../../../components/ui/primitives/dialog'
import {
  ShortcutToken,
  shortcutDisplayValue,
} from './../../../../../components/ui/primitives/shortcut-token'

type Shortcut = {
  keys: string[]
  action: string
  note?: string
}

type ShortcutCategory = {
  title: string
  shortcuts: Shortcut[]
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: '编辑器导航',
    shortcuts: [
      { keys: ['1'], action: '切换到场地阶段' },
      { keys: ['2'], action: '切换到结构阶段' },
      { keys: ['3'], action: '切换到布置阶段' },
      { keys: ['F'], action: '切换到布置图层' },
      { keys: ['Z'], action: '切换到区域图层' },
      {
        keys: ['Cmd/Ctrl', 'Arrow Up'],
        action: '选择当前建筑的上一层',
      },
      {
        keys: ['Cmd/Ctrl', 'Arrow Down'],
        action: '选择当前建筑的下一层',
      },
      { keys: ['Cmd/Ctrl', 'B'], action: '切换侧栏' },
    ],
  },
  {
    title: '模式与历史',
    shortcuts: [
      { keys: ['V'], action: '切换到选择模式' },
      { keys: ['B'], action: '切换到建模模式' },
      { keys: ['M'], action: '激活上次使用的测量工具' },
      { keys: ['X'], action: '切换到删除模式' },
      {
        keys: ['Esc'],
        action: '取消当前工具并返回选择模式',
        note: '绘制过程中只取消当前连续线段；再次按键可退出工具。',
      },
      { keys: ['Delete / Backspace'], action: '删除选中物体' },
      { keys: ['Cmd/Ctrl', 'Z'], action: '撤销' },
      { keys: ['Cmd/Ctrl', 'Shift', 'Z'], action: '重做' },
    ],
  },
  {
    title: '选中物体',
    shortcuts: [
      {
        keys: ['Cmd/Ctrl', 'C'],
        action: '复制选中物体',
        note: '已复制的物体可以粘贴到其他楼层、项目或浏览器标签页。',
      },
      {
        keys: ['Cmd/Ctrl', 'X'],
        action: '剪切选中物体',
        note: '将选中物体复制到剪贴板，再从当前场景移除。',
      },
      {
        keys: ['Cmd/Ctrl', 'V'],
        action: '粘贴并放置已复制的物体',
        note: '预览随光标移动。点击放置，按 Esc 取消。',
      },
      {
        keys: ['Cmd/Ctrl', 'Left click'],
        action: '向多选中添加或移除物体',
        note: '适用于选择模式下的三维画布、二维平面图和场景图。',
      },
      {
        keys: ['Shift', 'Left click'],
        action: '向画布多选中添加或移除物体',
        note: '在场景图中按住 Shift 点击，可像文件浏览器一样选择可见范围。',
      },
      {
        keys: ['Left click'],
        action: '整体移动多个选中物体',
        note: '选中至少两个物体后，在二维或三维视图中拖动物体或虚线框即可整体移动；也可点击拾取，再次点击放置。',
      },
      {
        keys: ['R', 'T'],
        action: '围绕中心旋转多个选中物体 ±45°',
        note: '移动选中物体时也可使用。',
      },
      {
        keys: ['Cmd/Ctrl', 'G'],
        action: '编组多个选中物体（仅当前会话）',
        note: '仅在编辑器中生效。点击任意成员可选中整组，不随项目保存。',
      },
      {
        keys: ['Cmd/Ctrl', 'Shift', 'G'],
        action: '取消当前会话编组',
        note: '保留当前选择，只取消会话编组。',
      },
      {
        keys: ['Esc'],
        action: '取消选择',
        note: '点击空白处也可取消选择。',
      },
    ],
  },
  {
    title: '直接操作',
    shortcuts: [
      {
        keys: ['Cmd/Ctrl', 'Left click'],
        action: '移动光标下选中的可移动物体',
        note: '在选择模式下选中单个物体并拖动，默认启用引导吸附和辅助线。',
      },
      {
        keys: ['Cmd/Ctrl', 'Right click'],
        action: '旋转光标下选中的物体',
        note: '在选择模式下选中单个物体并左右拖动，默认按 15° 增量吸附旋转。',
      },
      {
        keys: ['Cmd/Ctrl', 'Shift', 'Right click'],
        action: '自由旋转',
        note: '拖动时按住 Shift 可跳过 15° 旋转增量。',
      },
    ],
  },
  {
    title: '绘制工具',
    shortcuts: [
      // Shift and Ctrl each mean one thing held and another tapped, and only
      // the hold was documented — which read as the taps not existing. Both
      // taps are listed first because they are the ones nobody discovers.
      {
        keys: ['Shift'],
        action: '切换吸附模式',
        note: '绘制或移动时，单独按下并松开此键。',
      },
      {
        keys: ['Cmd/Ctrl'],
        action: '切换网格步长：0.5 m → 0.25 m → 0.1 m → 0.05 m',
        note: '单独按下并松开此键。默认半米网格过粗时可使用，例如放置窗户。',
      },
      {
        keys: ['Shift'],
        action: '跳过引导吸附与角度约束',
        note: '操作时按住此键，辅助线或测量反馈仍可能显示。',
      },
      {
        keys: ['Shift'],
        action: '自由旋转，跳过默认的 15° 旋转吸附',
        note: '拖动旋转控制柄或直接旋转时按住。',
      },
    ],
  },
  {
    title: '物体放置',
    shortcuts: [
      {
        keys: ['R', 'T'],
        action: '旋转物体；选中门时，R 切换开关，T 关门',
      },
      {
        keys: ['E'],
        action: '操作选中节点：门、窗、柜门和抽屉以动画方式开关',
      },
      {
        keys: ['Shift'],
        action: '临时跳过放置校验约束',
        note: '放置时按住。',
      },
    ],
  },
  {
    title: '摄像机',
    shortcuts: [
      {
        keys: ['W', 'A', 'S', 'D'],
        action: '平移摄像机',
        note: '在屏幕空间移动，类似拖动摄像机视图。',
      },
      {
        keys: ['Middle click'],
        action: '平移摄像机',
        note: '按住鼠标中键拖动，或按住空格键并用鼠标左键拖动。',
      },
      {
        keys: ['Right click'],
        action: '环绕摄像机',
        note: '按住鼠标右键拖动。',
      },
    ],
  },
]

function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {keys.map((key, index) => (
        <div className="flex items-center gap-1" key={`${key}-${index}`}>
          {index > 0 ? <span className="text-[10px] text-muted-foreground">+</span> : null}
          <ShortcutToken displayValue={shortcutDisplayValue(key)} value={key} />
        </div>
      ))}
    </div>
  )
}

export function KeyboardShortcutsDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-full justify-start gap-2" variant="outline">
          <Keyboard className="size-4" />
          键盘快捷键
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>键盘快捷键</DialogTitle>
          <DialogDescription>
            快捷键随操作场景变化。默认启用引导约束，操作时按住 Shift 可自由建模。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {SHORTCUT_CATEGORIES.map((category) => (
            <section className="space-y-2" key={category.title}>
              <h3 className="font-medium text-sm">{category.title}</h3>
              <div className="overflow-hidden rounded-md border border-border/80">
                {category.shortcuts.map((shortcut, index) => (
                  <div
                    className="grid grid-cols-[minmax(130px,220px)_1fr] gap-3 px-3 py-2"
                    key={`${category.title}-${shortcut.action}`}
                  >
                    <ShortcutKeys keys={shortcut.keys} />
                    <div>
                      <p className="text-sm">{shortcut.action}</p>
                      {shortcut.note ? (
                        <p className="text-muted-foreground text-xs">{shortcut.note}</p>
                      ) : null}
                    </div>
                    {index < category.shortcuts.length - 1 ? (
                      <div className="col-span-2 border-border/60 border-b" />
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
