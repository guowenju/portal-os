import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import AppContextMenu from '@/components/AppContextMenu'
import PortalIcon from '@/components/PortalIcon'
import AppTooltip from '@/components/AppTooltip'
import type { AppId } from '@/apps/registry'
import {
  selectMaxZIndex,
  useWindowManagerStore,
  type WindowInstance,
} from '@/stores/window-manager'
import { useNotificationStore } from '@/stores/notification'

type ProgressStatus = 'planned' | 'developing' | 'testing'

/**
 * @description 桌面布局的上部菜单栏组件。
 */
export default function DesktopHeader() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const store = useWindowManagerStore()
  const maxZIndex = useWindowManagerStore(selectMaxZIndex)
  const notificationStore = useNotificationStore()
  const [appLibraryOpen, setAppLibraryOpen] = useState(false)
  const appLibraryButtonRef = useRef<HTMLButtonElement | null>(null)
  const [libraryContextMenu, setLibraryContextMenu] = useState<{
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

  const appList = useMemo(() => {
    const ids =
      store.appCatalogOrder.length > 0
        ? store.appCatalogOrder
        : (Object.keys(store.availableApps) as AppId[])
    return ids
      .map((id) => {
        const config = store.availableApps[id]
        if (!config || config.hidden) return null
        return {
          id,
          title: t(config.i18nTitleKey),
          icon: config.icon,
          progressStatus: config.progressStatus ?? null,
        }
      })
      .filter(
        (
          item,
        ): item is {
          id: AppId
          title: string
          icon: ReactNode
          progressStatus: ProgressStatus | null
        } => item !== null,
      )
  }, [store.appCatalogOrder, store.availableApps, t])

  function getProgressLabel(status: ProgressStatus): string {
    if (status === 'planned') return t('common.status.planned')
    if (status === 'developing') return t('common.status.developing')
    return t('common.status.testing')
  }

  function handleReturnToDesktop() {
    store.openWindows.forEach((windowData) => {
      if (!windowData.isMinimized) {
        store.minimizeWindow(windowData.id)
      }
    })
    void navigate('/')
  }

  function handleAppIconClick(id: string) {
    const instance = store.openWindows.find((windowData: WindowInstance) => windowData.id === id)
    if (!instance) return

    if (instance.isMinimized) {
      store.focusWindow(id)
      store.openWindowWithPayload(instance.appId, instance.payload, {
        instanceId: id,
        title: instance.i18nTitleKey ? undefined : instance.title,
        icon: instance.icon,
        width: instance.width,
        height: instance.height,
        minWidth: instance.minWidth,
        minHeight: instance.minHeight,
      })
      return
    }

    if (instance.zIndex === maxZIndex) {
      store.minimizeWindow(id)
    } else {
      store.focusWindow(id)
    }
  }

  function toggleAppLibrary() {
    setAppLibraryOpen((open) => !open)
    if (appLibraryOpen) closeLibraryContextMenu()
  }

  function closeAppLibrary() {
    setAppLibraryOpen(false)
    closeLibraryContextMenu()
  }

  function handleLibraryAppClick(id: AppId) {
    store.openWindow(id)
    closeAppLibrary()
  }

  function openLibraryContextMenu(event: MouseEvent, id: AppId) {
    event.preventDefault()
    setLibraryContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      target: id,
    })
  }

  function closeLibraryContextMenu() {
    setLibraryContextMenu((state) => ({ ...state, visible: false, target: null }))
  }

  function handleAddToDesktop() {
    const target = libraryContextMenu.target
    if (target) {
      store.addDesktopShortcut(target)
      notificationStore.info(t('notification.addedToDesktop'))
    }
    closeLibraryContextMenu()
  }

  function handleViewAppDetail() {
    const target = libraryContextMenu.target
    const appConfig = target ? store.availableApps[target] : undefined
    const appName = appConfig ? t(appConfig.i18nTitleKey) : target
    if (appName) {
      notificationStore.info(t('notification.viewDetailsWIP', { appName }))
    }
    closeLibraryContextMenu()
  }

  return (
    <header className="app-header-content">
      <div className="app-header-center">
        <div
          className={`app-nav-home ${store.openWindows.length > 0 ? 'app-nav-home-separated' : ''}`}
        >
          <AppTooltip text={t('desktop.header.showDesktop')} position="bottom">
            <button className="app-desktop-btn" type="button" onClick={handleReturnToDesktop}>
              <PortalIcon name="desktop-home" size={22} />
            </button>
          </AppTooltip>
          <AppTooltip text={t('desktop.header.appLibrary')} position="bottom">
            <button
              ref={appLibraryButtonRef}
              className="app-library-btn"
              type="button"
              onClick={toggleAppLibrary}
            >
              <PortalIcon name="app-library" size={22} />
            </button>
          </AppTooltip>
        </div>

        <div
          className={`app-nav-apps-group ${
            store.openWindows.length > 0 ? 'app-nav-apps-group-separated' : ''
          }`}
        >
          {store.openWindows.map((windowData) => {
            const appTitle = windowData.i18nTitleKey ? t(windowData.i18nTitleKey) : windowData.title
            return (
              <AppTooltip key={windowData.id} text={appTitle} position="bottom">
                <button
                  type="button"
                  className={`app-nav-app ${!windowData.isMinimized ? 'app-app-active' : ''} ${
                    windowData.isMinimized ? 'app-app-minimized' : ''
                  }`}
                  aria-label={appTitle}
                  onClick={() => handleAppIconClick(windowData.id)}
                >
                  <span className="app-nav-app-label">{windowData.icon}</span>
                </button>
              </AppTooltip>
            )
          })}
        </div>
      </div>

      <div className="app-header-space">
        <div className="app-header-logo" aria-label="PortalOS">
          <span className="app-logo-mark" aria-hidden="true">
            <svg viewBox="0 0 44 44" focusable="false">
              <path
                className="app-logo-mark-leaf app-logo-mark-leaf-main"
                d="M8 24C11 9 25 4 37 10c-1 14-10 25-25 27 6-6 12-12 18-19-9 5-16 11-22 19Z"
              />
              <path
                className="app-logo-mark-leaf app-logo-mark-leaf-accent"
                d="M10 11c8-6 17-5 24 2-8 6-17 5-24-2Z"
              />
              <circle cx="14" cy="28" r="4" className="app-logo-mark-dot" />
            </svg>
          </span>
          <span className="app-logo-word" data-text="PortalOS">
            PortalOS
          </span>
        </div>
      </div>

      <div className="app-header-operate" />

      {appLibraryOpen &&
        createPortal(
          <div className="app-library-panel-overlay" onClick={closeAppLibrary}>
            <div className="app-library-panel-wrapper" onClick={(event) => event.stopPropagation()}>
              <header className="app-library-panel-header">
                <div>{t('desktop.header.appLibrary')}</div>
              </header>
              <div className="app-library-grid">
                {appList.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    className="app-library-item"
                    title={app.title}
                    onClick={() => handleLibraryAppClick(app.id)}
                    onContextMenu={(event) => openLibraryContextMenu(event, app.id)}
                  >
                    <span className="app-library-icon">{app.icon}</span>
                    <span className="app-library-title">{app.title}</span>
                    {app.progressStatus && (
                      <span className={`app-library-badge app-library-badge-${app.progressStatus}`}>
                        {getProgressLabel(app.progressStatus)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}

      <AppContextMenu
        visible={libraryContextMenu.visible}
        x={libraryContextMenu.x}
        y={libraryContextMenu.y}
        onClose={closeLibraryContextMenu}
      >
        <button
          type="button"
          className="app-context-menu-btn"
          disabled={
            libraryContextMenu.target ? store.hasDesktopShortcut(libraryContextMenu.target) : false
          }
          title={t(
            libraryContextMenu.target && store.hasDesktopShortcut(libraryContextMenu.target)
              ? 'desktop.header.contextMenu.alreadyOnDesktop'
              : 'desktop.header.contextMenu.addToDesktop',
          )}
          onClick={handleAddToDesktop}
        >
          {t('desktop.header.contextMenu.addToDesktop')}
        </button>
        <button type="button" className="app-context-menu-btn" onClick={handleViewAppDetail}>
          {t('desktop.header.contextMenu.viewDetails')}
        </button>
      </AppContextMenu>
    </header>
  )
}
