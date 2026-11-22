'use client'

import type { ReactNode } from 'react'

export type IconName =
  | 'home'
  | 'trophy'
  | 'user'
  | 'users'
  | 'plus'
  | 'bolt'
  | 'flame'
  | 'heart'
  | 'comment'
  | 'bag'
  | 'lock'
  | 'search'
  | 'globe'
  | 'check'
  | 'weight'
  | 'cardio'
  | 'sport'

export function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10M9 20v-6h6v6" />
      </>
    ),
    trophy: (
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Zm-3 1h3v5H7a2 2 0 0 1-2-2V5Zm11 0h3v3a2 2 0 0 1-2 2h-1M12 13v5m-4 2h8" />
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    bolt: <path d="m13 2-8 11h6l-1 9 8-12h-6l1-8Z" />,
    flame: (
      <path d="M12 22c4.1 0 7-2.9 7-7.2 0-3.4-2-6.4-5.8-9.8.2 3-1.5 4.2-2.5 2C9.3 8.8 5 11.2 5 15.3 5 19.2 7.9 22 12 22Z" />
    ),
    heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
    ),
    comment: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />,
    bag: (
      <>
        <path d="M5 8h14l-1 13H6L5 8Z" />
        <path d="M9 9V6a3 3 0 0 1 6 0v3" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    weight: (
      <>
        <path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12" />
        <path d="M8 10v4M16 10v4" />
      </>
    ),
    cardio: (
      <>
        <path d="M4 8.5h3c2.8 2.7 5.4 4 8.5 4.7l4.5-.1c1.4.1 2.5 1.3 2.5 2.7v.7A1.5 1.5 0 0 1 21 18H5.5A1.5 1.5 0 0 1 4 16.5v-8Z" />
        <path d="M4 15.5h17.8M11.1 10.5l2-1.7M12.8 12l2-1.7" />
      </>
    ),
    sport: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m12 7 4 3-2 5H9l-2-5 5-3ZM12 7V3M16 10l4-1M14 15l2 4M9 15l-1.5 4.5M7 10 4 8" />
      </>
    ),
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
