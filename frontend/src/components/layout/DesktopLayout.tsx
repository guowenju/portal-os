import { Outlet } from 'react-router-dom'
import DesktopHeader from './DesktopHeader'

/**
 * @description 平台桌面布局，包含持久头部和桌面工作区。
 */
export default function DesktopLayout() {
  return (
    <div className="app-desktop-layout">
      <DesktopHeader />
      <main className="app-desktop-area">
        <Outlet />
      </main>
    </div>
  )
}
