import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import { useTranslation } from 'react-i18next'
import AppContextMenu from '@/components/AppContextMenu'
import './DesktopPet.css'
import { useMobileViewport } from '@/hooks/use-mobile-viewport'
import { useWeatherStore, type WeatherCondition, type WeatherForecast } from '@/stores/weather'

interface DesktopPetProps {
  boundsRef: RefObject<HTMLElement | null>
}

interface PetPosition {
  x: number
  y: number
}

type PetAnimationState =
  | 'idle'
  | 'running-right'
  | 'running-left'
  | 'waving'
  | 'jumping'
  | 'failed'
  | 'waiting'
  | 'running'
  | 'review'

interface AnimationDefinition {
  row: number
  durations: number[]
  speed: number
}

interface AnimationPlayback {
  state: PetAnimationState
  frame: number
}

type PetId = 'golden-retriever-pup'
type WeatherBubbleMode = 'forecast' | 'status'

const PET_SPRITESHEET_COLUMNS = 8
const PET_SPRITESHEET_ROWS = 9
const DESKTOP_PET_SIZE = { width: 118, height: 128 }
const MOBILE_PET_SIZE = { width: 88, height: 95 }
const EDGE_PADDING = 12
const PET_STORAGE_KEY = 'portal_pet'
const PET_ENABLED_STORAGE_KEY = 'portal_pet_enabled'
const PET_CHANGE_EVENT = 'portal-pet-change'
const PET_ENABLED_CHANGE_EVENT = 'portal-pet-enabled-change'
const STROLL_INTERVAL = 4200
const TRANSIENT_ACTION_DURATION = 1800
const WEATHER_BUBBLE_DURATION = 6000
const CORNER_DISTANCE_THRESHOLD = 8
const AUTONOMOUS_ACTIONS: Array<'stroll' | 'waving' | 'running' | 'review'> = [
  'stroll',
  'stroll',
  'stroll',
  'waving',
  'running',
  'running',
  'review',
]

const animations: Record<PetAnimationState, AnimationDefinition> = {
  idle: { row: 0, durations: [280, 110, 110, 140, 140, 320], speed: 3.3 },
  'running-right': {
    row: 1,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
    speed: 2.8,
  },
  'running-left': {
    row: 2,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
    speed: 2.8,
  },
  waving: { row: 3, durations: [140, 140, 140, 280], speed: 2.9 },
  jumping: { row: 4, durations: [140, 140, 140, 140, 280], speed: 2.8 },
  // 预留给后续任务失败、错误反馈等桌面事件联动。
  failed: { row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240], speed: 3 },
  waiting: { row: 6, durations: [150, 150, 150, 150, 150, 260], speed: 3.4 },
  // 预留给后续跨区域追随、召回等需要通用奔跑表现的交互。
  running: { row: 7, durations: [120, 120, 120, 120, 120, 220], speed: 2.9 },
  // 预留给后续审查、检查、阅读等应用内状态提示。
  review: { row: 8, durations: [150, 150, 150, 150, 150, 280], speed: 3.2 },
}

const petSpritesheets: Record<PetId, { labelKey: string; path: string }> = {
  'golden-retriever-pup': {
    labelKey: 'desktop.pet.goldenRetriever',
    path: '/pets/golden-retriever-pup/spritesheet.webp',
  },
}

/**
 * @description 使用 hatch-pet 精灵图在桌面可视区域内播放和交互的桌面宠物。
 */
export default function DesktopPet({ boundsRef }: DesktopPetProps) {
  const { t } = useTranslation()
  const isMobileViewport = useMobileViewport()
  const petRef = useRef<HTMLDivElement | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const pointerStartRef = useRef({ x: 0, y: 0 })
  const hasDraggedPetRef = useRef(false)
  const transientTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const bubbleTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const returnToCornerTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const initialPositionedRef = useRef(false)
  const suppressNextClickRef = useRef(false)
  const [position, setPosition] = useState<PetPosition>(() => getBottomRightPosition(null))
  const [playback, setPlayback] = useState<AnimationPlayback>({ state: 'idle', frame: 0 })
  const [facingRight, setFacingRight] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [returningToCorner, setReturningToCorner] = useState(false)
  const [returningAnimationState, setReturningAnimationState] =
    useState<PetAnimationState>('running-left')
  const [moveDuration, setMoveDuration] = useState(700)
  const [activePetId, setActivePetId] = useState<PetId>(getInitialPetId)
  const [petEnabled, setPetEnabled] = useState(getInitialPetEnabled)
  const [weatherBubbleVisible, setWeatherBubbleVisible] = useState(false)
  const [bubbleForecast, setBubbleForecast] = useState<WeatherForecast | null>(null)
  const [weatherBubbleMode, setWeatherBubbleMode] = useState<WeatherBubbleMode>('forecast')
  const [boundsWidth, setBoundsWidth] = useState(() => window.innerWidth)
  const [petContextMenu, setPetContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
  })
  const forecast = useWeatherStore((state) => state.forecast)
  const location = useWeatherStore((state) => state.location)
  const weatherLoading = useWeatherStore((state) => state.loading)
  const weatherErrorMessage = useWeatherStore((state) => state.errorMessage)
  const refreshWeather = useWeatherStore((state) => state.refreshWeather)
  const weatherAnnouncement = useWeatherStore((state) => state.weatherAnnouncement)
  const consumeWeatherAnnouncement = useWeatherStore((state) => state.consumeWeatherAnnouncement)

  const animation = returningToCorner
    ? animations[returningAnimationState]
    : animations[playback.state]
  const activePet = petSpritesheets[activePetId]
  const petSize = isMobileViewport ? MOBILE_PET_SIZE : DESKTOP_PET_SIZE
  const floatingSideClass = shouldOpenPetFloatingLayerToLeft(position, boundsWidth, petSize)
    ? 'desktop-pet-anchor-left'
    : 'desktop-pet-anchor-right'
  const spriteStyle = useMemo(
    () =>
      ({
        '--pet-frame-x': `${playback.frame * -petSize.width}px`,
        '--pet-frame-y': `${animation.row * -petSize.height}px`,
        '--pet-sheet-width': `${petSize.width * PET_SPRITESHEET_COLUMNS}px`,
        '--pet-sheet-height': `${petSize.height * PET_SPRITESHEET_ROWS}px`,
        '--pet-width': `${petSize.width}px`,
        '--pet-height': `${petSize.height}px`,
        backgroundImage: `url('${activePet.path}')`,
      }) as CSSProperties,
    [activePet.path, animation.row, petSize.height, petSize.width, playback.frame],
  )
  const petStyle = useMemo(
    () =>
      ({
        '--pet-width': `${petSize.width}px`,
        '--pet-height': `${petSize.height}px`,
        '--pet-move-duration': `${dragging ? 0 : moveDuration}ms`,
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
      }) as CSSProperties,
    [dragging, moveDuration, petSize.height, petSize.width, position.x, position.y],
  )

  const setAnimationState = useCallback((nextState: PetAnimationState) => {
    setPlayback((currentPlayback) =>
      currentPlayback.state === nextState
        ? currentPlayback
        : {
            state: nextState,
            frame: 0,
          },
    )
  }, [])

  const setTransientState = useCallback(
    (nextState: PetAnimationState, delay: number) => {
      clearTransientTimer(transientTimerRef)
      transientTimerRef.current = window.setTimeout(() => {
        setAnimationState(nextState)
      }, delay)
    },
    [setAnimationState],
  )

  const cancelReturnToCornerMotion = useCallback(() => {
    clearTransientTimer(returnToCornerTimerRef)
    setReturningToCorner(false)
    setReturningAnimationState('running-left')
    setMoveDuration(700)
  }, [])

  const showWeatherBubble = useCallback(
    (nextForecast: WeatherForecast | null, mode: WeatherBubbleMode) => {
      clearTransientTimer(bubbleTimerRef)
      setBubbleForecast(nextForecast)
      setWeatherBubbleMode(mode)
      setWeatherBubbleVisible(true)
      bubbleTimerRef.current = window.setTimeout(() => {
        setWeatherBubbleVisible(false)
        setBubbleForecast(null)
        setWeatherBubbleMode('forecast')
      }, WEATHER_BUBBLE_DURATION)
    },
    [],
  )

  useEffect(() => {
    // 真机移动浏览器中，拖动透明精灵图时暂停换帧，减少合成层重绘残影。
    if (dragging) return

    const duration =
      (animation.durations[playback.frame] ?? animation.durations[0]) * animation.speed
    const frameTimer = window.setTimeout(() => {
      setPlayback((currentPlayback) => ({
        ...currentPlayback,
        frame: (currentPlayback.frame + 1) % animation.durations.length,
      }))
    }, duration)
    return () => window.clearTimeout(frameTimer)
  }, [animation.durations, animation.speed, dragging, playback.frame])

  useEffect(() => {
    const strollTimer = window.setInterval(() => {
      if (dragging || returningToCorner) return

      // 自主活动会轮播完整宠物动作集；业务场景接入前，预留状态先作为日常表现使用。
      const weatherAction =
        forecast && Math.random() < 0.35 ? getWeatherPetAction(forecast.condition) : null
      const nextAction =
        weatherAction ?? AUTONOMOUS_ACTIONS[Math.floor(Math.random() * AUTONOMOUS_ACTIONS.length)]
      if (nextAction !== 'stroll' && nextAction !== 'running') {
        setAnimationState(nextAction)
        setTransientState('idle', TRANSIENT_ACTION_DURATION)
        return
      }

      const travel =
        nextAction === 'running' ? { minX: 140, maxX: 230, y: 130 } : { minX: 70, maxX: 130, y: 96 }
      const direction = Math.random() > 0.5 ? 1 : -1
      const deltaX =
        direction * Math.round(travel.minX + Math.random() * (travel.maxX - travel.minX))
      const deltaY = Math.round(Math.random() * travel.y - travel.y * 0.4)
      const nextFacingRight = deltaX >= 0
      const moveDuration = getPetMoveDuration({ x: deltaX, y: deltaY })
      setFacingRight(nextFacingRight)
      setMoveDuration(moveDuration)
      setAnimationState(
        nextAction === 'running' ? 'running' : nextFacingRight ? 'running-right' : 'running-left',
      )
      setPosition((currentPosition) =>
        clampPosition(
          {
            x: currentPosition.x + deltaX,
            y: currentPosition.y + deltaY,
          },
          boundsRef.current,
          petSize,
        ),
      )
      setTransientState('idle', moveDuration + 400)
    }, STROLL_INTERVAL)

    return () => window.clearInterval(strollTimer)
  }, [
    boundsRef,
    dragging,
    forecast,
    petSize,
    returningToCorner,
    setTransientState,
    setAnimationState,
  ])

  useEffect(() => {
    if (initialPositionedRef.current) return
    const frame = window.requestAnimationFrame(() => {
      setPosition(getBottomRightPosition(boundsRef.current, petSize))
      initialPositionedRef.current = true
    })
    return () => window.cancelAnimationFrame(frame)
  }, [boundsRef, petSize])

  useEffect(() => {
    setPosition((currentPosition) => clampPosition(currentPosition, boundsRef.current, petSize))
  }, [boundsRef, petSize])

  useEffect(() => {
    function updateBoundsWidth() {
      setBoundsWidth(boundsRef.current?.clientWidth || window.innerWidth)
    }

    updateBoundsWidth()
    window.addEventListener('resize', updateBoundsWidth)
    return () => window.removeEventListener('resize', updateBoundsWidth)
  }, [boundsRef])

  useEffect(() => {
    return () => {
      clearTransientTimer(transientTimerRef)
      clearTransientTimer(bubbleTimerRef)
      clearTransientTimer(returnToCornerTimerRef)
    }
  }, [])

  useEffect(() => {
    if (!weatherAnnouncement) return
    const frame = window.setTimeout(() => {
      showWeatherBubble(weatherAnnouncement.forecast, 'forecast')
    }, 0)
    consumeWeatherAnnouncement(weatherAnnouncement.id)
    return () => window.clearTimeout(frame)
  }, [consumeWeatherAnnouncement, showWeatherBubble, weatherAnnouncement])

  useEffect(() => {
    function handlePetChange(event: Event) {
      const nextPetId = (event as CustomEvent<PetId>).detail
      if (!isPetId(nextPetId)) return
      setActivePetId(nextPetId)
      setAnimationState('idle')
    }

    function handlePetEnabledChange(event: Event) {
      const nextPetEnabled = (event as CustomEvent<boolean>).detail
      if (typeof nextPetEnabled !== 'boolean') return
      setPetEnabled(nextPetEnabled)
    }

    function handleStorageChange(event: StorageEvent) {
      if (event.key === PET_STORAGE_KEY && isPetId(event.newValue)) {
        setActivePetId(event.newValue)
        setAnimationState('idle')
      }
      if (event.key === PET_ENABLED_STORAGE_KEY) {
        setPetEnabled(event.newValue === 'true')
      }
    }

    window.addEventListener(PET_CHANGE_EVENT, handlePetChange)
    window.addEventListener(PET_ENABLED_CHANGE_EVENT, handlePetEnabledChange)
    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener(PET_CHANGE_EVENT, handlePetChange)
      window.removeEventListener(PET_ENABLED_CHANGE_EVENT, handlePetEnabledChange)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [setAnimationState])

  useEffect(() => {
    if (!dragging) return

    function handlePointerMove(event: globalThis.PointerEvent) {
      const distanceX = event.clientX - pointerStartRef.current.x
      const distanceY = event.clientY - pointerStartRef.current.y
      if (Math.hypot(distanceX, distanceY) > 6) {
        hasDraggedPetRef.current = true
      }
      setPosition(
        clampPosition(
          {
            x: event.clientX - dragOffsetRef.current.x,
            y: event.clientY - dragOffsetRef.current.y,
          },
          boundsRef.current,
          petSize,
        ),
      )
    }

    function handlePointerUp() {
      suppressNextClickRef.current = hasDraggedPetRef.current
      setDragging(false)
      if (hasDraggedPetRef.current) {
        setAnimationState('jumping')
        setTransientState('idle', TRANSIENT_ACTION_DURATION)
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [boundsRef, dragging, petSize, setTransientState, setAnimationState])

  function playWithPet() {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }
    if (dragging) return
    cancelReturnToCornerMotion()
    setAnimationState('jumping')
    setPosition((currentPosition) =>
      clampPosition(
        {
          x: currentPosition.x + (facingRight ? 28 : -28),
          y: currentPosition.y - 18,
        },
        boundsRef.current,
        petSize,
      ),
    )
    setTransientState('idle', TRANSIENT_ACTION_DURATION)
  }

  function closePetContextMenu() {
    setPetContextMenu((currentMenu) => ({ ...currentMenu, visible: false }))
  }

  function openPetContextMenu(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (dragging) return
    setPetContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
    })
  }

  async function reportWeatherFromContextMenu() {
    closePetContextMenu()
    if (dragging) return

    showWeatherBubble(null, 'status')
    await refreshWeather(true)
    const weatherState = useWeatherStore.getState()
    showWeatherBubble(
      weatherState.errorMessage || !weatherState.location ? null : weatherState.forecast,
      weatherState.errorMessage || !weatherState.location ? 'status' : 'forecast',
    )
  }

  function returnPetToCorner() {
    closePetContextMenu()
    if (dragging) return

    const nextPosition = getBottomRightPosition(boundsRef.current, petSize)
    const nextDelta = {
      x: nextPosition.x - position.x,
      y: nextPosition.y - position.y,
    }
    if (Math.hypot(nextDelta.x, nextDelta.y) < CORNER_DISTANCE_THRESHOLD) {
      cancelReturnToCornerMotion()
      clearTransientTimer(transientTimerRef)
      setPlayback({ state: 'idle', frame: 0 })
      setPosition(nextPosition)
      return
    }

    const nextMoveDuration = getPetMoveDuration(nextDelta)
    const nextFacingRight = nextPosition.x >= position.x
    const nextAnimationState = nextFacingRight ? 'running-right' : 'running-left'
    clearTransientTimer(returnToCornerTimerRef)
    clearTransientTimer(transientTimerRef)
    setReturningToCorner(true)
    setReturningAnimationState(nextAnimationState)
    setMoveDuration(nextMoveDuration)
    setFacingRight(nextFacingRight)
    setAnimationState(nextAnimationState)
    setPosition(nextPosition)
    returnToCornerTimerRef.current = window.setTimeout(() => {
      clearTransientTimer(returnToCornerTimerRef)
      setReturningToCorner(false)
      setMoveDuration(700)
      setPlayback({ state: 'idle', frame: 0 })
    }, nextMoveDuration + 400)
  }

  function getWeatherBubbleText() {
    if (weatherLoading) return t('desktop.pet.weatherLoading')
    if (weatherBubbleMode === 'status') {
      if (weatherErrorMessage) return t('desktop.pet.weatherUnavailable')
      if (!location) return t('desktop.pet.weatherUnset')
    }
    const activeForecast = bubbleForecast ?? forecast
    if (activeForecast && location) {
      const condition =
        activeForecast.weatherText || t(`desktop.pet.weatherCondition.${activeForecast.condition}`)
      const details = formatWeatherDetails(activeForecast, t)
      return t(`desktop.pet.weatherSpeech.${activeForecast.condition}`, {
        location: activeForecast.locationName || location.name,
        temperature: Math.round(activeForecast.temperature),
        unit: activeForecast.temperatureUnit,
        condition,
        details,
      })
    }
    if (weatherErrorMessage) return t('desktop.pet.weatherUnavailable')
    return t('desktop.pet.weatherUnset')
  }

  function startPetDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    const petRect = petRef.current?.getBoundingClientRect()
    if (!petRect) return
    closePetContextMenu()
    event.preventDefault()
    event.stopPropagation()
    dragOffsetRef.current = {
      x: event.clientX - petRect.left,
      y: event.clientY - petRect.top,
    }
    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    }
    hasDraggedPetRef.current = false
    setDragging(true)
    cancelReturnToCornerMotion()
    setAnimationState(facingRight ? 'running-right' : 'running-left')
    clearTransientTimer(transientTimerRef)
  }

  if (!petEnabled) return null

  return (
    <>
      <div
        ref={petRef}
        className={`desktop-pet ${floatingSideClass} ${dragging ? 'desktop-pet-dragging' : ''}`}
        style={petStyle}
        onClick={playWithPet}
        onPointerDown={startPetDrag}
        onContextMenu={openPetContextMenu}
        aria-label={t(activePet.labelKey)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            playWithPet()
          }
        }}
      >
        <span className="desktop-pet-sprite" style={spriteStyle} aria-hidden="true" />
        {weatherBubbleVisible && (
          <span className="desktop-pet-bubble">{getWeatherBubbleText()}</span>
        )}

        <AppContextMenu
          visible={petContextMenu.visible}
          x={petContextMenu.x}
          y={petContextMenu.y}
          onClose={closePetContextMenu}
          className="pet-context-menu"
          portal={false}
        >
          <button
            type="button"
            className="app-context-menu-btn"
            onClick={reportWeatherFromContextMenu}
          >
            {t('desktop.pet.contextMenu.reportWeather')}
          </button>
          <button type="button" className="app-context-menu-btn" onClick={returnPetToCorner}>
            {t('desktop.pet.contextMenu.returnToCorner')}
          </button>
        </AppContextMenu>
      </div>
    </>
  )
}

function getWeatherPetAction(condition: WeatherCondition): PetAnimationState | null {
  if (condition === 'clear') return Math.random() > 0.55 ? 'waving' : null
  if (condition === 'rain' || condition === 'snow') return Math.random() > 0.45 ? 'waiting' : null
  if (condition === 'thunderstorm') return Math.random() > 0.35 ? 'failed' : null
  if (condition === 'fog' || condition === 'cloudy') return Math.random() > 0.6 ? 'review' : null
  return null
}

function getPetMoveDuration(delta: PetPosition) {
  const distance = Math.hypot(delta.x, delta.y)
  return Math.round(Math.min(2200, Math.max(1000, distance * 8.5)))
}

function shouldOpenPetFloatingLayerToLeft(
  position: PetPosition,
  boundsWidth: number,
  petSize: typeof DESKTOP_PET_SIZE,
) {
  const floatingLayerWidth = Math.min(260, Math.max(180, boundsWidth - EDGE_PADDING * 2))
  return position.x + petSize.width + floatingLayerWidth + EDGE_PADDING > boundsWidth
}

function formatWeatherDetails(
  forecast: WeatherForecast,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const parts = [
    forecast.humidity === null
      ? ''
      : t('desktop.pet.weatherDetail.humidity', { humidity: forecast.humidity }),
    forecast.windDirection || forecast.windText
      ? t('desktop.pet.weatherDetail.wind', {
          wind: `${forecast.windDirection}${forecast.windText}`,
        })
      : '',
  ].filter(Boolean)
  return parts.length > 0
    ? t('desktop.pet.weatherDetail.suffix', { details: parts.join('，') })
    : ''
}

function isPetId(value: unknown): value is PetId {
  return typeof value === 'string' && value in petSpritesheets
}

function getInitialPetId(): PetId {
  const savedPet = localStorage.getItem(PET_STORAGE_KEY)
  return isPetId(savedPet) ? savedPet : 'golden-retriever-pup'
}

/**
 * @description 从本地存储读取桌面宠物启用状态。
 * @returns 是否显示桌面宠物。
 */
function getInitialPetEnabled() {
  return localStorage.getItem(PET_ENABLED_STORAGE_KEY) === 'true'
}

function clampPosition(
  position: PetPosition,
  bounds: HTMLElement | null,
  petSize = DESKTOP_PET_SIZE,
): PetPosition {
  const width = bounds?.clientWidth || window.innerWidth
  const height = bounds?.clientHeight || Math.max(240, window.innerHeight - 40)
  return {
    x: Math.min(
      Math.max(EDGE_PADDING, position.x),
      Math.max(EDGE_PADDING, width - petSize.width - EDGE_PADDING),
    ),
    y: Math.min(
      Math.max(EDGE_PADDING, position.y),
      Math.max(EDGE_PADDING, height - petSize.height - EDGE_PADDING),
    ),
  }
}

function getBottomRightPosition(
  bounds: HTMLElement | null,
  petSize = DESKTOP_PET_SIZE,
): PetPosition {
  const width = bounds?.clientWidth || window.innerWidth
  const height = bounds?.clientHeight || Math.max(240, window.innerHeight - 40)
  return clampPosition(
    {
      x: width - petSize.width - EDGE_PADDING,
      y: height - petSize.height - EDGE_PADDING,
    },
    bounds,
    petSize,
  )
}

function clearTransientTimer(timerRef: RefObject<ReturnType<typeof window.setTimeout> | null>) {
  if (!timerRef.current) return
  window.clearTimeout(timerRef.current)
  timerRef.current = null
}
