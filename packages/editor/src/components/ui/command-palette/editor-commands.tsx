'use client'

import { useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import {
  Box,
  Camera,
  Copy,
  Eye,
  EyeOff,
  FileJson,
  Layers,
  Maximize2,
  Package,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
  Video,
} from 'lucide-react'
import { useEffect } from 'react'
import { getHistoryCommandState, runRedo, runUndo } from '../../../lib/history'
import { useCommandRegistry } from '../../../store/use-command-registry'
import type { StructureTool } from '../../../store/use-editor'
import useEditor from '../../../store/use-editor'
import { useCommandPalette } from './index'

export function EditorCommands() {
  const register = useCommandRegistry((s) => s.register)
  const { navigateTo, setOpen } = useCommandPalette()

  const setPhase = useEditor((s) => s.setPhase)
  const armToolMode = useEditor((s) => s.armToolMode)
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
        id: 'editor.tool.item',
        label: '道具放置',
        group: '场景',
        icon: <Package className="h-4 w-4" />,
        keywords: ['furniture', 'object', 'asset', 'furnish'],
        execute: () => activateTool('item'),
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


      // ── Levels ───────────────────────────────────────────────────────────





      // ── Viewer Controls ──────────────────────────────────────────────────
      {
        id: 'editor.viewer.wall-mode',
        label: '景片显示方式',
        group: '视口控制',
        icon: <Layers className="h-4 w-4" />,
        keywords: ['wall', 'cutaway', 'up', 'down', 'translucent', 'view'],
        badge: () => {
          const mode = useViewer.getState().wallMode
          return { cutaway: '剖切', up: '完整高度', down: '低位显示', translucent: '半透明' }[mode]
        },
        navigate: true,
        execute: () => navigateTo('wall-mode'),
      },

      {
        id: 'editor.viewer.camera-mode',
        label: () => {
          const mode = useViewer.getState().cameraMode
          return `视图：切换到${mode === 'perspective' ? '正交' : '透视'}`
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
    setOpen,
    setPhase,
    armToolMode,
    setStructureLayer,
    isPreviewMode,
    setPreviewMode,
    exportScene,
  ])

  return null
}
