'use client'

import { useEffect, useRef } from 'react'

export function useDialog(pending: boolean, onClose: () => void) {
  const ref = useRef<HTMLElement>(null)
  const latest = useRef({ pending, onClose })
  latest.current = { pending, onClose }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const controls = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((element) => !element.matches(':disabled'))
    ;(controls()[0] ?? ref.current)?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !latest.current.pending) {
        event.preventDefault()
        latest.current.onClose()
      }
      if (event.key !== 'Tab') return
      const focusable = controls(),
        first = focusable[0],
        last = focusable.at(-1)
      if (!first) {
        event.preventDefault()
        ref.current?.focus()
        return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', keydown)
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  return ref
}
