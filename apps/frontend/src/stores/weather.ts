import i18next from 'i18next'
import { create } from 'zustand'
import http from '@/api'

export type WeatherCondition =
  | 'clear'
  | 'cloudy'
  | 'fog'
  | 'rain'
  | 'snow'
  | 'thunderstorm'
  | 'unknown'

export interface WeatherForecast {
  latitude: number | null
  longitude: number | null
  provider: 'uapis'
  locationName: string
  admin1: string
  adcode: string
  temperature: number
  temperatureUnit: string
  weatherCode: number
  condition: WeatherCondition
  weatherText: string
  precipitation: number
  precipitationUnit: string
  windSpeed: number
  windText: string
  windSpeedUnit: string
  windDirection: string
  humidity: number | null
  observedAt: string
  timezone: string
}

export interface WeatherLocation {
  name: string
  country: string
  admin1: string
  timezone: string
  source: 'auto' | 'manual'
}

export interface WeatherAnnouncement {
  id: number
  forecast: WeatherForecast
}

interface WeatherStore {
  forecast: WeatherForecast | null
  location: WeatherLocation | null
  loading: boolean
  initialized: boolean
  errorMessage: string
  weatherAnnouncement: WeatherAnnouncement | null
  initializeWeather: () => Promise<void>
  refreshWeather: (force?: boolean) => Promise<void>
  setManualCity: (city: string) => Promise<void>
  consumeWeatherAnnouncement: (id: number) => void
  clearWeatherError: () => void
}

const WEATHER_LOCATION_STORAGE_KEY = 'portal_weather_location'
const WEATHER_REFRESH_INTERVAL = 30 * 60 * 1000

let lastForecastLoadedAt = 0
let lastWeatherSignature = ''
let nextAnnouncementId = 1

export const useWeatherStore = create<WeatherStore>((set, get) => ({
  forecast: null,
  location: loadSavedLocation(),
  loading: false,
  initialized: false,
  errorMessage: '',
  weatherAnnouncement: null,
  initializeWeather: async () => {
    if (get().initialized) return
    set({ initialized: true })

    const savedLocation = loadSavedLocation()
    if (savedLocation) {
      set({ location: savedLocation })
      await get().refreshWeather()
      return
    }
    await get().refreshWeather()
  },
  refreshWeather: async (force = false) => {
    const location = get().location
    if (!force && Date.now() - lastForecastLoadedAt < WEATHER_REFRESH_INTERVAL && get().forecast) {
      return
    }

    set({ loading: true, errorMessage: '' })
    try {
      const forecast = await fetchWeatherForecast(
        location?.source === 'manual' ? location.name : undefined,
      )
      set({
        location:
          location?.source === 'manual'
            ? createLocationFromForecast(location.name, forecast, 'manual')
            : createLocationFromForecast(forecast.locationName, forecast, 'auto'),
        ...createForecastState(forecast, get().weatherAnnouncement),
      })
    } catch (error) {
      set({
        loading: false,
        errorMessage:
          error instanceof Error ? error.message : i18next.t('app.settings.weather.errorForecast'),
      })
    }
  },
  setManualCity: async (city) => {
    const trimmedCity = city.trim()
    if (!trimmedCity) {
      set({ errorMessage: i18next.t('app.settings.weather.errorCityRequired') })
      return
    }

    set({ loading: true, errorMessage: '' })
    try {
      const forecast = await fetchWeatherForecast(trimmedCity)
      const savedLocation = createLocationFromForecast(trimmedCity, forecast, 'manual')
      saveLocation(savedLocation)
      set({
        location: savedLocation,
        ...createForecastState(forecast, get().weatherAnnouncement),
      })
    } catch (error) {
      set({
        loading: false,
        errorMessage:
          error instanceof Error ? error.message : i18next.t('app.settings.weather.errorForecast'),
      })
    }
  },
  consumeWeatherAnnouncement: (id) => {
    set((state) => ({
      weatherAnnouncement: state.weatherAnnouncement?.id === id ? null : state.weatherAnnouncement,
    }))
  },
  clearWeatherError: () => set({ errorMessage: '' }),
}))

/**
 * @description 从本地存储读取手动天气位置。
 */
function loadSavedLocation(): WeatherLocation | null {
  try {
    const raw = localStorage.getItem(WEATHER_LOCATION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WeatherLocation>
    if (typeof parsed.name !== 'string') return null
    return {
      name: parsed.name,
      country: typeof parsed.country === 'string' ? parsed.country : '',
      admin1: typeof parsed.admin1 === 'string' ? parsed.admin1 : '',
      timezone: typeof parsed.timezone === 'string' ? parsed.timezone : '',
      source: 'manual',
    }
  } catch {
    return null
  }
}

/**
 * @description 保存手动选择的天气位置。
 */
function saveLocation(location: WeatherLocation) {
  localStorage.setItem(WEATHER_LOCATION_STORAGE_KEY, JSON.stringify(location))
}

/**
 * @description 请求 uapis 天气预报；未传城市时由后端触发自动定位。
 */
async function fetchWeatherForecast(city?: string) {
  const response = await http.get<WeatherForecast>('/weather/forecast', city ? { city } : undefined)
  if (!response.success || !response.data) {
    throw new Error(response.message || i18next.t('app.settings.weather.errorForecast'))
  }
  return response.data
}

/**
 * @description 根据成功返回的预报结果创建可持久化的位置。
 */
function createLocationFromForecast(
  city: string,
  forecast: WeatherForecast,
  source: WeatherLocation['source'],
): WeatherLocation {
  return {
    name: forecast.locationName || city,
    country: '',
    admin1: forecast.admin1,
    timezone: forecast.timezone,
    source,
  }
}

/**
 * @description 根据最新预报构建 store 更新内容，并在天气变化时生成播报。
 */
function createForecastState(
  forecast: WeatherForecast,
  currentAnnouncement: WeatherAnnouncement | null,
) {
  lastForecastLoadedAt = Date.now()
  const nextSignature = buildWeatherSignature(forecast)
  const shouldAnnounce = nextSignature !== lastWeatherSignature
  lastWeatherSignature = nextSignature

  return {
    forecast,
    loading: false,
    errorMessage: '',
    weatherAnnouncement: shouldAnnounce
      ? {
          id: nextAnnouncementId++,
          forecast,
        }
      : currentAnnouncement,
  }
}

/**
 * @description 构造用于判断天气是否发生变化的签名。
 */
function buildWeatherSignature(forecast: WeatherForecast) {
  return [
    forecast.provider,
    forecast.locationName,
    forecast.admin1,
    forecast.adcode,
    forecast.weatherText || forecast.condition,
    Math.round(forecast.temperature),
    forecast.humidity ?? '',
    forecast.observedAt,
  ].join('|')
}
