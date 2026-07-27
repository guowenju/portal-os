import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Divider } from 'animal-island-ui'
import {
  applyWallpaper,
  resolveWallpaper,
  wallpaperOptions,
  WALLPAPER_STORAGE_KEY,
  type WallpaperId,
} from '@/utils/wallpapers'
import { useWeatherStore } from '@/stores/weather'
import './SettingsPage.css'

type LocaleCode = 'en' | 'zh'
type ThemeMode = 'light' | 'dark'
type PetId = 'golden-retriever-pup'

const THEME_STORAGE_KEY = 'portal_theme'
const PET_STORAGE_KEY = 'portal_pet'
const PET_ENABLED_STORAGE_KEY = 'portal_pet_enabled'
const PET_CHANGE_EVENT = 'portal-pet-change'
const PET_ENABLED_CHANGE_EVENT = 'portal-pet-enabled-change'
const DEFAULT_PET: PetId = 'golden-retriever-pup'

const petOptions: Array<{
  value: PetId
  labelKey: string
  descriptionKey: string
  spritesheet: string
}> = [
  {
    value: 'golden-retriever-pup',
    labelKey: 'app.settings.pet.goldenRetriever',
    descriptionKey: 'app.settings.pet.goldenRetrieverDescription',
    spritesheet: '/pets/golden-retriever-pup/spritesheet.webp',
  },
]

/**
 * @description 从根节点或本地存储读取当前主题。
 * @returns 当前有效主题。
 */
function getInitialTheme(): ThemeMode {
  const documentTheme = document.documentElement.dataset.theme
  if (documentTheme === 'light' || documentTheme === 'dark') {
    return documentTheme
  }

  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme
  }

  return 'light'
}

/**
 * @description 从本地存储读取当前桌面壁纸。
 * @returns 当前壁纸标识。
 */
function getInitialWallpaper(): WallpaperId {
  return resolveWallpaper(localStorage.getItem(WALLPAPER_STORAGE_KEY)).id
}

/**
 * @description 从本地存储读取当前桌面宠物。
 * @returns 当前宠物标识。
 */
function getInitialPet(): PetId {
  const savedPet = localStorage.getItem(PET_STORAGE_KEY)
  return isPetId(savedPet) ? savedPet : DEFAULT_PET
}

/**
 * @description 从本地存储读取桌面宠物启用状态。
 * @returns 是否显示桌面宠物。
 */
function getInitialPetEnabled() {
  return localStorage.getItem(PET_ENABLED_STORAGE_KEY) === 'true'
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const appVersion = import.meta.env.VITE_APP_VERSION || 'unknown'
  const [activeMenu, setActiveMenu] = useState('appearance')
  const [activeTheme, setActiveTheme] = useState<ThemeMode>(getInitialTheme)
  const [activeWallpaper, setActiveWallpaper] = useState(getInitialWallpaper)
  const [activePet, setActivePet] = useState<PetId>(getInitialPet)
  const [petEnabled, setPetEnabledState] = useState(getInitialPetEnabled)
  const [weatherKeyword, setWeatherKeyword] = useState('')
  const weather = useWeatherStore()
  const showManualWeatherConfig = Boolean(weather.errorMessage)

  const menuItems = useMemo(
    () => [
      {
        key: 'personalization',
        label: t('app.settings.menu.personalization'),
        children: [
          { key: 'appearance', label: t('app.settings.menu.appearance') },
          { key: 'wallpaper', label: t('app.settings.menu.wallpaper') },
          { key: 'pet', label: t('app.settings.menu.pet') },
          { key: 'weather', label: t('app.settings.menu.weather') },
          { key: 'language', label: t('app.settings.menu.language') },
        ],
      },
      {
        key: 'system',
        label: t('app.settings.menu.system'),
        children: [{ key: 'about', label: t('app.settings.menu.about') }],
      },
    ],
    [t],
  )

  const languageOptions = useMemo(
    () => [
      { value: 'zh' as const, label: t('app.settings.language.zh') },
      { value: 'en' as const, label: t('app.settings.language.en') },
    ],
    [t],
  )

  const themeOptions = useMemo(
    () => [
      { value: 'light' as const, label: t('app.settings.appearance.themeLight') },
      { value: 'dark' as const, label: t('app.settings.appearance.themeDark') },
    ],
    [t],
  )

  function setTheme(theme: ThemeMode) {
    setActiveTheme(theme)
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }

  function setWallpaper(wallpaperId: WallpaperId) {
    const wallpaper = resolveWallpaper(wallpaperId)
    setActiveWallpaper(wallpaper.id)
    applyWallpaper(wallpaper)
    localStorage.setItem(WALLPAPER_STORAGE_KEY, wallpaper.id)
  }

  function setPet(pet: PetId) {
    setActivePet(pet)
    localStorage.setItem(PET_STORAGE_KEY, pet)
    window.dispatchEvent(new CustomEvent(PET_CHANGE_EVENT, { detail: pet }))
  }

  function setPetEnabled(enabled: boolean) {
    setPetEnabledState(enabled)
    localStorage.setItem(PET_ENABLED_STORAGE_KEY, String(enabled))
    window.dispatchEvent(new CustomEvent(PET_ENABLED_CHANGE_EVENT, { detail: enabled }))
  }

  function setLocale(lang: LocaleCode) {
    void i18n.changeLanguage(lang)
  }

  function submitWeatherSearch() {
    void weather.setManualCity(weatherKeyword)
  }

  function formatLocationName(location: { name: string; admin1: string; country: string }) {
    return [location.name, location.admin1, location.country].filter(Boolean).join(' / ')
  }

  return (
    <div className="settings-layout">
      <aside className="settings-sidebar" aria-label={t('app.settings.menu.personalization')}>
        {menuItems.map((group) => (
          <nav key={group.key} className="settings-nav-group">
            <div className="menu-group-title">{group.label}</div>
            {group.children.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`settings-menu-item ${activeMenu === item.key ? 'is-active' : ''}`}
                onClick={() => setActiveMenu(item.key)}
              >
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        ))}
      </aside>

      <main className="settings-content-area">
        {activeMenu === 'appearance' && (
          <section className="content-section">
            <header className="section-header">
              <h2 className="content-title">{t('app.settings.appearance.label')}</h2>
              <p className="setting-description">{t('app.settings.appearance.description')}</p>
            </header>

            <Card className="setting-panel">
              <div className="setting-row">
                <div>
                  <h3 className="setting-title">{t('app.settings.appearance.themeLabel')}</h3>
                  <p className="setting-help">{t('app.settings.appearance.themeDescription')}</p>
                </div>
                <div className="segmented-control" role="radiogroup">
                  {themeOptions.map((option) => (
                    <Button
                      key={option.value}
                      type={activeTheme === option.value ? 'primary' : 'default'}
                      size="small"
                      role="radio"
                      aria-checked={activeTheme === option.value}
                      onClick={() => setTheme(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="appearance-preview">
                <div className="preview-window">
                  <div className="preview-titlebar">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="preview-body">
                    <strong>{t('app.settings.appearance.desktopShell')}</strong>
                    <p>{t('app.settings.appearance.desktopShellDescription')}</p>
                  </div>
                </div>
              </div>
            </Card>
          </section>
        )}

        {activeMenu === 'wallpaper' && (
          <section className="content-section">
            <header className="section-header">
              <h2 className="content-title">{t('app.settings.wallpaper.label')}</h2>
              <p className="setting-description">{t('app.settings.wallpaper.description')}</p>
            </header>

            <Card className="setting-panel">
              <div
                className="wallpaper-grid"
                role="radiogroup"
                aria-label={t('app.settings.wallpaper.label')}
              >
                {wallpaperOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`wallpaper-option ${
                      activeWallpaper === option.id ? 'is-selected' : ''
                    }`}
                    role="radio"
                    aria-checked={activeWallpaper === option.id}
                    onClick={() => setWallpaper(option.id)}
                  >
                    <span
                      className="wallpaper-preview"
                      style={{ backgroundImage: `url('${option.mobile}')` }}
                      aria-hidden="true"
                    />
                    <span className="wallpaper-name">{t(option.labelKey)}</span>
                  </button>
                ))}
              </div>
            </Card>
          </section>
        )}

        {activeMenu === 'language' && (
          <section className="content-section">
            <header className="section-header">
              <h2 className="content-title">{t('app.settings.language.label')}</h2>
              <p className="setting-description">{t('app.settings.language.description')}</p>
            </header>

            <Card className="setting-panel">
              <div className="setting-row">
                <div>
                  <h3 className="setting-title">{t('app.settings.language.displayLanguage')}</h3>
                  <p className="setting-help">
                    {t('app.settings.language.displayLanguageDescription')}
                  </p>
                </div>
                <div className="segmented-control" role="radiogroup">
                  {languageOptions.map((option) => (
                    <Button
                      key={option.value}
                      type={i18n.language === option.value ? 'primary' : 'default'}
                      size="small"
                      role="radio"
                      aria-checked={i18n.language === option.value}
                      onClick={() => setLocale(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            </Card>
          </section>
        )}

        {activeMenu === 'pet' && (
          <section className="content-section">
            <header className="section-header">
              <h2 className="content-title">{t('app.settings.pet.label')}</h2>
              <p className="setting-description">{t('app.settings.pet.description')}</p>
            </header>

            <Card className="setting-panel">
              <div className="setting-row">
                <div>
                  <h3 className="setting-title">{t('app.settings.pet.enablePet')}</h3>
                  <p className="setting-help">{t('app.settings.pet.enablePetDescription')}</p>
                </div>
                <label className="setting-switch">
                  <input
                    type="checkbox"
                    checked={petEnabled}
                    aria-label={t('app.settings.pet.enablePet')}
                    onChange={(event) => setPetEnabled(event.currentTarget.checked)}
                  />
                  <span aria-hidden="true" />
                </label>
              </div>

              <Divider className="setting-panel-divider" />

              <div className="pet-grid" role="radiogroup" aria-label={t('app.settings.pet.label')}>
                {petOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`pet-option ${activePet === option.value ? 'is-selected' : ''}`}
                    role="radio"
                    aria-checked={activePet === option.value}
                    onClick={() => setPet(option.value)}
                  >
                    <span
                      className="pet-preview"
                      style={{
                        backgroundImage: `url('${option.spritesheet}')`,
                      }}
                      aria-hidden="true"
                    />
                    <span className="pet-option-content">
                      <span className="pet-name">{t(option.labelKey)}</span>
                      <span className="pet-description">{t(option.descriptionKey)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          </section>
        )}

        {activeMenu === 'weather' && (
          <section className="content-section">
            <header className="section-header">
              <h2 className="content-title">{t('app.settings.weather.label')}</h2>
              <p className="setting-description">{t('app.settings.weather.description')}</p>
            </header>

            <Card className="setting-panel">
              <div className="setting-row">
                <div>
                  <h3 className="setting-title">{t('app.settings.weather.currentWeather')}</h3>
                  <p className="setting-help">
                    {weather.location
                      ? t('app.settings.weather.locationSummary', {
                          location: formatLocationName(weather.location),
                        })
                      : t('app.settings.weather.noLocation')}
                  </p>
                  {weather.forecast && (
                    <p className="setting-help">
                      {t('app.settings.weather.forecastSummary', {
                        temperature: Math.round(weather.forecast.temperature),
                        unit: weather.forecast.temperatureUnit,
                        condition:
                          weather.forecast.weatherText ||
                          t(`desktop.pet.weatherCondition.${weather.forecast.condition}`),
                      })}
                    </p>
                  )}
                  {weather.errorMessage && <p className="setting-error">{weather.errorMessage}</p>}
                </div>
                <div className="segmented-control">
                  <Button size="small" onClick={() => void weather.refreshWeather(true)}>
                    {weather.loading
                      ? t('app.settings.weather.loading')
                      : t('app.settings.weather.refresh')}
                  </Button>
                </div>
              </div>

              {showManualWeatherConfig && (
                <div className="weather-search-panel">
                  <h3 className="setting-title">{t('app.settings.weather.manualLocation')}</h3>
                  <form
                    className="weather-search-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      submitWeatherSearch()
                    }}
                  >
                    <input
                      className="weather-search-input"
                      value={weatherKeyword}
                      type="search"
                      placeholder={t('app.settings.weather.searchPlaceholder')}
                      onChange={(event) => setWeatherKeyword(event.target.value)}
                    />
                    <Button size="small" onClick={submitWeatherSearch}>
                      {weather.loading
                        ? t('app.settings.weather.loading')
                        : t('app.settings.weather.applyCity')}
                    </Button>
                  </form>
                  <p className="setting-help">{t('app.settings.weather.cityHelp')}</p>
                </div>
              )}
            </Card>
          </section>
        )}

        {activeMenu === 'about' && (
          <section className="content-section">
            <header className="section-header">
              <h2 className="content-title">{t('app.settings.about.label')}</h2>
              <p className="setting-description">{t('app.settings.about.description')}</p>
            </header>

            <Card className="setting-panel">
              <dl className="about-info-list">
                <div className="about-info-row">
                  <dt>{t('app.settings.about.version')}</dt>
                  <dd>{appVersion}</dd>
                </div>
              </dl>
              <Divider type="wave-yellow" />
            </Card>
          </section>
        )}
      </main>
    </div>
  )
}

function isPetId(value: unknown): value is PetId {
  return typeof value === 'string' && petOptions.some((option) => option.value === value)
}
