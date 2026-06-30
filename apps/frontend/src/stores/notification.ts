import { create } from 'zustand'

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

export interface Notification {
  id: number
  type: NotificationType
  message: string
  timestamp: number
  duration: number
}

interface NotificationStore {
  activeNotifications: Notification[]
  nextId: number
  addNotification: (type: NotificationType, message: string, duration?: number) => void
  removeNotification: (id: number) => void
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
  warning: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
  showToast: (type: NotificationType, message: string, duration?: number) => void
}

const DEFAULT_DURATION = 4000

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  activeNotifications: [],
  nextId: 1,
  addNotification: (type, message, duration = DEFAULT_DURATION) => {
    const id = get().nextId
    const notification: Notification = {
      id,
      type,
      message,
      timestamp: Date.now(),
      duration,
    }
    set((state) => ({
      nextId: state.nextId + 1,
      activeNotifications: [...state.activeNotifications, notification],
    }))
    window.setTimeout(() => get().removeNotification(id), duration)
  },
  removeNotification: (id) => {
    set((state) => ({
      activeNotifications: state.activeNotifications.filter(
        (notification) => notification.id !== id,
      ),
    }))
  },
  success: (message, duration) => get().addNotification('success', message, duration),
  error: (message, duration) => get().addNotification('error', message, duration),
  warning: (message, duration) => get().addNotification('warning', message, duration),
  info: (message, duration) => get().addNotification('info', message, duration),
  showToast: (type, message, duration) => get().addNotification(type, message, duration),
}))
