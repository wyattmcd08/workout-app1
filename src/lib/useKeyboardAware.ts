import { useEffect } from 'react'

// iOS PWA: the on-screen keyboard covers focused inputs by default.
// This hook scrolls a focused number/text input into view above the keyboard
// after the keyboard animation settles.
export function useKeyboardAware(active: boolean = true): void {
  useEffect(() => {
    if (!active) return

    function isInput(el: EventTarget | null): el is HTMLElement {
      if (!el) return false
      const node = el as HTMLElement
      const tag = node.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || node.isContentEditable === true
    }

    function bringIntoView(el: HTMLElement) {
      // visualViewport.height shrinks when keyboard opens on iOS.
      const vv = window.visualViewport
      const viewportH = vv?.height ?? window.innerHeight
      const rect = el.getBoundingClientRect()
      // We want the input centered in the visible viewport (above the keyboard).
      const center = viewportH / 2
      const delta = rect.top + rect.height / 2 - center
      if (Math.abs(delta) < 40) return
      window.scrollBy({ top: delta, behavior: 'smooth' })
    }

    function onFocus(e: FocusEvent) {
      if (!isInput(e.target)) return
      const el = e.target as HTMLElement
      // Allow the keyboard to start animating in before scrolling
      setTimeout(() => bringIntoView(el), 280)
    }

    document.addEventListener('focusin', onFocus, { passive: true })
    // Also react when the visual viewport itself resizes (keyboard show/hide).
    function onViewportResize() {
      const active = document.activeElement
      if (isInput(active)) {
        setTimeout(() => bringIntoView(active as HTMLElement), 100)
      }
    }
    window.visualViewport?.addEventListener('resize', onViewportResize)

    return () => {
      document.removeEventListener('focusin', onFocus)
      window.visualViewport?.removeEventListener('resize', onViewportResize)
    }
  }, [active])
}
