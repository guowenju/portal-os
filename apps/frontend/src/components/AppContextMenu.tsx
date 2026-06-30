import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface AppContextMenuProps {
  visible: boolean
  x: number
  y: number
  onClose: () => void
  children: ReactNode
  className?: string
  portal?: boolean
  style?: CSSProperties
}

/**
 * @description 通用右键菜单，负责定位、外部点击和 Esc 关闭。
 */
export default function AppContextMenu({
  visible,
  x,
  y,
  onClose,
  children,
  className = '',
  portal = true,
  style,
}: AppContextMenuProps) {
  useEffect(() => {
    if (!visible) return
    const handlePointerDown = () => onClose()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, visible])

  if (!visible) return null

  const menu = (
    <div
      className={`app-context-menu ${className}`.trim()}
      style={portal ? { left: x, top: y, ...style } : style}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      role="menu"
    >
      {children}
    </div>
  )

  if (!portal) return menu

  return createPortal(menu, document.body)
}
