'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { flexiAPI, FlexiAPIError, type Train, type createFlexiAPI } from '@/lib/flexi-api'
import {
  calendarInput,
  dateKey,
  workoutInput,
  type CalendarInput,
  type OnboardingInput,
  type Progress,
} from '@/backend/domain'
import type { UserProfile, WorkoutLog, CalendarEvent } from '@/backend/data'
import { eventOnDay, googleCalendarURL, localDateTime, zonedInstant } from '@/lib/frontend-data'
import { useFlexi, useCalendar, messageFor } from './use-flexi'
import AuthPanel from './AuthPanel'
import { Icon } from './Icon'
import { useDialog } from './use-dialog'
import {
  isCardioActivity,
  WorkoutModal,
  WorkoutTypeModal,
  workoutInputFromForm,
  type WorkoutType,
} from './WorkoutLogging'
import ShopTab from './ShopTab'
import { AvatarArt, FittedAvatar, type ShopItem, type Equipped } from './FlexiVisuals'

const avatars = [
  { name: 'Pip', animal: 'Bunny', key: 'bunny', trait: 'Quick starter' },
  { name: 'Bao', animal: 'Panda', key: 'panda', trait: 'Power builder' },
  { name: 'Moss', animal: 'Turtle', key: 'turtle', trait: 'Steady mover' },
  { name: 'Scout', animal: 'Deer', key: 'deer', trait: 'Agile achiever' },
] as const

export type LeaderboardPlayer = {
  id: string
  name: string
  handle: string
  points: number
  workouts: number
  streak: number
  avatar: 'bunny' | 'panda' | 'turtle' | 'deer'
}

export default function FlexiApp({ players }: { players: LeaderboardPlayer[] }) {
  const [userId, setUserId] = useState<string | null | undefined>(undefined)
  const [recovery, setRecovery] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true,
      observed = false
    let previous: string | null = null
    try {
      const { data: subscription } = flexiAPI.onAuthStateChange(async (event, session) => {
        if (!active) return
        observed = true
        const next = session?.user.id ?? null
        if (previous && previous !== next) clearDrafts(previous)
        previous = next
        setUserId(next)
        if (event === 'PASSWORD_RECOVERY') setRecovery(true)
        if (!next) setRecovery(false)
      })
      void flexiAPI
        .session()
        .then(({ data, error }) => {
          if (!active || observed) return
          if (error) setError(messageFor(error))
          previous = data.session?.user.id ?? null
          setUserId(previous)
        })
        .catch((error) => {
          if (active) setError(messageFor(error))
        })
      return () => {
        active = false
        subscription.subscription.unsubscribe()
      }
    } catch (error) {
      setError(messageFor(error))
    }
    return () => {
      active = false
    }
  }, [])
  if (error)
    return (
      <main className="app-shell">
        <Brand />
        <section className="page-panel">
          <h1>Unable to open Flexi</h1>
          <p role="alert">{error}</p>
          <button className="primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </section>
      </main>
    )
  if (userId === undefined) return <LoadingScreen />
  if (!userId || recovery)
    return <AuthPanel recovery={recovery} onRecovered={() => setRecovery(false)} />
  return <SignedInApp key={userId} userId={userId} players={players} />
}

function LoadingScreen() {
  return (
    <main className="app-shell">
      <Brand />
      <section className="page-panel loading-panel" role="status">
        <img src="/avatars/bunny-starter.png" alt="" />
        <h1>Warming up…</h1>
        <p>Getting your training space ready.</p>
      </section>
    </main>
  )
}
function clearDrafts(userId: string) {
  try {
    for (const kind of ['workout', 'calendar']) sessionStorage.removeItem(`flexi:${userId}:${kind}`)
  } catch {
    /* Storage may be unavailable. */
  }
}
function storeDraft(userId: string, kind: string, value: unknown) {
  try {
    const key = `flexi:${userId}:${kind}`
    if (value) sessionStorage.setItem(key, JSON.stringify(value))
    else sessionStorage.removeItem(key)
  } catch {
    /* The mounted form still retains its retry identity. */
  }
}
function readDraft<T>(userId: string, kind: string, validate: (value: unknown) => T): T | null {
  try {
    const value = sessionStorage.getItem(`flexi:${userId}:${kind}`)
    return value ? validate(JSON.parse(value)) : null
  } catch {
    return null
  }
}

function SignedInApp({ userId, players }: { userId: string; players: LeaderboardPlayer[] }) {
  const { api, snapshot, error, loading, busy, refresh, run } = useFlexi(userId)
  const [tab, setTab] = useState<'home' | 'social' | 'profile' | 'shop'>('home')
  const [workoutOpen, setWorkoutOpen] = useState(false)
  const [workoutTypeOpen, setWorkoutTypeOpen] = useState(false)
  const [workoutType, setWorkoutType] = useState<WorkoutType>('weight')
  const [workoutZone, setWorkoutZone] = useState('UTC')
  const [workoutDraft, setWorkoutDraft] = useState(() => readDraft(userId, 'workout', workoutInput))
  const [calendarDraft, setCalendarDraft] = useState(() =>
    readDraft(userId, 'calendar', calendarInput),
  )
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [scheduleError, setScheduleError] = useState('')
  const [notice, setNotice] = useState('')
  const [shopMessage, setShopMessage] = useState('')
  const [editingOnboarding, setEditingOnboarding] = useState(false)
  const [feedback, setFeedback] = useState<'idle' | 'workout' | 'levelup'>('idle')
  const [calendarRevision, setCalendarRevision] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (zone) setWorkoutZone(zone)
  }, [])
  if (!snapshot)
    return error ? (
      <main className="app-shell">
        <Brand />
        <section className="page-panel">
          <h1>Let’s try that again.</h1>
          <p className="form-error" role="alert">
            {error}
          </p>
          <button className="primary" disabled={loading} onClick={() => void refresh()}>
            Reload your data
          </button>
          <button className="secondary" onClick={() => void run(() => api.logout())}>
            Sign out
          </button>
        </section>
      </main>
    ) : (
      <LoadingScreen />
    )
  const { train, character, history } = snapshot
  const { profile, progress } = train
  const shopItems: ShopItem[] = snapshot.shop.map((item) => ({ ...item, slot: item.equipmentSlot }))
  const avatarIndex = Math.max(
    0,
    avatars.findIndex((item) => item.key === character.avatar),
  )
  const avatar = avatars[avatarIndex]
  const equipped: Equipped = Object.fromEntries(
    character.equippedCosmetics.map((item) => [item.equipmentSlot, item.id]),
  )
  const owned = shopItems.filter((item) => item.owned).map((item) => item.id)
  const recentFocus = history[0]?.focusArea
  const muscleFocus = recentFocus && recentFocus !== 'full-body' ? recentFocus : null
  const announce = (message: string, state: 'idle' | 'workout' | 'levelup' = 'idle') => {
    setNotice(message)
    setFeedback(state)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setNotice('')
      setFeedback('idle')
    }, 5000)
  }
  const submitWorkout = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setFormError('')
    void run(async () => {
      const draft = workoutDraft ?? workoutInputFromForm(data, workoutZone)
      setWorkoutDraft(draft)
      storeDraft(userId, 'workout', draft)
      try {
        const saved = await api.logWorkout(draft)
        setWorkoutDraft(null)
        storeDraft(userId, 'workout', null)
        setWorkoutOpen(false)
        const next = await refresh()
        const earned = next ? Math.max(0, next.train.progress.totalXp - progress.totalXp) : 0
        announce(
          saved.workout.status === 'voided'
            ? 'This workout was already removed.'
            : next
              ? `Workout saved · ${earned ? `+${earned} XP` : 'Your progress is up to date'}`
              : 'Workout saved. Reload to update your progress.',
          next && next.train.progress.level > progress.level
            ? 'levelup'
            : earned
              ? 'workout'
              : 'idle',
        )
      } catch (error) {
        if (error instanceof FlexiAPIError && [400, 413, 415].includes(error.status)) {
          setWorkoutDraft(null)
          storeDraft(userId, 'workout', null)
        }
        throw error
      }
    }, setFormError)
  }
  const submitSchedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setScheduleError('')
    void run(async () => {
      const startsAt =
        calendarDraft?.startsAt ?? zonedInstant(String(data.get('scheduledAt')), profile.timezone)
      const draft =
        calendarDraft ??
        calendarInput({
          requestId: crypto.randomUUID(),
          title: data.get('title'),
          startsAt,
          endsAt: new Date(
            Date.parse(startsAt) + Number(data.get('durationMinutes')) * 60_000,
          ).toISOString(),
          timezone: profile.timezone,
          workoutType: data.get('workoutType'),
          notes: String(data.get('notes') ?? ''),
        })
      setCalendarDraft(draft)
      storeDraft(userId, 'calendar', draft)
      try {
        const saved = await api.createCalendarEvent(draft)
        setCalendarDraft(null)
        storeDraft(userId, 'calendar', null)
        setScheduleOpen(false)
        setCalendarRevision((value) => value + 1)
        announce(
          saved.status === 'cancelled'
            ? 'This plan was already cancelled.'
            : 'Workout scheduled. Find it in your calendar.',
        )
        await refresh()
      } catch (error) {
        if (error instanceof FlexiAPIError && [400, 413, 415].includes(error.status)) {
          setCalendarDraft(null)
          storeDraft(userId, 'calendar', null)
        }
        throw error
      }
    }, setScheduleError)
  }
  const equipItem = (item: ShopItem) =>
    void run(async () => {
      await api.updateCharacter({ equipped: { [item.slot]: item.id } })
      setShopMessage(`${item.name} equipped.`)
      await refresh()
    })
  const claimItem = (item: ShopItem) =>
    void run(async () => {
      await api.claimCosmetic(item.id)
      await api.updateCharacter({ equipped: { [item.slot]: item.id } })
      setShopMessage(`${item.name} claimed and equipped.`)
      await refresh()
    })
  const logout = () =>
    void run(async () => {
      await api.logout()
      clearDrafts(userId)
    })
  if (!profile.onboardingCompleted || editingOnboarding)
    return (
      <Onboarding
        profile={profile}
        goalLocked={profile.onboardingCompleted || progress.totalWorkouts > 0}
        onCancel={profile.onboardingCompleted ? () => setEditingOnboarding(false) : logout}
        onSave={async (input) => {
          await api.saveOnboarding(input)
          setEditingOnboarding(false)
          if (!(await refresh()))
            throw new Error('Your preferences were saved. Reload to finish loading your profile.')
        }}
      />
    )
  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <button
          className="mini-profile"
          aria-label="Open your profile"
          onClick={() => setTab('profile')}
        >
          <AvatarArt avatar={avatar.key} />
        </button>
      </header>
      {notice && (
        <div className="rank-toast" role="status">
          <Icon name="check" />
          {notice}
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button disabled={loading || busy} onClick={() => void refresh()}>
            Reload data
          </button>
        </div>
      )}
      {loading && (
        <div className="sync-status" role="status">
          Updating your training space…
        </div>
      )}
      <fieldset disabled={busy} className="app-controls" aria-busy={busy}>
        <main className="tab-content">
          {tab === 'home' && (
            <HomeTab
              avatar={avatar}
              evolved={character.evolved}
              focus={muscleFocus}
              progress={progress}
              feedback={feedback}
              shopItems={shopItems}
              equipped={equipped}
              onWorkout={() => setWorkoutTypeOpen(true)}
              train={train}
              onProfile={() => setTab('profile')}
            />
          )}
          {tab === 'social' && <SocialTab players={players} />}
          {tab === 'profile' && (
            <ProfileTab
              avatar={avatar}
              focus={muscleFocus}
              avatarIndex={avatarIndex}
              onAvatarChange={(index) =>
                void run(async () => {
                  await api.updateCharacter({ avatar: avatars[index].key })
                  await refresh()
                })
              }
              profile={profile}
              progress={progress}
              history={history}
              api={api}
              revision={calendarRevision}
              onSchedule={(date) => {
                setScheduleDate(date)
                setScheduleOpen(true)
              }}
              shopItems={shopItems}
              owned={owned}
              equipped={equipped}
              onEquip={equipItem}
              onRemove={(slot) =>
                void run(async () => {
                  await api.updateCharacter({ equipped: { [slot]: null } })
                  await refresh()
                })
              }
              onLogout={logout}
              onEditGoals={() => setEditingOnboarding(true)}
              onName={(name) =>
                void run(async () => {
                  await api.updateProfile({ displayName: name })
                  await refresh()
                  announce('Name saved.')
                })
              }
              onVoid={(id) =>
                void run(async () => {
                  await api.voidWorkout(id)
                  await refresh()
                  announce('Workout removed. Progress updated.')
                })
              }
              onCalendarChange={(id, status) =>
                void run(async () => {
                  if (status === 'cancelled') await api.cancelCalendarEvent(id)
                  else await api.updateCalendarEvent(id, { status })
                  setCalendarRevision((value) => value + 1)
                  await refresh()
                })
              }
              archivedItems={snapshot.archivedItems}
            />
          )}
          {tab === 'shop' && (
            <ShopTab
              avatar={avatar}
              evolved={character.evolved}
              items={shopItems}
              owned={owned}
              equipped={equipped}
              level={progress.level}
              message={shopMessage}
              onPurchase={claimItem}
              onEquip={equipItem}
            />
          )}
        </main>
        <nav className="bottom-tabs" aria-label="Primary navigation">
          {(['home', 'social', 'profile', 'shop'] as const).map((item) => (
            <button
              key={item}
              aria-current={tab === item ? 'page' : undefined}
              className={tab === item ? 'active' : ''}
              onClick={() => setTab(item)}
            >
              <Icon
                name={
                  item === 'social'
                    ? 'users'
                    : item === 'profile'
                      ? 'user'
                      : item === 'shop'
                        ? 'bag'
                        : 'home'
                }
              />
              <span>{item === 'home' ? 'Train' : item[0].toUpperCase() + item.slice(1)}</span>
            </button>
          ))}
        </nav>
      </fieldset>
      {workoutTypeOpen && (
        <WorkoutTypeModal
          onClose={() => setWorkoutTypeOpen(false)}
          onSelect={(type) => {
            setWorkoutType(type)
            setWorkoutTypeOpen(false)
            setWorkoutOpen(true)
          }}
        />
      )}
      {workoutOpen && (
        <WorkoutModal
          pending={busy}
          draft={workoutDraft}
          type={workoutType}
          zone={workoutZone}
          error={formError}
          onClose={() => {
            if (!busy) {
              setWorkoutOpen(false)
              setFormError('')
            }
          }}
          onSubmit={submitWorkout}
        />
      )}
      {scheduleOpen && (
        <ScheduleModal
          date={scheduleDate}
          draft={calendarDraft}
          zone={profile.timezone}
          pending={busy}
          error={scheduleError}
          onClose={() => {
            if (!busy) {
              setScheduleOpen(false)
              setScheduleError('')
            }
          }}
          onSubmit={submitSchedule}
        />
      )}
    </div>
  )
}

function Brand() {
  return <div className="brand">FLEXI</div>
}

function HomeTab({
  avatar,
  evolved,
  focus,
  progress,
  feedback,
  shopItems,
  equipped,
  onWorkout,
  train,
  onProfile,
}: {
  avatar: (typeof avatars)[number]
  evolved: boolean
  focus: 'arms' | 'chest' | 'legs' | null
  progress: Progress
  feedback: string
  shopItems: ShopItem[]
  equipped: Equipped
  onWorkout: () => void
  train: Train
  onProfile: () => void
}) {
  return (
    <>
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">
            LEVEL {progress.level} · {evolved ? 'POWERED UP' : 'RISING ROOKIE'}
          </span>
          <h1>
            Keep showing up,
            <br />
            <em>keep growing.</em>
          </h1>
          <p>
            {evolved
              ? `${avatar.name} evolved! Keep training to master this stronger form.`
              : `${avatar.name} is getting stronger with every rep.`}
          </p>
          <div className="progress-label">
            <span>Level progress</span>
            <b>{progress.xpIntoLevel} / 500 XP</b>
          </div>
          <div className="progress">
            <i style={{ width: `${progress.levelProgressPercent}%` }} />
          </div>
          <button className="primary" onClick={onWorkout}>
            <Icon name="plus" />
            Log a workout
          </button>
        </div>
        <div className={`avatar-stage ${feedback} ${focus ? `focus-${focus}` : ''}`}>
          <span className="xp-pop">+XP</span>
          <span className="level-pop">LEVEL UP</span>
          {focus && <span className="focus-pop">{focus.toUpperCase()} FOCUS</span>}
          <FittedAvatar
            avatar={avatar.key}
            evolved={evolved}
            focus={focus}
            items={shopItems}
            equipped={equipped}
          />
          <div className="level-chip">
            <small>LVL</small>
            <b>{progress.level}</b>
          </div>
        </div>
      </section>
      <section className="stat-grid home-stats">
        <article>
          <Icon name="flame" />
          <div>
            <b>{progress.weeklyStreak} weeks</b>
            <span>Current streak</span>
          </div>
        </article>
        <article>
          <Icon name="bolt" />
          <div>
            <b>{progress.totalWorkouts}</b>
            <span>Total workouts</span>
          </div>
        </article>
        <article>
          <Icon name="trophy" />
          <div>
            <b>
              {progress.completedDaysThisWeek} / {progress.weeklyGoal}
            </b>
            <span>Active days this week</span>
          </div>
        </article>
      </section>
      <section className="friend-feed">
        <div className="feed-heading">
          <div>
            <span className="eyebrow">YOUR NEXT STEP</span>
            <h2>Make time for yourself</h2>
          </div>
          <button className="secondary" onClick={onProfile}>
            View calendar
          </button>
        </div>
        {train.upcomingWorkouts.length ? (
          <div className="feed-scroller">
            {train.upcomingWorkouts.map((event) => (
              <article className="activity-card" key={event.id}>
                <span className="eyebrow">{event.workoutType}</span>
                <h3>{event.title}</h3>
                <p>{formatTime(event.startsAt, train.profile.timezone)}</p>
                <small>
                  {Math.round((Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60000)}{' '}
                  minutes
                </small>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-feed">
            A little planning goes a long way. Add your next workout in your calendar.
          </div>
        )}
      </section>
      {(train.news.length > 0 || train.tutorials.length > 0) && (
        <section className="friend-feed">
          <div className="feed-heading">
            <div>
              <span className="eyebrow">TRAINING NOTES</span>
              <h2>A little inspiration</h2>
            </div>
          </div>
          <div className="feed-scroller">
            {[...train.tutorials, ...train.news].map((item) => (
              <article className="activity-card" key={item.id}>
                <span className="eyebrow">{item.kind}</span>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                {item.body && (
                  <details>
                    <summary>Read more</summary>
                    <p className="content-body">{item.body}</p>
                  </details>
                )}
                {item.sourceUrl?.startsWith('https://') && (
                  <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                    View source ↗
                  </a>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="friend-feed">
        <div className="feed-heading">
          <div>
            <span className="eyebrow">FRIEND ACTIVITY</span>
            <h2>Your circle is growing</h2>
          </div>
          <span>Coming later</span>
        </div>
        <div className="empty-feed">
          Friend connections and shared workouts are coming in a future update.
        </div>
      </section>
    </>
  )
}

function SocialTab({ players }: { players: LeaderboardPlayer[] }) {
  return (
    <section className="social-page">
      <header className="social-hero">
        <div>
          <span className="eyebrow">SOCIAL</span>
          <h1>Stronger together.</h1>
          <p>A little inspiration from the Flexi community.</p>
        </div>
        <span className="level-badge">PREVIEW</span>
      </header>
      <div className="social-summary">
        <article>
          <span>
            <Icon name="globe" />
          </span>
          <div>
            <b>{players.length}</b>
            <small>Featured athletes</small>
          </div>
        </article>
        <article>
          <span>
            <Icon name="users" />
          </span>
          <div>
            <b>Coming later</b>
            <small>Friends & inner circles</small>
          </div>
        </article>
        <article>
          <span>
            <Icon name="trophy" />
          </span>
          <div>
            <b>Editorial</b>
            <small>Community showcase</small>
          </div>
        </article>
      </div>
      <div className="social-ranking-heading">
        <div>
          <span className="eyebrow">COMMUNITY SHOWCASE</span>
          <h2>Flexi League</h2>
        </div>
        <p>Curated entries. Live rankings and friend connections are coming later.</p>
      </div>
      {players.length ? (
        <>
          <div className="podium">
            {players.slice(0, 3).map((player, index) => (
              <div key={player.id} className={`podium-player place-${index + 1}`}>
                <span>#{index + 1}</span>
                <div className="leader-avatar">
                  <AvatarArt avatar={player.avatar} />
                </div>
                <b>{player.name}</b>
                <small>{player.points.toLocaleString()} pts</small>
              </div>
            ))}
          </div>
          <RankingList players={players.slice(3)} offset={3} />
        </>
      ) : (
        <div className="circle-empty">
          <Icon name="users" />
          <h3>There’s room to grow.</h3>
          <p>Featured athletes will appear here when the showcase is available.</p>
        </div>
      )}
    </section>
  )
}

function RankingList({ players, offset }: { players: LeaderboardPlayer[]; offset: number }) {
  return (
    <div className="leader-list social-list">
      {players.map((player, index) => (
        <article key={player.id}>
          <b className="rank-number">{index + offset + 1}</b>
          <div className="list-avatar">
            <AvatarArt avatar={player.avatar} />
          </div>
          <div className="leader-name">
            <b>{player.name}</b>
            <small>
              @{player.handle} · {player.streak} day streak
            </small>
          </div>
          <strong>
            {player.points.toLocaleString()}
            <small> pts</small>
          </strong>
        </article>
      ))}
    </div>
  )
}

function ProfileTab({
  avatar,
  focus,
  avatarIndex,
  onAvatarChange,
  profile,
  progress,
  history,
  api,
  revision,
  onSchedule,
  shopItems,
  owned,
  equipped,
  onEquip,
  onRemove,
  onLogout,
  onEditGoals,
  onName,
  onVoid,
  onCalendarChange,
  archivedItems,
}: {
  avatar: (typeof avatars)[number]
  focus: 'arms' | 'chest' | 'legs' | null
  avatarIndex: number
  onAvatarChange: (index: number) => void
  profile: UserProfile
  progress: Progress
  history: WorkoutLog[]
  api: ReturnType<typeof createFlexiAPI>
  revision: number
  onSchedule: (date: string) => void
  shopItems: ShopItem[]
  owned: string[]
  equipped: Equipped
  onEquip: (item: ShopItem) => void
  onRemove: (slot: ShopItem['slot']) => void
  onLogout: () => void
  onEditGoals: () => void
  onName: (name: string) => void
  onVoid: (id: string) => void
  onCalendarChange: (id: string, status: 'completed' | 'cancelled') => void
  archivedItems: number
}) {
  return (
    <section className="page-panel profile-page">
      <div className="profile-hero">
        <div className="profile-avatar">
          <FittedAvatar
            avatar={avatar.key}
            evolved={progress.level >= 5}
            focus={focus}
            items={shopItems}
            equipped={equipped}
          />
        </div>
        <span className="level-badge">LEVEL {progress.level}</span>
        <h1>{profile.displayName}</h1>
        <p>Training with {avatar.name}</p>
      </div>
      <div className="profile-stats profile-stats-four">
        <article>
          <b>{progress.dailyStreak}</b>
          <span>Day streak</span>
        </article>
        <article>
          <b>{progress.totalXp.toLocaleString()}</b>
          <span>Total XP</span>
        </article>
        <article>
          <b>{progress.totalWorkouts}</b>
          <span>Workouts</span>
        </article>
        <article>
          <b>{progress.totalMinutes}</b>
          <span>Minutes trained</span>
        </article>
      </div>
      <MiniCalendar
        history={history}
        api={api}
        revision={revision}
        zone={profile.timezone}
        onSchedule={onSchedule}
        onCalendarChange={onCalendarChange}
      />
      <WorkoutHistory history={history} zone={profile.timezone} onVoid={onVoid} />
      <div className="buddy-picker">
        <span className="eyebrow">TRAINING BUDDY</span>
        <h2>Choose your character</h2>
        <div>
          {avatars.map((item, index) => (
            <button
              type="button"
              aria-pressed={avatarIndex === index}
              className={avatarIndex === index ? 'selected' : ''}
              key={item.key}
              onClick={() => onAvatarChange(index)}
            >
              <AvatarArt avatar={item.key} />
              <b>{item.name}</b>
            </button>
          ))}
        </div>
      </div>
      <ClosetPanel
        items={shopItems}
        owned={owned}
        equipped={equipped}
        onEquip={onEquip}
        onRemove={onRemove}
      />
      {archivedItems > 0 && (
        <p className="status-notice">
          {archivedItems} retired {archivedItems === 1 ? 'item remains' : 'items remain'} in your
          inventory and can no longer be equipped.
        </p>
      )}
      <div className="profile-card">
        <div>
          <span className="eyebrow">CURRENT LEVEL</span>
          <h2>{progress.xpIntoLevel} XP earned</h2>
        </div>
        <b>{progress.xpToNextLevel} XP to go</b>
        <div className="progress">
          <i style={{ width: `${progress.levelProgressPercent}%` }} />
        </div>
      </div>
      <section className="profile-settings">
        <span className="eyebrow">YOUR ROUTINE</span>
        <h2>A plan that fits you</h2>
        <p>
          {profile.weeklyGoal} active days per week · {profile.timezone}
        </p>
        <p>
          {profile.goals
            .map((goal) => goalOptions.find((option) => option[0] === goal)?.[1] ?? goal)
            .join(' · ')}
        </p>
        <button className="secondary" onClick={onEditGoals}>
          Edit fitness preferences
        </button>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onName(String(new FormData(event.currentTarget).get('displayName')))
          }}
        >
          <label className="full-field">
            <span>Display name</span>
            <input
              key={profile.displayName}
              name="displayName"
              defaultValue={profile.displayName}
              maxLength={60}
              required
            />
          </label>
          <button className="secondary" type="submit">
            Save name
          </button>
        </form>
      </section>
      <button className="logout-button" type="button" onClick={onLogout}>
        <Icon name="user" />
        <span>
          <b>Log out</b>
          <small>Your progress will be here when you return</small>
        </span>
      </button>
    </section>
  )
}

function formatTime(value: string, zone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function MiniCalendar({
  history,
  api,
  revision,
  zone,
  onSchedule,
  onCalendarChange,
}: {
  history: WorkoutLog[]
  api: ReturnType<typeof createFlexiAPI>
  revision: number
  zone: string
  onSchedule: (date: string) => void
  onCalendarChange: (id: string, status: 'completed' | 'cancelled') => void
}) {
  const today = dateKey(new Date(), zone)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selected, setSelected] = useState(today)
  const calendar = useCalendar(api, month, zone, revision)
  const first = new Date(`${month}-01T12:00:00Z`),
    year = first.getUTCFullYear(),
    index = first.getUTCMonth()
  const offset = (first.getUTCDay() + 6) % 7,
    count = new Date(Date.UTC(year, index + 1, 0)).getUTCDate()
  const activeDay = selected.startsWith(month) ? selected : `${month}-01`
  const moveMonth = (delta: number) => {
    const next = new Date(first)
    next.setUTCMonth(index + delta)
    setMonth(next.toISOString().slice(0, 7))
  }
  const selectedEvents = calendar.events.filter((event) => eventOnDay(event, activeDay, zone))
  const selectedWorkouts = history.filter((workout) => workout.localDate === activeDay)
  return (
    <section className="mini-calendar">
      <header>
        <div>
          <span className="eyebrow">WORKOUT CALENDAR</span>
          <h2>
            {first.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })}
          </h2>
        </div>
        <div>
          <button aria-label="Previous month" onClick={() => moveMonth(-1)}>
            ‹
          </button>
          <button aria-label="Next month" onClick={() => moveMonth(1)}>
            ›
          </button>
        </div>
      </header>
      <div className="weekday-row">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
          <span key={i}>{day}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {Array.from({ length: offset + count }, (_, i) => {
          if (i < offset) return <span key={`blank-${i}`} />
          const day = i - offset + 1,
            date = `${month}-${String(day).padStart(2, '0')}`
          const completed = history.some((workout) => workout.localDate === date)
          const scheduled = calendar.events.some((event) => eventOnDay(event, date, zone))
          return (
            <button
              type="button"
              key={date}
              aria-label={`${date}${completed ? ', workout complete' : ''}${scheduled ? ', scheduled workout' : ''}`}
              aria-pressed={activeDay === date}
              className={`${date === today ? 'today' : ''} ${completed ? 'completed' : ''} ${scheduled ? 'scheduled' : ''} ${activeDay === date ? 'selected-day' : ''}`}
              onClick={() => setSelected(date)}
            >
              <b>{day}</b>
              {completed && <Icon name="flame" />}
              {scheduled && <i />}
            </button>
          )
        })}
      </div>
      <footer>
        <span>
          <i className="done-dot" />
          Workout complete
        </span>
        <span>
          <i className="plan-dot" />
          Scheduled
        </span>
        <small>Times shown in {zone}. Select a day to view or plan a workout.</small>
      </footer>
      <div className="calendar-agenda">
        <div className="agenda-heading">
          <h3>
            {new Date(`${activeDay}T12:00:00Z`).toLocaleDateString('en-US', {
              timeZone: 'UTC',
              month: 'long',
              day: 'numeric',
            })}
          </h3>
          {activeDay >= today && (
            <button className="secondary" onClick={() => onSchedule(activeDay)}>
              Plan a workout
            </button>
          )}
        </div>
        {calendar.loading && <p role="status">Loading plans…</p>}
        {calendar.error && (
          <p className="form-error" role="alert">
            {calendar.error} <button onClick={calendar.retry}>Retry</button>
          </p>
        )}
        {!calendar.loading &&
          !calendar.error &&
          !selectedEvents.length &&
          !selectedWorkouts.length && (
            <p className="empty-copy">A little room to move. No workouts for this day yet.</p>
          )}
        {selectedWorkouts.map((workout) => (
          <article key={workout.id}>
            <div>
              <b>{workout.title}</b>
              <small>
                Logged · {workout.durationMinutes} minutes · {workout.focusArea}
              </small>
            </div>
            <Icon name="check" />
          </article>
        ))}
        {selectedEvents.map((event) => (
          <article key={event.id}>
            <div>
              <b>{event.title}</b>
              <small>
                {formatTime(event.startsAt, zone)} · {event.workoutType} · {event.status}
              </small>
              {event.notes && <p>{event.notes}</p>}
              <div className="agenda-actions">
                <a href={googleCalendarURL(event)} target="_blank" rel="noopener noreferrer">
                  Add to Google Calendar ↗
                </a>
                {event.status === 'planned' && (
                  <button onClick={() => onCalendarChange(event.id, 'completed')}>
                    Mark plan complete
                  </button>
                )}
                <button onClick={() => onCalendarChange(event.id, 'cancelled')}>Cancel plan</button>
              </div>
            </div>
          </article>
        ))}
        {selectedEvents.length > 0 && (
          <small>
            Completing a plan does not log a workout. Log your activity on Train to earn XP.
          </small>
        )}
      </div>
    </section>
  )
}

function WorkoutHistory({
  history,
  zone,
  onVoid,
}: {
  history: WorkoutLog[]
  zone: string
  onVoid: (id: string) => void
}) {
  const [visible, setVisible] = useState(5),
    [confirmId, setConfirmId] = useState<string | null>(null)
  return (
    <section className="workout-history">
      <span className="eyebrow">YOUR EFFORT ADDS UP</span>
      <h2>Workout history</h2>
      {!history.length && (
        <p className="empty-copy">Your first workout starts a new chapter. Log it on Train.</p>
      )}
      {history.slice(0, visible).map((workout) => (
        <article key={workout.id}>
          <div>
            <b>{workout.title}</b>
            <small>
              {formatTime(workout.performedAt, zone)} · {workout.durationMinutes} minutes
              {workout.distance && workout.distanceUnit
                ? ` · ${workout.distance} ${workout.distanceUnit}`
                : ''}
              {workout.intensity ? ` · ${workout.intensity}` : ''}
              {!isCardioActivity(workout.activity) && workout.activity !== 'sports'
                ? ` · ${workout.focusArea}`
                : ''}
            </small>
            {workout.notes && <p>{workout.notes}</p>}
          </div>
          {confirmId === workout.id ? (
            <div className="history-actions">
              <span>Remove this workout and its progress?</span>
              <button
                onClick={() => {
                  onVoid(workout.id)
                  setConfirmId(null)
                }}
              >
                Confirm remove
              </button>
              <button onClick={() => setConfirmId(null)}>Keep</button>
            </div>
          ) : (
            <button aria-label={`Remove ${workout.title}`} onClick={() => setConfirmId(workout.id)}>
              Remove
            </button>
          )}
        </article>
      ))}
      {visible < history.length && (
        <button className="secondary" onClick={() => setVisible((value) => value + 10)}>
          Show more workouts
        </button>
      )}
    </section>
  )
}

function ClosetPanel({
  items,
  owned,
  equipped,
  onEquip,
  onRemove,
}: {
  items: ShopItem[]
  owned: string[]
  equipped: Equipped
  onEquip: (item: ShopItem) => void
  onRemove: (slot: ShopItem['slot']) => void
}) {
  const categories: ShopItem['slot'][] = ['top', 'bottom', 'shoes', 'accessory', 'background']
  return (
    <section className="closet-panel">
      <div className="closet-heading">
        <div>
          <span className="eyebrow">AVATAR CLOSET</span>
          <h2>Mix, match, and equip</h2>
        </div>
        <span>{owned.length} owned</span>
      </div>
      <div className="closet-groups">
        {categories.map((slot) => {
          const slotItems = items.filter((item) => item.slot === slot && owned.includes(item.id))
          return (
            <div className="closet-group" key={slot}>
              <header>
                <b>{slot === 'bottom' ? 'Bottoms' : slot[0].toUpperCase() + slot.slice(1)}</b>
                {equipped[slot] && <button onClick={() => onRemove(slot)}>Remove</button>}
              </header>
              <div>
                {slotItems.length ? (
                  slotItems.map((item) => (
                    <button
                      type="button"
                      className={equipped[slot] === item.id ? 'equipped' : ''}
                      key={item.id}
                      onClick={() => onEquip(item)}
                    >
                      <span
                        style={{
                          background: `linear-gradient(135deg,${item.primaryColor},${item.accentColor})`,
                        }}
                      />
                      <small>{item.name}</small>
                    </button>
                  ))
                ) : (
                  <p>No owned items yet</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}


function ScheduleModal({
  date,
  draft,
  zone,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  date: string
  draft: CalendarInput | null
  zone: string
  pending: boolean
  error: string
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const dialog = useDialog(pending, onClose)
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose()
      }}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        className="workout-modal schedule-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-title"
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">PLAN AHEAD</span>
            <h2 id="schedule-title">Schedule a workout</h2>
            <p>Make a little space for your next session.</p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            aria-label="Close schedule form"
          >
            ×
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <fieldset disabled={pending || Boolean(draft)}>
            <label className="full-field">
              <span>Workout title</span>
              <input
                name="title"
                defaultValue={draft?.title ?? 'Flexi workout'}
                maxLength={120}
                required
              />
            </label>
            <div className="field-row">
              <label>
                <span>Date & time · {zone}</span>
                <input
                  name="scheduledAt"
                  type="datetime-local"
                  defaultValue={
                    draft ? localDateTime(new Date(draft.startsAt), zone) : `${date}T18:00`
                  }
                  required
                />
              </label>
              <label>
                <span>Duration</span>
                <div className="input-suffix">
                  <input
                    name="durationMinutes"
                    type="number"
                    min="1"
                    max="1440"
                    defaultValue={
                      draft
                        ? Math.round(
                            (Date.parse(draft.endsAt) - Date.parse(draft.startsAt)) / 60000,
                          )
                        : 45
                    }
                    required
                  />
                  <small>min</small>
                </div>
              </label>
            </div>
            <label className="full-field">
              <span>Workout type</span>
              <select name="workoutType" defaultValue={draft?.workoutType ?? 'strength'}>
                <option value="strength">Strength</option>
                <option value="cardio">Cardio</option>
                <option value="mobility">Mobility</option>
                <option value="sports">Sports</option>
                <option value="recovery">Recovery</option>
              </select>
            </label>
            <label className="full-field">
              <span>
                Notes <small>optional</small>
              </span>
              <textarea
                name="notes"
                defaultValue={draft?.notes ?? ''}
                maxLength={2000}
                rows={3}
                placeholder="Exercises, location, or a reminder"
              />
            </label>
          </fieldset>
          <p className="status-notice">
            After saving, you can open this plan in Google Calendar from your calendar agenda.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {draft && !pending && (
            <p className="status-notice">
              Retry your saved submission to confirm the outcome without creating another plan.
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="secondary" disabled={pending} onClick={onClose}>
              Close
            </button>
            <button type="submit" className="primary save-workout" disabled={pending}>
              {pending ? 'Scheduling…' : draft ? 'Retry saved plan' : 'Schedule workout'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

const goalOptions = [
  ['build-muscle', 'Build muscle', 'Grow size and definition'],
  ['get-stronger', 'Get stronger', 'Improve your major lifts'],
  ['lose-weight', 'Lose weight', 'Build sustainable movement habits'],
  ['improve-endurance', 'Improve endurance', 'Move longer with more energy'],
  ['stay-consistent', 'Stay consistent', 'Create a routine that sticks'],
  ['move-better', 'Move better', 'Improve mobility and flexibility'],
] as const

function Onboarding({
  profile,
  goalLocked,
  onSave,
  onCancel,
}: {
  profile: UserProfile
  goalLocked: boolean
  onSave: (input: OnboardingInput) => Promise<void>
  onCancel: () => void
}) {
  const [step, setStep] = useState(1)
  const [goals, setGoals] = useState<OnboardingInput['goals']>(profile.goals)
  const [experience, setExperience] = useState<OnboardingInput['experienceLevel']>(
    profile.experienceLevel,
  )
  const [frequency, setFrequency] = useState(profile.weeklyGoal)
  const [preferredTime, setPreferredTime] = useState<OnboardingInput['preferredTime']>(
    profile.preferredTime,
  )
  const [calendar, setCalendar] = useState<OnboardingInput['calendarProvider']>(
    profile.calendarProvider,
  )
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const canContinue =
    step === 1
      ? goals.length > 0
      : step === 2
        ? Boolean(experience)
        : step === 3
          ? Boolean(preferredTime)
          : true

  const next = () => {
    if (!canContinue) return
    setError('')
    if (step < 4) setStep((value) => value + 1)
    else
      startTransition(async () => {
        try {
          await onSave({
            goals,
            experienceLevel: experience,
            weeklyGoal: frequency,
            preferredTime,
            calendarProvider: calendar,
          })
        } catch (error) {
          setError(messageFor(error))
        }
      })
  }

  return (
    <main className="onboarding-shell">
      <header className="onboarding-top">
        <Brand />
        <button type="button" disabled={pending} onClick={onCancel}>
          {profile.onboardingCompleted ? 'Back to profile' : 'Sign out'}
        </button>
      </header>
      <div className="step-track">
        <span style={{ width: `${step * 25}%` }} />
      </div>
      <section className="onboarding-card">
        <fieldset disabled={pending}>
          <div className="step-count">STEP {step} OF 4</div>
          {step === 1 && (
            <>
              <h1>What are you training for?</h1>
              <p>Select all that apply. Keep your goals close as you build your routine.</p>
              <div className="goal-grid">
                {goalOptions.map(([value, title, description]) => (
                  <button
                    type="button"
                    key={value}
                    className={goals.includes(value) ? 'selected' : ''}
                    onClick={() =>
                      setGoals((current) =>
                        current.includes(value)
                          ? current.filter((goal) => goal !== value)
                          : [...current, value],
                      )
                    }
                  >
                    <span>{goals.includes(value) ? '✓' : ''}</span>
                    <b>{title}</b>
                    <small>{description}</small>
                  </button>
                ))}
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <h1>What&apos;s your experience level?</h1>
              <p>There&apos;s no wrong answer. Flexi meets you exactly where you are.</p>
              <div className="choice-stack">
                {[
                  ['beginner', 'Beginner', 'I’m new or getting back into fitness'],
                  ['intermediate', 'Intermediate', 'I train regularly and know the basics'],
                  ['advanced', 'Advanced', 'I’m experienced and train with structure'],
                ].map(([value, title, description]) => (
                  <button
                    type="button"
                    key={value}
                    className={experience === value ? 'selected' : ''}
                    onClick={() => setExperience(value as OnboardingInput['experienceLevel'])}
                  >
                    <b>{title}</b>
                    <small>{description}</small>
                    <span>›</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <h1>Build a routine that fits.</h1>
              <p>Choose how many days you want to move each week and when you prefer to train.</p>
              <div className="frequency-box">
                <span>Active days per week{goalLocked && <small> · Fixed after setup</small>}</span>
                <div>
                  <button
                    type="button"
                    disabled={goalLocked}
                    aria-label="Fewer active days"
                    onClick={() => setFrequency(Math.max(1, frequency - 1))}
                  >
                    −
                  </button>
                  <b>{frequency}</b>
                  <button
                    type="button"
                    disabled={goalLocked}
                    aria-label="More active days"
                    onClick={() => setFrequency(Math.min(7, frequency + 1))}
                  >
                    +
                  </button>
                </div>
              </div>
              <span className="field-title">When do you prefer to train?</span>
              <div className="time-grid">
                {[
                  ['morning', 'Morning', '6–10 AM'],
                  ['midday', 'Midday', '10 AM–3 PM'],
                  ['evening', 'Evening', '3–9 PM'],
                  ['flexible', 'Flexible', 'Any open time'],
                ].map(([value, title, time]) => (
                  <button
                    type="button"
                    key={value}
                    className={preferredTime === value ? 'selected' : ''}
                    onClick={() => setPreferredTime(value as OnboardingInput['preferredTime'])}
                  >
                    <b>{title}</b>
                    <small>{time}</small>
                  </button>
                ))}
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <h1>Fit workouts into your day.</h1>
              <p>
                Save your preferred calendar. You can plan workouts in Flexi and export individual
                plans to Google Calendar.
              </p>
              <div className="calendar-options">
                <button
                  type="button"
                  className={calendar === 'google' ? 'selected' : ''}
                  onClick={() => setCalendar('google')}
                >
                  <span className="calendar-letter google">G</span>
                  <div>
                    <b>Google Calendar</b>
                    <small>Open individual plans in Google Calendar</small>
                  </div>
                  <i>{calendar === 'google' ? 'Selected' : 'Choose'}</i>
                </button>
                <button
                  type="button"
                  className={calendar === 'apple' ? 'selected' : ''}
                  onClick={() => setCalendar('apple')}
                >
                  <span className="calendar-letter apple">A</span>
                  <div>
                    <b>Apple Calendar</b>
                    <small>Save your preference; Apple export is coming later</small>
                  </div>
                  <i>{calendar === 'apple' ? 'Selected' : 'Choose'}</i>
                </button>
                <button
                  type="button"
                  className={calendar === 'none' ? 'selected' : ''}
                  onClick={() => setCalendar('none')}
                >
                  <span className="calendar-letter later">—</span>
                  <div>
                    <b>No preference</b>
                    <small>Use the built-in Flexi calendar</small>
                  </div>
                  <i>{calendar === 'none' ? 'Selected' : 'Choose'}</i>
                </button>
              </div>
              <div className="privacy-note">
                This saves a preference. It does not connect to or read your calendar.
              </div>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <footer className="onboarding-actions">
            <button
              type="button"
              className="back-button"
              disabled={step === 1}
              onClick={() => setStep((value) => Math.max(1, value - 1))}
            >
              Back
            </button>
            <button
              type="button"
              className="primary"
              disabled={!canContinue || pending}
              onClick={next}
            >
              {pending ? 'Saving…' : step === 4 ? 'Finish setup' : 'Continue'}
            </button>
          </footer>
        </fieldset>
      </section>
      <p className="onboarding-helper">
        {step === 1
          ? 'You can update your goals anytime.'
          : step === 4
            ? 'Calendar preference is optional.'
            : 'Your answers personalize the Flexi experience.'}
      </p>
    </main>
  )
}
