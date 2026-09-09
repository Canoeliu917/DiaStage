type OwnedRenderer = {
  dispose(): void
  onDeviceLost?(info: unknown): void
}

export function createRendererLifecycle() {
  let attached = true
  let renderer: OwnedRenderer | null = null
  const disposed = new WeakSet<OwnedRenderer>()

  function release(candidate: OwnedRenderer) {
    if (disposed.has(candidate)) return
    disposed.add(candidate)
    candidate.onDeviceLost = () => {}
    candidate.dispose()
  }

  return {
    attach() {
      if (!renderer || !disposed.has(renderer)) attached = true
    },
    detach() {
      attached = false
      // StrictMode reconnects the same owner before this microtask runs.
      queueMicrotask(() => {
        if (!attached && renderer) release(renderer)
      })
    },
    track(candidate: OwnedRenderer): boolean {
      if (!attached || (renderer && renderer !== candidate)) {
        release(candidate)
        return false
      }
      if (disposed.has(candidate)) return false
      renderer = candidate
      return true
    },
    isActive(): boolean {
      return attached && (!renderer || !disposed.has(renderer))
    },
  }
}
