import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import zh from './locales/zh'
import { useWindowManagerStore } from './stores/window-manager'

const LOCALE_STORAGE_KEY = 'app_locale'

/**
 * @description 获取初始界面语言。
 * @returns 初始语言代码。
 */
function getInitialLocale(): 'zh' | 'en' {
  const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY)
  if (savedLocale === 'zh' || savedLocale === 'en') {
    localStorage.setItem(LOCALE_STORAGE_KEY, savedLocale)
    return savedLocale
  }
  const browserLang = navigator.language
  const defaultLocale = browserLang.startsWith('zh') ? 'zh' : 'en'
  localStorage.setItem(LOCALE_STORAGE_KEY, defaultLocale)
  return defaultLocale
}

void i18next.use(initReactI18next).init({
  lng: getInitialLocale(),
  fallbackLng: 'en',
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  interpolation: {
    escapeValue: false,
    prefix: '{',
    suffix: '}',
  },
})

i18next.on('languageChanged', (language) => {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  localStorage.setItem(LOCALE_STORAGE_KEY, language)
  useWindowManagerStore.getState().refreshWindowTitles()
})

document.documentElement.lang = i18next.language === 'zh' ? 'zh-CN' : 'en'

export default i18next
