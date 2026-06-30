import type { SVGProps } from 'react'

export type PortalIconName =
  | 'desktop-home'
  | 'app-library'
  | 'window-close'
  | 'window-minimize'
  | 'window-maximize'
  | 'add-to-desktop'
  | 'app-details'
  | 'settings'
  | 'docs'

interface PortalIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: PortalIconName
  size?: number
}

const colors = {
  bark: '#4c3c33',
  barkSoft: '#725d42',
  parchment: '#f7f3df',
  cream: '#fff9e3',
  mint: '#19c8b9',
  mintDark: '#11a89b',
  grass: '#6fba2c',
  grassDark: '#409b5e',
  sky: '#b7c6e5',
  yellow: '#f7cd67',
  peach: '#e18c6f',
  pink: '#f8a6b2',
  blue: '#889df0',
}

/**
 * @description PortalOS 桌面外壳专用动物岛风格 SVG 图标。
 */
export default function PortalIcon({
  name,
  size = 22,
  className,
  'aria-hidden': ariaHidden = true,
  ...props
}: PortalIconProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`portal-icon ${className ?? ''}`.trim()}
      role={ariaHidden ? undefined : 'img'}
      aria-hidden={ariaHidden}
      focusable="false"
      {...props}
    >
      {renderIcon(name)}
    </svg>
  )
}

function renderIcon(name: PortalIconName) {
  switch (name) {
    case 'desktop-home':
      return <DesktopHomeIcon />
    case 'app-library':
      return <AppLibraryIcon />
    case 'window-close':
      return <WindowCloseIcon />
    case 'window-minimize':
      return <WindowMinimizeIcon />
    case 'window-maximize':
      return <WindowMaximizeIcon />
    case 'add-to-desktop':
      return <AddToDesktopIcon />
    case 'app-details':
      return <AppDetailsIcon />
    case 'settings':
      return <SettingsIcon />
    case 'docs':
      return <DocsIcon />
  }
}

function DesktopHomeIcon() {
  return (
    <>
      <path
        d="M9 39c0-9 9-17 22-17s24 8 24 17c0 8-10 14-23 14S9 47 9 39Z"
        fill={colors.grass}
        stroke={colors.bark}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M16 40c7 5 25 6 33 0"
        fill="none"
        stroke={colors.grassDark}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.48"
      />
      <path
        d="M23 30 32 21l9 9v15H23V30Z"
        fill={colors.parchment}
        stroke={colors.bark}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M28 45V35h8v10"
        fill={colors.yellow}
        stroke={colors.barkSoft}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M18 25c2-8 10-13 18-10 4 1 7 4 9 8"
        fill="none"
        stroke={colors.mint}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="m16 25 5-7 4 8"
        fill={colors.mint}
        stroke={colors.bark}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </>
  )
}

function AppLibraryIcon() {
  return (
    <>
      <rect
        x="12"
        y="9"
        width="40"
        height="48"
        rx="15"
        fill={colors.parchment}
        stroke={colors.bark}
        strokeWidth="4"
      />
      <path d="M19 18h26" stroke={colors.sky} strokeWidth="4" strokeLinecap="round" />
      <rect x="19" y="25" width="10" height="10" rx="4" fill={colors.mint} />
      <rect x="35" y="25" width="10" height="10" rx="4" fill={colors.yellow} />
      <rect x="19" y="41" width="10" height="10" rx="4" fill={colors.pink} />
      <rect x="35" y="41" width="10" height="10" rx="4" fill={colors.blue} />
      <path
        d="M44 13c5 0 8 4 6 9-5 0-8-4-6-9Z"
        fill={colors.grass}
        stroke={colors.bark}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </>
  )
}

function WindowCloseIcon() {
  return (
    <>
      <circle cx="32" cy="32" r="22" fill={colors.peach} stroke={colors.bark} strokeWidth="4" />
      <path
        d="m24 24 16 16M40 24 24 40"
        stroke={colors.cream}
        strokeWidth="6"
        strokeLinecap="round"
      />
    </>
  )
}

function WindowMinimizeIcon() {
  return (
    <>
      <circle cx="32" cy="32" r="22" fill={colors.yellow} stroke={colors.bark} strokeWidth="4" />
      <path d="M21 35h22" stroke={colors.barkSoft} strokeWidth="6" strokeLinecap="round" />
      <path
        d="M39 21c5-1 8 2 8 7-5 1-8-2-8-7Z"
        fill={colors.grass}
        stroke={colors.bark}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </>
  )
}

function WindowMaximizeIcon() {
  return (
    <>
      <circle cx="32" cy="32" r="22" fill={colors.mint} stroke={colors.bark} strokeWidth="4" />
      <rect
        x="21"
        y="21"
        width="22"
        height="22"
        rx="6"
        fill={colors.cream}
        stroke={colors.barkSoft}
        strokeWidth="4"
      />
      <path d="M27 29h10v8" stroke={colors.mintDark} strokeWidth="4" strokeLinecap="round" />
    </>
  )
}

function AddToDesktopIcon() {
  return (
    <>
      <rect
        x="10"
        y="15"
        width="44"
        height="32"
        rx="9"
        fill={colors.parchment}
        stroke={colors.bark}
        strokeWidth="4"
      />
      <path d="M19 24h14" stroke={colors.sky} strokeWidth="4" strokeLinecap="round" />
      <path
        d="M32 39v-9M27.5 34.5h9"
        stroke={colors.grassDark}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path d="M22 53h20" stroke={colors.barkSoft} strokeWidth="5" strokeLinecap="round" />
    </>
  )
}

function AppDetailsIcon() {
  return (
    <>
      <path
        d="M14 15c0-4 3-7 7-7h22c4 0 7 3 7 7v34c0 4-3 7-7 7H21c-4 0-7-3-7-7V15Z"
        fill={colors.parchment}
        stroke={colors.bark}
        strokeWidth="4"
      />
      <circle cx="24" cy="23" r="5" fill={colors.mint} />
      <path
        d="M34 22h9M34 32h9M22 42h21"
        stroke={colors.barkSoft}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M45 10c5 0 8 4 6 9-5 0-8-4-6-9Z"
        fill={colors.grass}
        stroke={colors.bark}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </>
  )
}

function SettingsIcon() {
  return (
    <>
      <path
        d="M31 8h2l3 7 7-2 7 7-2 7 7 3v4l-7 3 2 7-7 7-7-2-3 7h-2l-3-7-7 2-7-7 2-7-7-3v-4l7-3-2-7 7-7 7 2 3-7Z"
        fill={colors.parchment}
        stroke={colors.bark}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="32" r="13" fill={colors.mint} stroke={colors.barkSoft} strokeWidth="4" />
      <circle cx="32" cy="32" r="5" fill={colors.cream} />
      <path
        d="M45 11c5 0 8 4 6 9-5 0-8-4-6-9Z"
        fill={colors.grass}
        stroke={colors.bark}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M17 45c5 2 10 2 15 0" stroke={colors.yellow} strokeWidth="4" strokeLinecap="round" />
    </>
  )
}

function DocsIcon() {
  return (
    <>
      <path
        d="M16 13c0-4 3-7 7-7h20c4 0 7 3 7 7v38c0 4-3 7-7 7H23c-4 0-7-3-7-7V13Z"
        fill={colors.parchment}
        stroke={colors.bark}
        strokeWidth="4"
      />
      <path
        d="M25 19h16M25 29h18M25 39h13"
        stroke={colors.barkSoft}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M42 44c4-1 8 1 10 5-5 3-10 1-12-3Z"
        fill={colors.grass}
        stroke={colors.bark}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M17 14c-4 5-4 13 0 18"
        fill="none"
        stroke={colors.mint}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="25" cy="49" r="3" fill={colors.yellow} />
    </>
  )
}
