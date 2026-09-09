'use client'

import type { AnyNodeId } from '@pascal-app/core'
import { DEFAULT_LEVEL_HEIGHT, LevelNode, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import {
  AppWindow,
  ArrowRight,
  Box,
  Building2,
  Camera,
  Copy,
  DoorOpen,
  Eye,
  EyeOff,
  FileJson,
  Grid3X3,
  Hexagon,
  Layers,
  Map,
  Maximize2,
  Minimize2,
  Moon,
  MousePointer2,
  Mountain,
  Package,
  PaintBucket,
  PencilLine,
  Plus,
  Redo2,
  Sparkles,
  Square,
  SquareStack,
  Sun,
  Trash2,
  Undo2,
  Video,
} from 'lucide-react'
import { useEffect } from 'react'
import { getHistoryCommandState, runRedo, runUndo } from '../../../lib/history'
import { deleteLevelWithFallbackSelection } from '../../../lib/level-selection'
import { useCommandRegistry } from '../../../store/use-command-registry'
import type { StructureTool } from '../../../store/use-editor'
import useEditor from '../../../store/use-editor'
import { useCommandPalette } from './index'

export function EditorCommands() {
  const register = useCommandRegistry((s) => s.register)
  const { navigateTo, setInputValue, setOpen } = useCommandPalette()

  const setPhase = useEditor((s) => s.setPhase)
  const armToolMode = useEditor((s) => s.armToolMode)
  const armMaterialPaint = useEditor((s) => s.armMaterialPaint)
  const setStructureLayer = useEditor((s) => s.setStructureLayer)
  const isPreviewMode = useEditor((s) => s.isPreviewMode)
  const setPreviewMode = useEditor((s) => s.setPreviewMode)

  const exportScene = useViewer((s) => s.exportScene)

  // Re-register when exportScene availability changes (it's a conditional action)
  useEffect(() => {
    const run = (fn: () => void) => {
      fn()
      setOpen(false)
    }

    const activateTool = (tool: StructureTool) => {
      run(() => {
        setPhase('structure')
        if (tool === 'zone') setStructureLayer('zones')
        else setStructureLayer('elements')
        armToolMode({ mode: 'build', tool })
      })
    }

    return register([
      // ── Scene ────────────────────────────────────────────────────────────
      {
        id: 'editor.tool.wall',
        label: '墙体工具',
        group: '场景',
        icon: <Square className="h-4 w-4" />,
        keywords: ['draw', 'build', 'structure'],
        execute: () => activateTool('wall'),
      },
      {
        id: 'editor.tool.slab',
        label: '楼板工具',
        group: '场景',
        icon: <Layers className="h-4 w-4" />,
        keywords: ['floor', 'build'],
        execute: () => activateTool('slab'),
      },
      {
        id: 'editor.tool.ceiling',
        label: '天花板工具',
        group: '场景',
        icon: <Grid3X3 className="h-4 w-4" />,
        keywords: ['top', 'build'],
        execute: () => activateTool('ceiling'),
      },
      {
        id: 'editor.tool.door',
        label: '门工具',
        group: '场景',
        icon: <DoorOpen className="h-4 w-4" />,
        keywords: ['opening', 'entrance'],
        execute: () => activateTool('door'),
      },
      {
        id: 'editor.tool.window',
        label: '窗工具',
        group: '场景',
        icon: <AppWindow className="h-4 w-4" />,
        keywords: ['opening', 'glass'],
        execute: () => activateTool('window'),
      },
      {
        id: 'editor.tool.item',
        label: '物体工具',
        group: '场景',
        icon: <Package className="h-4 w-4" />,
        keywords: ['furniture', 'object', 'asset', 'furnish'],
        execute: () => activateTool('item'),
      },
      {
        id: 'editor.tool.stair',
        label: '楼梯工具',
        group: '场景',
        icon: <ArrowRight className="h-4 w-4" />,
        keywords: ['stairs', 'staircase', 'flight', 'landing', 'steps'],
        execute: () => activateTool('stair'),
      },
      {
        id: 'editor.tool.zone',
        label: '区域工具',
        group: '场景',
        icon: <Hexagon className="h-4 w-4" />,
        keywords: ['area', 'room', 'space'],
        execute: () => activateTool('zone'),
      },
      {
        id: 'editor.delete-selection',
        label: '删除选中物体',
        group: '场景',
        icon: <Trash2 className="h-4 w-4" />,
        keywords: ['remove', 'erase'],
        shortcut: ['⌫'],
        when: () => useViewer.getState().selection.selectedIds.length > 0,
        execute: () =>
          run(() => {
            const { selectedIds } = useViewer.getState().selection
            useScene.getState().deleteNodes(selectedIds as any[])
          }),
      },
      {
        id: 'editor.mode.material-paint',
        label: '材质绘制',
        group: '场景',
        icon: <PaintBucket className="h-4 w-4" />,
        keywords: ['paint', 'material', 'texture', 'bucket', 'surface'],
        shortcut: ['P'],
        execute: () =>
          run(() => {
            setPhase('structure')
            setStructureLayer('elements')
            armMaterialPaint()
          }),
      },
      {
        id: 'editor.mode.terrain-sculpt',
        label: '地形雕刻',
        group: '场景',
        icon: <Mountain className="h-4 w-4" />,
        keywords: ['terrain', 'ground', 'elevation', 'sculpt', 'hill', 'slope', 'grade', 'dig'],
        shortcut: ['G'],
        // The ToolMode transition moves to the site phase itself.
        execute: () => run(() => armToolMode({ mode: 'terrain-sculpt' })),
      },

      // ── Levels ───────────────────────────────────────────────────────────
      {
        id: 'editor.level.goto',
        label: '转到楼层',
        group: '楼层',
        icon: <ArrowRight className="h-4 w-4" />,
        keywords: ['level', 'floor', 'go', 'navigate', 'switch', 'select'],
        navigate: true,
        when: () => Object.values(useScene.getState().nodes).some((n) => n.type === 'level'),
        execute: () => navigateTo('goto-level'),
      },
      {
        id: 'editor.level.add',
        label: '添加楼层',
        group: '楼层',
        icon: <Plus className="h-4 w-4" />,
        keywords: ['level', 'floor', 'add', 'create', 'new'],
        execute: () =>
          run(() => {
            const { nodes } = useScene.getState()
            const building = Object.values(nodes).find((n) => n.type === 'building')
            if (!building) return
            const levelCount = building.children.filter(
              (childId) => nodes[childId as keyof typeof nodes]?.type === 'level',
            ).length
            const newLevel = LevelNode.parse({
              level: levelCount,
              height: DEFAULT_LEVEL_HEIGHT,
              children: [],
              parentId: building.id,
            })
            useScene.getState().createNode(newLevel, building.id)
            useViewer.getState().setSelection({ levelId: newLevel.id })
          }),
      },
      {
        id: 'editor.level.rename',
        label: '重命名楼层',
        group: '楼层',
        icon: <PencilLine className="h-4 w-4" />,
        keywords: ['level', 'floor', 'rename', 'name'],
        navigate: true,
        when: () => !!useViewer.getState().selection.levelId,
        execute: () => {
          const activeLevelId = useViewer.getState().selection.levelId
          if (!activeLevelId) return
          const level = useScene.getState().nodes[activeLevelId as AnyNodeId] as LevelNode
          setInputValue(level?.name ?? '')
          navigateTo('rename-level')
        },
      },
      {
        id: 'editor.level.delete',
        label: '删除楼层',
        group: '楼层',
        icon: <Trash2 className="h-4 w-4" />,
        keywords: ['level', 'floor', 'delete', 'remove'],
        when: () => {
          const levelId = useViewer.getState().selection.levelId
          if (!levelId) return false
          const node = useScene.getState().nodes[levelId as AnyNodeId] as LevelNode
          return node?.type === 'level' && node.level !== 0
        },
        execute: () =>
          run(() => {
            const activeLevelId = useViewer.getState().selection.levelId
            if (!activeLevelId) return
            deleteLevelWithFallbackSelection(activeLevelId as AnyNodeId)
          }),
      },

      // ── Viewer Controls ──────────────────────────────────────────────────
      {
        id: 'editor.viewer.wall-mode',
        label: '墙体显示模式',
        group: '视口控制',
        icon: <Layers className="h-4 w-4" />,
        keywords: ['wall', 'cutaway', 'up', 'down', 'translucent', 'view'],
        badge: () => {
          const mode = useViewer.getState().wallMode
          return { cutaway: '剖切', up: '完整高度', down: '低墙', translucent: '半透明' }[mode]
        },
        navigate: true,
        execute: () => navigateTo('wall-mode'),
      },
      {
        id: 'editor.viewer.level-mode',
        label: '楼层显示模式',
        group: '视口控制',
        icon: <SquareStack className="h-4 w-4" />,
        keywords: ['level', 'floor', 'exploded', 'stacked', 'solo'],
        badge: () => {
          const mode = useViewer.getState().levelMode
          return { manual: '手动', stacked: '堆叠', exploded: '分解', solo: '独显' }[mode]
        },
        navigate: true,
        execute: () => navigateTo('level-mode'),
      },
      {
        id: 'editor.viewer.camera-mode',
        label: () => {
          const mode = useViewer.getState().cameraMode
          return `摄像机：切换到${mode === 'perspective' ? '正交' : '透视'}`
        },
        group: '视口控制',
        icon: <Video className="h-4 w-4" />,
        keywords: ['camera', 'ortho', 'perspective', '2d', '3d', 'view'],
        execute: () =>
          run(() => {
            const { cameraMode, setCameraMode } = useViewer.getState()
            setCameraMode(cameraMode === 'perspective' ? 'orthographic' : 'perspective')
          }),
      },
      {
        id: 'editor.viewer.shading-solid',
        label: '切换到实体显示',
        group: '视口控制',
        icon: <Box className="h-4 w-4" />,
        keywords: ['solid', 'shading', 'render', 'mode', 'performance'],
        execute: () => run(() => useViewer.getState().setShading('solid')),
      },
      {
        id: 'editor.viewer.shading-rendered',
        label: '切换到渲染显示',
        group: '视口控制',
        icon: <Sparkles className="h-4 w-4" />,
        keywords: ['rendered', 'shading', 'render', 'mode', 'quality'],
        execute: () => run(() => useViewer.getState().setShading('rendered')),
      },
      {
        id: 'editor.viewer.camera-snapshot',
        label: '拍摄快照',
        group: '视口控制',
        icon: <Camera className="h-4 w-4" />,
        keywords: ['camera', 'snapshot', 'capture', 'save', 'view', 'bookmark'],
        execute: () => {
          setOpen(false)
          useEditor.getState().setCaptureMode(true)
        },
      },

      // ── View ─────────────────────────────────────────────────────────────
      {
        id: 'editor.view.preview',
        label: () => (isPreviewMode ? '退出预览' : '进入预览'),
        group: '视图',
        icon: isPreviewMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />,
        keywords: ['preview', 'view', 'read-only', 'present'],
        execute: () => run(() => setPreviewMode(!isPreviewMode)),
      },
      {
        id: 'editor.view.fullscreen',
        label: '切换全屏',
        group: '视图',
        icon: <Maximize2 className="h-4 w-4" />,
        keywords: ['fullscreen', 'maximize', 'expand', 'window'],
        execute: () =>
          run(() => {
            if (document.fullscreenElement) document.exitFullscreen()
            else document.documentElement.requestFullscreen()
          }),
      },

      // ── History ──────────────────────────────────────────────────────────
      {
        id: 'editor.history.undo',
        label: '撤销',
        group: '历史记录',
        icon: <Undo2 className="h-4 w-4" />,
        keywords: ['undo', 'revert', 'back'],
        when: () => getHistoryCommandState().canUndo,
        execute: () => run(() => runUndo()),
      },
      {
        id: 'editor.history.redo',
        label: '重做',
        group: '历史记录',
        icon: <Redo2 className="h-4 w-4" />,
        keywords: ['redo', 'forward', 'repeat'],
        when: () => getHistoryCommandState().canRedo,
        execute: () => run(() => runRedo()),
      },

      // ── Export & Share ───────────────────────────────────────────────────
      {
        id: 'editor.export.json',
        label: '导出场景（JSON）',
        group: '导出与分享',
        icon: <FileJson className="h-4 w-4" />,
        keywords: ['export', 'download', 'json', 'save', 'data'],
        execute: () =>
          run(() => {
            const { nodes, rootNodeIds } = useScene.getState()
            const blob = new Blob([JSON.stringify({ nodes, rootNodeIds }, null, 2)], {
              type: 'application/json',
            })
            const url = URL.createObjectURL(blob)
            Object.assign(document.createElement('a'), {
              href: url,
              download: `scene_${new Date().toISOString().split('T')[0]}.json`,
            }).click()
            URL.revokeObjectURL(url)
          }),
      },
      ...(exportScene
        ? [
            {
              id: 'editor.export.glb',
              label: '导出三维模型（GLB）',
              group: '导出与分享',
              icon: <Box className="h-4 w-4" />,
              keywords: ['export', 'glb', 'gltf', '3d', 'model', 'download'],
              execute: () => run(() => exportScene()),
            },
          ]
        : []),
      {
        id: 'editor.export.share-link',
        label: '复制分享链接',
        group: '导出与分享',
        icon: <Copy className="h-4 w-4" />,
        keywords: ['share', 'copy', 'url', 'link'],
        execute: () => run(() => navigator.clipboard.writeText(window.location.href)),
      },
      {
        id: 'editor.export.screenshot',
        label: '截图',
        group: '导出与分享',
        icon: <Camera className="h-4 w-4" />,
        keywords: ['screenshot', 'capture', 'image', 'photo', 'png'],
        execute: () =>
          run(() => {
            const canvas = document.querySelector('canvas')
            if (!canvas) return
            Object.assign(document.createElement('a'), {
              href: canvas.toDataURL('image/png'),
              download: `screenshot_${new Date().toISOString().split('T')[0]}.png`,
            }).click()
          }),
      },
    ])
  }, [
    register,
    navigateTo,
    setInputValue,
    setOpen,
    setPhase,
    armToolMode,
    armMaterialPaint,
    setStructureLayer,
    isPreviewMode,
    setPreviewMode,
    exportScene,
  ])

  return null
}
