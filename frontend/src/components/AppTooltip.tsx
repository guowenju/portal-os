import type { ReactNode } from 'react'

interface AppTooltipProps {
  text: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactNode
}

/**
 * @description 提供轻量 hover 提示，不参与业务交互状态。
 */
export default function AppTooltip({ text, position = 'top', children }: AppTooltipProps) {
  return (
    <span className={`app-tooltip app-tooltip-${position}`}>
      {children}
      <span className="app-tooltip-bubble">{text}</span>
    </span>
  )
}
