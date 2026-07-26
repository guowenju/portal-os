import { useEffect, useState } from 'react'

const MOBILE_VIEWPORT_QUERY = '(max-width: 760px)'

/**
 * @description 监听当前视口是否进入 PortalOS 移动端布局断点。
 * @returns 处于移动端断点时返回 true。
 */
export function useMobileViewport() {
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY)

    function syncViewportMode() {
      setIsMobileViewport(mediaQuery.matches)
    }

    syncViewportMode()
    mediaQuery.addEventListener('change', syncViewportMode)
    return () => mediaQuery.removeEventListener('change', syncViewportMode)
  }, [])

  return isMobileViewport
}
