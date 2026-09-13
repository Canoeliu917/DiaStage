import { useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'

/** Forward frame-loop exceptions to the module's React error boundary. */
export function useIsolatedFrame(callback: Parameters<typeof useFrame>[0], priority?: number) {
  const failed = useRef(false)
  const [error, setError] = useState<Error | null>(null)
  useFrame((...args) => {
    if (failed.current) return
    try {
      callback(...args)
    } catch (cause) {
      failed.current = true
      setError(cause instanceof Error ? cause : new Error(String(cause)))
    }
  }, priority)
  if (error) throw error
}
