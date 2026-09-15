export function registerKeyboardInputLoss(clear: () => void) {
  const visibility = () => {
    if (document.visibilityState === 'hidden') clear()
  }
  window.addEventListener('blur', clear)
  window.addEventListener('pagehide', clear)
  document.addEventListener('visibilitychange', visibility)
  return () => {
    window.removeEventListener('blur', clear)
    window.removeEventListener('pagehide', clear)
    document.removeEventListener('visibilitychange', visibility)
  }
}
