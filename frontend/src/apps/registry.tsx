import { lazy, type ComponentType, type ReactNode } from 'react'
import PortalIcon from '@/components/PortalIcon'

/**
 * @description 应用目录/组件解析器，集中维护 app_id 与组件的映射关系。
 */
export interface AppConfig {
  component: ComponentType<AppViewProps>
  title: string
  i18nTitleKey: string
  icon: ReactNode
  defaultWidth: number
  defaultHeight: number
  minWidth: number
  minHeight: number
  hidden?: boolean
  progressStatus?: 'planned' | 'developing' | 'testing'
}

export interface AppViewProps {
  isMaximized: boolean
  payload?: Record<string, unknown>
}

export const appRegistry = {
  settings: {
    component: lazy(() => import('@/apps/pages/SettingsPage')),
    title: '设置',
    i18nTitleKey: 'app.settings.appName',
    icon: <PortalIcon name="settings" size={42} />,
    minWidth: 760,
    minHeight: 480,
    defaultWidth: 920,
    defaultHeight: 620,
  },
  blog: {
    component: lazy(() => import('@/apps/pages/BlogPage')),
    title: '岛屿手账',
    i18nTitleKey: 'app.blog.appName',
    icon: <PortalIcon name="blog" size={42} />,
    minWidth: 540,
    minHeight: 420,
    defaultWidth: 980,
    defaultHeight: 680,
  },
  admin: {
    component: lazy(() => import('@/apps/pages/AdminPage')),
    title: '岛务管理',
    i18nTitleKey: 'app.admin.appName',
    icon: <PortalIcon name="admin" size={42} />,
    minWidth: 720,
    minHeight: 520,
    defaultWidth: 1100,
    defaultHeight: 760,
    hidden: true,
  },
} satisfies Record<string, AppConfig>

export type AppId = keyof typeof appRegistry

export const availableApps: Record<AppId, AppConfig> = { ...appRegistry }
