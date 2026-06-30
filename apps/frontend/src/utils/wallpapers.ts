export type WallpaperId = 'animal-friends' | 'animal-island' | 'animal-river' | 'animal-village'

export interface WallpaperOption {
  id: WallpaperId
  desktop: string
  mobile: string
  labelKey: string
}

export const WALLPAPER_STORAGE_KEY = 'app_wallpaper'
export const DEFAULT_WALLPAPER_ID: WallpaperId = 'animal-friends'

export const wallpaperOptions: WallpaperOption[] = [
  {
    id: 'animal-friends',
    desktop: '/images/wallpapers/animal-island-friends.svg',
    mobile: '/images/wallpapers/animal-island-friends-mobile.svg',
    labelKey: 'app.settings.wallpaper.animalFriends',
  },
  {
    id: 'animal-island',
    desktop: '/images/wallpapers/animal-island-desktop.svg',
    mobile: '/images/wallpapers/animal-island-desktop-mobile.svg',
    labelKey: 'app.settings.wallpaper.animalIsland',
  },
  {
    id: 'animal-river',
    desktop: '/images/wallpapers/animal-island-river.svg',
    mobile: '/images/wallpapers/animal-island-river-mobile.svg',
    labelKey: 'app.settings.wallpaper.animalRiver',
  },
  {
    id: 'animal-village',
    desktop: '/images/wallpapers/animal-island-village.svg',
    mobile: '/images/wallpapers/animal-island-village-mobile.svg',
    labelKey: 'app.settings.wallpaper.animalVillage',
  },
]

/**
 * @description 根据壁纸标识或旧版路径解析有效壁纸配置。
 * @param value 本地存储中的壁纸标识或旧版壁纸路径。
 * @returns 匹配到的壁纸配置。
 */
export function resolveWallpaper(value: string | null | undefined) {
  return (
    wallpaperOptions.find(
      (option) => option.id === value || option.desktop === value || option.mobile === value,
    ) ?? wallpaperOptions.find((option) => option.id === DEFAULT_WALLPAPER_ID)!
  )
}

/**
 * @description 把桌面端和移动端壁纸路径写入根节点 CSS 变量。
 * @param wallpaper 壁纸配置。
 */
export function applyWallpaper(wallpaper: WallpaperOption) {
  document.documentElement.style.setProperty(
    '--portal-desktop-wallpaper',
    `url('${wallpaper.desktop}')`,
  )
  document.documentElement.style.setProperty(
    '--portal-mobile-wallpaper',
    `url('${wallpaper.mobile}')`,
  )
}
