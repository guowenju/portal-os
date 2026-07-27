import { Suspense, useMemo, useRef, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  selectMaxZIndex,
  useWindowManagerStore,
  type WindowInstance,
} from '@/stores/window-manager'
import AppTooltip from '@/components/AppTooltip'
import { useMobileViewport } from '@/hooks/use-mobile-viewport'
import './ApplicationWindow.css'

interface ApplicationWindowProps {
  windowData: WindowInstance
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const DEFAULT_MIN_WIDTH = 300
const DEFAULT_MIN_HEIGHT = 200
const HEADER_HEIGHT = 40

/**
 * @description 通用应用窗口容器，提供拖动、控制按钮和动态内容渲染。
 */
export default function ApplicationWindow({ windowData }: ApplicationWindowProps) {
  const { t } = useTranslation()
  const windowRef = useRef<HTMLDivElement | null>(null)
  const store = useWindowManagerStore()
  const maxZIndex = useWindowManagerStore(selectMaxZIndex)
  const maxVisibleZIndex = useWindowManagerStore((state) =>
    state.openWindows
      .filter((item) => !item.isMinimized)
      .reduce((max, item) => Math.max(max, item.zIndex), 0),
  )
  const isMobileViewport = useMobileViewport()
  const AppComponent = windowData.component
  const isTopVisibleWindow = windowData.zIndex === maxVisibleZIndex

  const windowStyle = useMemo(
    () => ({
      transform: `translate(${windowData.positionX}px, ${windowData.positionY}px)`,
      zIndex: windowData.zIndex,
      width: `${windowData.width}px`,
      height: `${windowData.height}px`,
    }),
    [
      windowData.height,
      windowData.positionX,
      windowData.positionY,
      windowData.width,
      windowData.zIndex,
    ],
  )

  function withDocumentDragCursor(cursor: string) {
    document.body.style.setProperty('user-select', 'none')
    document.body.style.setProperty('cursor', cursor)
  }

  function restoreDocumentCursor() {
    document.body.style.setProperty('user-select', 'auto')
    document.body.style.setProperty('cursor', 'default')
  }

  function startDrag(event: MouseEvent<HTMLElement>) {
    if (isMobileViewport || windowData.isMaximized) return
    event.preventDefault()
    store.focusWindow(windowData.id)
    withDocumentDragCursor('grabbing')

    const mouseStartX = event.clientX
    const mouseStartY = event.clientY
    const windowStartX = windowData.positionX
    const windowStartY = windowData.positionY

    const dragMove = (moveEvent: globalThis.MouseEvent) => {
      const deltaX = moveEvent.clientX - mouseStartX
      const deltaY = moveEvent.clientY - mouseStartY
      let newX = windowStartX + deltaX
      let newY = windowStartY + deltaY
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const windowHeaderHeight = 30
      const marginSafeWidth = 140
      const desktopAreaHeight = viewportHeight - HEADER_HEIGHT
      const minY = 0
      const maxY = desktopAreaHeight - windowHeaderHeight
      const minX = marginSafeWidth - windowData.width
      const maxX = viewportWidth - marginSafeWidth

      if (newY < minY) newY = minY
      if (newY > maxY) newY = maxY
      if (newX < minX) newX = minX
      if (newX > maxX) newX = maxX

      store.updatePosition(windowData.id, newX, newY)
    }

    const dragEnd = () => {
      document.removeEventListener('mousemove', dragMove)
      document.removeEventListener('mouseup', dragEnd)
      restoreDocumentCursor()
    }

    document.addEventListener('mousemove', dragMove)
    document.addEventListener('mouseup', dragEnd)
  }

  function startResize(event: MouseEvent<HTMLDivElement>, direction: ResizeDirection) {
    if (isMobileViewport || windowData.isMaximized) return
    event.preventDefault()
    event.stopPropagation()
    store.focusWindow(windowData.id)
    withDocumentDragCursor(`${direction}-resize`)

    const mouseStartX = event.clientX
    const mouseStartY = event.clientY
    const windowStartWidth = windowData.width
    const windowStartHeight = windowData.height
    const windowStartX = windowData.positionX
    const windowStartY = windowData.positionY
    const rightEdge = windowStartX + windowStartWidth
    const bottomEdge = windowStartY + windowStartHeight

    const resizeMove = (moveEvent: globalThis.MouseEvent) => {
      const deltaX = moveEvent.clientX - mouseStartX
      const deltaY = moveEvent.clientY - mouseStartY
      let newWidth = windowStartWidth
      let newHeight = windowStartHeight
      let newX = windowStartX
      let newY = windowStartY
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const desktopAreaHeight = viewportHeight - HEADER_HEIGHT
      const minWidth = Math.max(windowData.minWidth, DEFAULT_MIN_WIDTH)
      const minHeight = Math.max(windowData.minHeight, DEFAULT_MIN_HEIGHT)

      if (direction.includes('e')) {
        const maxWidth = Math.max(minWidth, viewportWidth - windowStartX)
        newWidth = Math.min(maxWidth, windowStartWidth + deltaX)
      }
      if (direction.includes('s')) {
        const maxHeight = Math.max(minHeight, desktopAreaHeight - windowStartY)
        newHeight = Math.min(maxHeight, windowStartHeight + deltaY)
      }
      if (direction.includes('w')) {
        const nextX = Math.min(Math.max(0, windowStartX + deltaX), rightEdge - minWidth)
        newX = nextX
        newWidth = rightEdge - nextX
      }
      if (direction.includes('n')) {
        const nextY = Math.min(Math.max(0, windowStartY + deltaY), bottomEdge - minHeight)
        newY = nextY
        newHeight = bottomEdge - nextY
      }

      store.updateSize(windowData.id, Math.max(minWidth, newWidth), Math.max(minHeight, newHeight))
      store.updatePosition(windowData.id, newX, newY)
    }

    const resizeEnd = () => {
      document.removeEventListener('mousemove', resizeMove)
      document.removeEventListener('mouseup', resizeEnd)
      restoreDocumentCursor()
    }

    document.addEventListener('mousemove', resizeMove)
    document.addEventListener('mouseup', resizeEnd)
  }

  if (windowData.isMinimized) return null

  return (
    <div
      ref={windowRef}
      className={`app-window-container ${
        windowData.zIndex === maxZIndex ? 'app-window-focused' : ''
      } ${isTopVisibleWindow ? 'app-window-mobile-active' : ''} ${
        windowData.isMaximized ? 'app-window-maximized' : ''
      }`}
      style={windowStyle}
      onMouseDown={() => store.focusWindow(windowData.id)}
    >
      <header
        className="app-window-header"
        onMouseDown={startDrag}
        onDoubleClick={() => {
          if (!isMobileViewport) store.toggleMaximize(windowData.id)
        }}
      >
        <div className="app-window-controls">
          <AppTooltip text={t('desktop.window.close')} position="bottom">
            <button
              className="app-control-btn app-btn-close"
              type="button"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                store.closeWindow(windowData.id)
              }}
              aria-label={t('desktop.window.close')}
            />
          </AppTooltip>
          <AppTooltip text={t('desktop.window.minimize')} position="bottom">
            <button
              className="app-control-btn app-btn-minimize"
              type="button"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                store.minimizeWindow(windowData.id)
              }}
              aria-label={t('desktop.window.minimize')}
            />
          </AppTooltip>
          <AppTooltip text={t('desktop.window.maximize')} position="bottom">
            <button
              className="app-control-btn app-btn-maximize"
              type="button"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                store.toggleMaximize(windowData.id)
              }}
              aria-label={t('desktop.window.maximize')}
            />
          </AppTooltip>
        </div>

        <span className="app-window-title">
          <span className="app-window-title-icon" aria-hidden="true">
            {windowData.icon}
          </span>
          <span>{windowData.title}</span>
        </span>
      </header>

      <main className="app-window-content">
        <Suspense fallback={<div className="app-loading">{t('desktop.window.loadingApp')}</div>}>
          <AppComponent isMaximized={windowData.isMaximized} payload={windowData.payload} />
        </Suspense>
      </main>

      {!windowData.isMaximized &&
        !isMobileViewport &&
        (['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeDirection[]).map((direction) => (
          <div
            key={direction}
            className={`app-window-resizer resizer-${direction}`}
            onMouseDown={(event) => startResize(event, direction)}
          />
        ))}
    </div>
  )
}
