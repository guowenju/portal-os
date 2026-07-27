import { Suspense } from 'react'
import { Route, BrowserRouter, Routes, useParams } from 'react-router-dom'
import ConfirmationModal from './components/common/ConfirmationModal'
import ToastNotification from './components/common/ToastNotification'
import DesktopLayout from './components/layout/DesktopLayout'
import DesktopPage from './pages/DesktopPage'
import { applyWallpaper, resolveWallpaper, WALLPAPER_STORAGE_KEY } from './utils/wallpapers'
import './styles/global.css'
import './styles/markdown.css'

/**
 * @description 启动时恢复用户选择的桌面壁纸。
 */
function restoreWallpaper() {
  const wallpaper = resolveWallpaper(localStorage.getItem(WALLPAPER_STORAGE_KEY))
  applyWallpaper(wallpaper)
  localStorage.setItem(WALLPAPER_STORAGE_KEY, wallpaper.id)
}

/**
 * @description 启动时恢复用户选择的界面主题。
 */
function restoreTheme() {
  const savedTheme = localStorage.getItem('portal_theme')
  document.documentElement.dataset.theme =
    savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'light'
}

restoreTheme()
restoreWallpaper()

/** 根据公开博客路由打开最大化手账窗口。 */
function BlogDesktopRoute() {
  const { slug } = useParams()
  return (
    <DesktopPage initialApp="blog" initialPayload={slug ? { slug } : undefined} initialMaximized />
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="app-loading">加载中...</div>}>
        <Routes>
          <Route path="/" element={<DesktopLayout />}>
            <Route index element={<DesktopPage />} />
            <Route path="blog" element={<BlogDesktopRoute />} />
            <Route path="blog/:slug" element={<BlogDesktopRoute />} />
            <Route path="admin" element={<DesktopPage initialApp="admin" />} />
          </Route>
        </Routes>
      </Suspense>
      <ToastNotification />
      <ConfirmationModal />
    </BrowserRouter>
  )
}
