import { useNotificationStore } from '@/stores/notification'

/**
 * @description 显示全局消息通知队列。
 */
export default function ToastNotification() {
  const activeNotifications = useNotificationStore((state) => state.activeNotifications)
  const removeNotification = useNotificationStore((state) => state.removeNotification)

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {activeNotifications.map((notification) => (
        <button
          key={notification.id}
          type="button"
          className={`toast-card toast-${notification.type}`}
          onClick={() => removeNotification(notification.id)}
        >
          {notification.message}
        </button>
      ))}
    </div>
  )
}
