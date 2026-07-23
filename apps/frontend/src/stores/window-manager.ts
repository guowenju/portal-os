import i18next from 'i18next'
import { create } from 'zustand'
import { availableApps, type AppConfig, type AppId } from '@/apps/registry'

export interface WindowInstance {
  id: string
  appId: AppId
  component: AppConfig['component']
  title: string
  i18nTitleKey?: string
  icon: AppConfig['icon']
  positionX: number
  positionY: number
  width: number
  height: number
  minWidth: number
  minHeight: number
  isMinimized: boolean
  isMaximized: boolean
  zIndex: number
  payload?: Record<string, unknown>
}

/**
 * @description 桌面快捷方式在桌面网格中的位置。
 */
export interface DesktopShortcutPlacement {
  id: AppId
  x: number
  y: number
}

interface WindowManagerStore {
  openWindows: WindowInstance[]
  availableApps: Record<AppId, AppConfig>
  desktopShortcuts: DesktopShortcutPlacement[]
  appCatalogOrder: AppId[]
  openWindow: (id: AppId) => void
  openWindowWithPayload: (
    id: AppId,
    payload?: Record<string, unknown>,
    options?: OpenWindowOptions,
  ) => void
  closeWindow: (id: string) => void
  minimizeWindow: (id: string) => void
  focusWindow: (id: string) => void
  updatePosition: (id: string, x: number, y: number) => void
  updateSize: (id: string, width: number, height: number) => void
  toggleMaximize: (id: string) => void
  hasDesktopShortcut: (id: AppId) => boolean
  addDesktopShortcut: (id: AppId) => void
  removeDesktopShortcut: (id: AppId) => void
  moveDesktopShortcut: (id: AppId, rawX: number, rawY: number) => void
  refreshWindowTitles: () => void
}

interface OpenWindowOptions {
  instanceId?: string
  title?: string
  icon?: AppConfig['icon']
  width?: number
  height?: number
  minWidth?: number
  minHeight?: number
  isMaximized?: boolean
}

const HEADER_HEIGHT = 40
const BASE_Z_INDEX = 1000
const DESKTOP_SHORTCUTS_STORAGE_KEY = 'app_desktop_shortcuts'
const DEFAULT_DESKTOP_SIDE: 'left' | 'right' = 'left'
const DESKTOP_ICON_WIDTH = 90
const DESKTOP_ICON_HEIGHT = 88
const DESKTOP_GRID_COLUMN_WIDTH = 110
const DESKTOP_GRID_ROW_HEIGHT = 110
const DESKTOP_GRID_PADDING = 20
const defaultDesktopApps: AppId[] = ['settings', 'blog']
const defaultOpenApps: AppId[] = []

function calculateCenteredX(windowWidth: number): number {
  return Math.max(0, window.innerWidth / 2 - windowWidth / 2)
}

function calculateCenteredY(windowHeight: number): number {
  const availableHeight = window.innerHeight - HEADER_HEIGHT
  return Math.max(0, (availableHeight - windowHeight) / 2)
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getDesktopWidth(): number {
  if (typeof window === 'undefined') return 1280
  return window.innerWidth
}

function getDesktopHeight(): number {
  if (typeof window === 'undefined') return 720
  return Math.max(DESKTOP_GRID_ROW_HEIGHT, window.innerHeight - HEADER_HEIGHT)
}

function getDesktopRows(height = getDesktopHeight()): number {
  const availableHeight = Math.max(0, height - DESKTOP_GRID_PADDING * 2)
  return Math.max(1, Math.floor(availableHeight / DESKTOP_GRID_ROW_HEIGHT))
}

function getDesktopColumns(width = getDesktopWidth()): number {
  const availableWidth = Math.max(0, width - DESKTOP_GRID_PADDING * 2)
  return Math.max(1, Math.floor(availableWidth / DESKTOP_GRID_COLUMN_WIDTH))
}

function getMaxDesktopX(width = getDesktopWidth()): number {
  return Math.max(DESKTOP_GRID_PADDING, width - DESKTOP_GRID_PADDING - DESKTOP_ICON_WIDTH)
}

function getMaxDesktopY(height = getDesktopHeight()): number {
  return Math.max(DESKTOP_GRID_PADDING, height - DESKTOP_GRID_PADDING - DESKTOP_ICON_HEIGHT)
}

function getGridPoint(
  column: number,
  row: number,
  side = DEFAULT_DESKTOP_SIDE,
): { x: number; y: number } {
  const maxX = getMaxDesktopX()
  const x =
    side === 'right'
      ? maxX - column * DESKTOP_GRID_COLUMN_WIDTH
      : DESKTOP_GRID_PADDING + column * DESKTOP_GRID_COLUMN_WIDTH
  const y = DESKTOP_GRID_PADDING + row * DESKTOP_GRID_ROW_HEIGHT
  return {
    x: clampNumber(x, DESKTOP_GRID_PADDING, maxX),
    y: clampNumber(y, DESKTOP_GRID_PADDING, getMaxDesktopY()),
  }
}

function getGridKey(x: number, y: number): string {
  return `${x}:${y}`
}

function getGridColumn(x: number, side = DEFAULT_DESKTOP_SIDE): number {
  if (side === 'right') {
    return Math.round((getMaxDesktopX() - x) / DESKTOP_GRID_COLUMN_WIDTH)
  }
  return Math.round((x - DESKTOP_GRID_PADDING) / DESKTOP_GRID_COLUMN_WIDTH)
}

function getGridRow(y: number): number {
  return Math.round((y - DESKTOP_GRID_PADDING) / DESKTOP_GRID_ROW_HEIGHT)
}

function snapDesktopPosition(
  rawX: number,
  rawY: number,
  side = DEFAULT_DESKTOP_SIDE,
): { x: number; y: number } {
  const maxX = getMaxDesktopX()
  const maxY = getMaxDesktopY()
  const clampedX = clampNumber(rawX, DESKTOP_GRID_PADDING, maxX)
  const clampedY = clampNumber(rawY, DESKTOP_GRID_PADDING, maxY)
  const column = getGridColumn(clampedX, side)
  const row = getGridRow(clampedY)
  const point = getGridPoint(column, row, side)
  return {
    x: clampNumber(point.x, DESKTOP_GRID_PADDING, maxX),
    y: clampNumber(point.y, DESKTOP_GRID_PADDING, maxY),
  }
}

function findAvailableDesktopPosition(
  preferred: { x: number; y: number },
  placements: DesktopShortcutPlacement[],
  movingId?: AppId,
): { x: number; y: number } {
  const occupied = new Set(
    placements.filter((item) => item.id !== movingId).map((item) => getGridKey(item.x, item.y)),
  )
  if (!occupied.has(getGridKey(preferred.x, preferred.y))) return preferred

  const rows = getDesktopRows()
  const columns = getDesktopColumns()
  const preferredColumn = getGridColumn(preferred.x, DEFAULT_DESKTOP_SIDE)
  const preferredRow = getGridRow(preferred.y)
  for (let distance = 0; distance <= Math.max(rows, columns); distance += 1) {
    for (let columnOffset = -distance; columnOffset <= distance; columnOffset += 1) {
      for (let rowOffset = -distance; rowOffset <= distance; rowOffset += 1) {
        if (Math.abs(columnOffset) + Math.abs(rowOffset) !== distance) continue
        const column = preferredColumn + columnOffset
        const row = preferredRow + rowOffset
        if (column < 0 || column >= columns || row < 0 || row >= rows) continue
        const candidate = getGridPoint(column, row, DEFAULT_DESKTOP_SIDE)
        if (!occupied.has(getGridKey(candidate.x, candidate.y))) return candidate
      }
    }
  }

  const fallbackIndex = placements.filter((item) => item.id !== movingId).length
  return getGridPoint(Math.floor(fallbackIndex / rows), fallbackIndex % rows, DEFAULT_DESKTOP_SIDE)
}

function getMaxZIndex(openWindows: WindowInstance[]) {
  return openWindows.reduce((max, windowData) => Math.max(max, windowData.zIndex), BASE_Z_INDEX)
}

/**
 * @description 根据应用配置创建初始打开窗口。
 */
function buildInitialWindow(id: AppId, index: number): WindowInstance | null {
  const appConfig = availableApps[id]
  if (!appConfig) return null

  const width = Math.max(appConfig.defaultWidth, appConfig.minWidth)
  const height = Math.max(appConfig.defaultHeight, appConfig.minHeight)
  const offset = index * 26
  const desktopAreaHeight = getDesktopHeight()
  const maxX = Math.max(0, getDesktopWidth() - width)
  const maxY = Math.max(0, desktopAreaHeight - height)

  return {
    id,
    appId: id,
    component: appConfig.component,
    title: i18next.t(appConfig.i18nTitleKey),
    i18nTitleKey: appConfig.i18nTitleKey,
    icon: appConfig.icon,
    positionX: Math.max(0, Math.min(maxX, calculateCenteredX(width) + offset)),
    positionY: Math.max(0, Math.min(maxY, calculateCenteredY(height) + offset)),
    width,
    height,
    minWidth: appConfig.minWidth,
    minHeight: appConfig.minHeight,
    isMinimized: false,
    isMaximized: false,
    zIndex: BASE_Z_INDEX + index + 1,
  }
}

function buildInitialOpenWindows() {
  if (typeof window === 'undefined') return []
  return defaultOpenApps
    .map((id, index) => buildInitialWindow(id, index))
    .filter((item): item is WindowInstance => item !== null)
}

function buildDefaultDesktopPlacements(ids: AppId[]): DesktopShortcutPlacement[] {
  const rows = getDesktopRows()
  return ids.map((id, index) => {
    const point = getGridPoint(Math.floor(index / rows), index % rows, DEFAULT_DESKTOP_SIDE)
    return {
      id,
      x: point.x,
      y: point.y,
    }
  })
}

function normalizeDesktopShortcutPlacements(items: unknown): DesktopShortcutPlacement[] {
  if (!Array.isArray(items)) return []

  const seenIds = new Set<AppId>()
  const placements: DesktopShortcutPlacement[] = []
  items.forEach((item) => {
    if (!item || typeof item !== 'object') return
    const candidate = item as { id?: unknown; x?: unknown; y?: unknown }
    if (typeof candidate.id !== 'string') return
    if (!(candidate.id in availableApps)) return
    const id = candidate.id as AppId
    if (seenIds.has(id)) return
    if (typeof candidate.x !== 'number' || typeof candidate.y !== 'number') return
    if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return
    seenIds.add(id)
    const snapped = snapDesktopPosition(candidate.x, candidate.y)
    placements.push({
      id,
      ...findAvailableDesktopPosition(snapped, placements, id),
    })
  })
  return placements
}

function loadDesktopShortcuts() {
  try {
    const saved = localStorage.getItem(DESKTOP_SHORTCUTS_STORAGE_KEY)
    const parsed = saved ? JSON.parse(saved) : null
    const shortcuts = normalizeDesktopShortcutPlacements(parsed)
    if (shortcuts.length > 0) return shortcuts
  } catch (error) {
    console.warn('加载桌面快捷方式失败', error)
  }
  return buildDefaultDesktopPlacements(defaultDesktopApps.filter((appId) => appId in availableApps))
}

function persistDesktopShortcuts(shortcuts: DesktopShortcutPlacement[]) {
  try {
    localStorage.setItem(DESKTOP_SHORTCUTS_STORAGE_KEY, JSON.stringify(shortcuts))
  } catch (error) {
    console.warn('保存桌面快捷方式失败', error)
  }
}

export const useWindowManagerStore = create<WindowManagerStore>((set, get) => ({
  openWindows: buildInitialOpenWindows(),
  availableApps,
  desktopShortcuts: typeof window === 'undefined' ? [] : loadDesktopShortcuts(),
  appCatalogOrder: (Object.keys(availableApps) as AppId[]).filter(Boolean),
  openWindow: (id) => get().openWindowWithPayload(id),
  openWindowWithPayload: (id, payload, options) => {
    const instanceId = options?.instanceId ?? id
    const appConfig = availableApps[id]
    if (!appConfig) {
      console.error(`App config not found for id: ${id}`)
      return
    }

    const title = options?.title ?? i18next.t(appConfig.i18nTitleKey)
    const icon = options?.icon ?? appConfig.icon
    const minWidth = options?.minWidth ?? appConfig.minWidth
    const minHeight = options?.minHeight ?? appConfig.minHeight
    const i18nTitleKey = options?.title ? undefined : appConfig.i18nTitleKey

    set((state) => {
      const existing = state.openWindows.find((item) => item.id === instanceId)
      if (existing) {
        const openWindows = state.openWindows.map((item) =>
          item.id === instanceId
            ? {
                ...item,
                isMinimized: false,
                payload: payload ?? item.payload,
                title,
                icon,
                i18nTitleKey,
                minWidth,
                minHeight,
                width: Math.max(options?.width ?? item.width, minWidth),
                height: Math.max(options?.height ?? item.height, minHeight),
                isMaximized: options?.isMaximized ?? item.isMaximized,
                zIndex: getMaxZIndex(state.openWindows) + 1,
              }
            : item,
        )
        return { openWindows }
      }

      const newZIndex = getMaxZIndex(state.openWindows) + 1
      const width = Math.max(options?.width ?? appConfig.defaultWidth, minWidth)
      const height = Math.max(options?.height ?? appConfig.defaultHeight, minHeight)
      const baseX = calculateCenteredX(width)
      const baseY = calculateCenteredY(height)
      const offsetStep = 26
      const offsetIndex = state.openWindows.length % 8
      const offset = offsetIndex * offsetStep
      const desktopAreaHeight = window.innerHeight - HEADER_HEIGHT
      const maxX = Math.max(0, window.innerWidth - width)
      const maxY = Math.max(0, desktopAreaHeight - height)
      const startX = Math.max(0, Math.min(maxX, baseX + offset))
      const startY = Math.max(0, Math.min(maxY, baseY + offset))

      return {
        openWindows: [
          ...state.openWindows,
          {
            id: instanceId,
            appId: id,
            component: appConfig.component,
            title,
            i18nTitleKey,
            icon,
            positionX: startX,
            positionY: startY,
            width,
            height,
            minWidth,
            minHeight,
            isMinimized: false,
            isMaximized: options?.isMaximized ?? false,
            zIndex: newZIndex,
            payload,
          },
        ],
      }
    })
  },
  closeWindow: (id) => {
    set((state) => ({
      openWindows: state.openWindows.filter((item) => item.id !== id),
    }))
  },
  minimizeWindow: (id) => {
    set((state) => ({
      openWindows: state.openWindows.map((item) =>
        item.id === id ? { ...item, isMinimized: true } : item,
      ),
    }))
  },
  focusWindow: (id) => {
    set((state) => ({
      openWindows: state.openWindows.map((item) =>
        item.id === id ? { ...item, zIndex: getMaxZIndex(state.openWindows) + 1 } : item,
      ),
    }))
  },
  updatePosition: (id, x, y) => {
    set((state) => ({
      openWindows: state.openWindows.map((item) =>
        item.id === id ? { ...item, positionX: x, positionY: y } : item,
      ),
    }))
  },
  updateSize: (id, width, height) => {
    set((state) => ({
      openWindows: state.openWindows.map((item) =>
        item.id === id ? { ...item, width, height } : item,
      ),
    }))
  },
  toggleMaximize: (id) => {
    set((state) => ({
      openWindows: state.openWindows.map((item) =>
        item.id === id ? { ...item, isMaximized: !item.isMaximized } : item,
      ),
    }))
  },
  hasDesktopShortcut: (id) => {
    return get().desktopShortcuts.some((item) => item.id === id)
  },
  addDesktopShortcut: (id) => {
    if (get().hasDesktopShortcut(id)) return
    set((state) => {
      const rows = getDesktopRows()
      const fallbackPoint = getGridPoint(
        Math.floor(state.desktopShortcuts.length / rows),
        state.desktopShortcuts.length % rows,
        DEFAULT_DESKTOP_SIDE,
      )
      const nextPoint = findAvailableDesktopPosition(fallbackPoint, state.desktopShortcuts, id)
      const desktopShortcuts = [...state.desktopShortcuts, { id, ...nextPoint }]
      persistDesktopShortcuts(desktopShortcuts)
      return { desktopShortcuts }
    })
  },
  removeDesktopShortcut: (id) => {
    set((state) => {
      const desktopShortcuts = state.desktopShortcuts.filter((item) => item.id !== id)
      persistDesktopShortcuts(desktopShortcuts)
      return { desktopShortcuts }
    })
  },
  moveDesktopShortcut: (id, rawX, rawY) => {
    set((state) => {
      const target = state.desktopShortcuts.find((item) => item.id === id)
      if (!target) return state
      const preferred = snapDesktopPosition(rawX, rawY)
      const nextPoint = findAvailableDesktopPosition(preferred, state.desktopShortcuts, id)
      const desktopShortcuts = state.desktopShortcuts.map((item) =>
        item.id === id ? { ...item, ...nextPoint } : item,
      )
      persistDesktopShortcuts(desktopShortcuts)
      return { desktopShortcuts }
    })
  },
  refreshWindowTitles: () => {
    set((state) => ({
      openWindows: state.openWindows.map((item) =>
        item.i18nTitleKey ? { ...item, title: i18next.t(item.i18nTitleKey) } : item,
      ),
    }))
  },
}))

export function selectMaxZIndex(state: WindowManagerStore) {
  return getMaxZIndex(state.openWindows)
}
