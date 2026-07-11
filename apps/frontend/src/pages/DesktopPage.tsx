import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import AppContextMenu from '@/components/AppContextMenu'
import DesktopPet from '@/components/DesktopPet'
import ApplicationWindow from '@/components/layout/ApplicationWindow'
import { useWindowManagerStore } from '@/stores/window-manager'
import { useWeatherStore } from '@/stores/weather'
import { useMobileViewport } from '@/hooks/use-mobile-viewport'
import type { AppId } from '@/apps/registry'

/**
 * @description 桌面背景视图，包含应用图标和所有活动窗口。
 */
export default function DesktopPage({ initialApp }: { initialApp?: AppId }) {
  const { t } = useTranslation()
  const store = useWindowManagerStore()
  const openWindow = store.openWindow
  const isMobileViewport = useMobileViewport()
  const initializeWeather = useWeatherStore((state) => state.initializeWeather)
  const iconLayerRef = useRef<HTMLDivElement | null>(null)
  const [desktopContextMenu, setDesktopContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    target: AppId | null
  }>({
    visible: false,
    x: 0,
    y: 0,
    target: null,
  })
  const [dragState, setDragState] = useState<{
    draggingId: AppId | null
    offsetX: number
    offsetY: number
    hasDragged: boolean
  }>({
    draggingId: null,
    offsetX: 0,
    offsetY: 0,
    hasDragged: false,
  })

  function closeDesktopContextMenu() {
    setDesktopContextMenu((state) => ({ ...state, visible: false, target: null }))
  }

  function openDesktopApp(id: AppId) {
    if (dragState.draggingId || dragState.hasDragged) {
      setDragState((state) => ({ ...state, hasDragged: false }))
      return
    }
    closeDesktopContextMenu()
    store.openWindow(id)
  }

  function handleDesktopIconContextMenu(event: MouseEvent, id: AppId) {
    event.preventDefault()
    setDesktopContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      target: id,
    })
  }

  function handleDesktopContextMenuDelete() {
    if (desktopContextMenu.target) {
      store.removeDesktopShortcut(desktopContextMenu.target)
    }
    closeDesktopContextMenu()
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>, id: AppId) {
    if (isMobileViewport) {
      event.preventDefault()
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    setDragState({
      draggingId: id,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      hasDragged: false,
    })
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }

  function handleDragOver(event: DragEvent) {
    if (isMobileViewport || !dragState.draggingId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragState((state) => ({ ...state, hasDragged: true }))
  }

  function handleLayerDrop(event: DragEvent) {
    if (isMobileViewport) return
    const draggingId = dragState.draggingId
    if (!draggingId) return
    event.preventDefault()
    const layer = iconLayerRef.current
    if (!layer) return
    const rect = layer.getBoundingClientRect()
    store.moveDesktopShortcut(
      draggingId,
      event.clientX - rect.left - dragState.offsetX,
      event.clientY - rect.top - dragState.offsetY,
    )
    setDragState((state) => ({ ...state, hasDragged: true }))
  }

  function handleDragEnd() {
    setDragState({
      draggingId: null,
      offsetX: 0,
      offsetY: 0,
      hasDragged: false,
    })
  }

  useEffect(() => {
    void initializeWeather()
  }, [initializeWeather])

  useEffect(() => {
    if (initialApp) openWindow(initialApp)
  }, [initialApp, openWindow])

  return (
    <div className="app-desktop-container">
      <div
        ref={iconLayerRef}
        className="app-icon-layer"
        onContextMenu={(event) => event.preventDefault()}
        onDragOver={handleDragOver}
        onDrop={handleLayerDrop}
      >
        {store.desktopShortcuts.map((shortcut) => {
          const app = store.availableApps[shortcut.id]
          return (
            <div
              key={shortcut.id}
              className={`app-desktop-icon ${
                dragState.draggingId === shortcut.id ? 'is-dragging' : ''
              }`}
              style={{ left: shortcut.x, top: shortcut.y }}
              draggable={!isMobileViewport}
              onDoubleClick={() => openDesktopApp(shortcut.id)}
              onContextMenu={(event) => handleDesktopIconContextMenu(event, shortcut.id)}
              onDragStart={(event) => handleDragStart(event, shortcut.id)}
              onDragOver={handleDragOver}
              onDrop={(event) => {
                event.stopPropagation()
                handleLayerDrop(event)
              }}
              onDragEnd={handleDragEnd}
            >
              <div className="app-icon-image">{app?.icon ?? ''}</div>
              <span className="app-icon-label">{t(app?.i18nTitleKey ?? '')}</span>
            </div>
          )
        })}
      </div>

      <DesktopPet boundsRef={iconLayerRef} />

      {store.openWindows.map((windowData) => (
        <ApplicationWindow key={windowData.id} windowData={windowData} />
      ))}

      <AppContextMenu
        visible={desktopContextMenu.visible}
        x={desktopContextMenu.x}
        y={desktopContextMenu.y}
        onClose={closeDesktopContextMenu}
      >
        <button
          type="button"
          className="app-context-menu-btn"
          onClick={handleDesktopContextMenuDelete}
        >
          {t('desktop.header.contextMenu.deleteShortcut')}
        </button>
      </AppContextMenu>
    </div>
  )
}
