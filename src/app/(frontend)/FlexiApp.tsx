'use client'

import { useMemo, useRef, useState } from 'react'
import ShopTab from './ShopTab'
import { useCoinEconomy } from './useCoinEconomy'
import { AccountDialog, WorkoutDialog } from './EconomyDialogs'
import { flexiAPI } from '@/lib/flexi-api'
import { COIN_MILESTONES } from '@/lib/coin-economy'

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

type IconName = 'home' | 'trophy' | 'user' | 'plus' | 'bolt' | 'flame' | 'shop'

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    shop: <><path d="M5 8h14l2 13H3L5 8Z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /></>,
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
    trophy: <path d="M8 4h8v5a4 4 0 0 1-8 0V4Zm-3 1h3v5H7a2 2 0 0 1-2-2V5Zm11 0h3v3a2 2 0 0 1-2 2h-1M12 13v5m-4 2h8" />,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    bolt: <path d="m13 2-8 11h6l-1 9 8-12h-6l1-8Z" />,
    flame: <path d="M12 22c4.1 0 7-2.9 7-7.2 0-3.4-2-6.4-5.8-9.8.2 3-1.5 4.2-2.5 2C9.3 8.8 5 11.2 5 15.3 5 19.2 7.9 22 12 22Z" />,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function AvatarArt({ avatar, evolved = false }: { avatar: string; evolved?: boolean }) {
  return <img className="avatar-img" src={`/avatars/${avatar}-${evolved ? 'evolved' : 'starter'}.png`} alt={`${evolved ? 'Evolved' : 'Starter'} ${avatar} avatar`} />
}

export default function FlexiApp({ players }: { players: LeaderboardPlayer[] }) {
  const economy = useCoinEconomy()
  const [showAccount, setShowAccount] = useState(false)
  const [showWorkout, setShowWorkout] = useState(false)
  const [tab, setTab] = useState<'home' | 'leaderboard' | 'profile' | 'shop'>('home')
  const workouts = economy.workouts
  const xpMax = economy.userId ? 500 : 100
  const xp = economy.train?.progress.xpIntoLevel ?? (workouts * 16) % 100
  const level = economy.train?.progress.level ?? 1 + Math.floor(workouts * 16 / 100)
  const points = economy.train?.progress.totalXp ?? workouts * 24
  const dailyStreak = economy.train?.progress.dailyStreak ?? (workouts ? 1 : 0)
  const [feedback, setFeedback] = useState<'idle' | 'workout' | 'levelup'>('idle')
  const [rankMessage, setRankMessage] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const avatar = avatars.find(value => value.key === economy.train?.profile.avatar) ?? avatars[0]
  const nextMilestone = COIN_MILESTONES.find(value => value > economy.lifetimeWorkouts)
  const evolved = level >= 5

  const ranked = useMemo(() => {
    const current: LeaderboardPlayer & { current: true } = { id: 'you', name: 'You', handle: 'flexi.athlete', points, workouts, streak: dailyStreak, avatar: avatar.key, current: true }
    return [...players, current].sort((a, b) => b.points - a.points)
  }, [players, points, workouts, dailyStreak, avatar.key])
  const rank = ranked.findIndex((player) => player.id === 'you') + 1

  const addWorkout = async (input: { title: string; durationMinutes: number }) => {
    const result = await economy.logWorkout(input)
    setShowWorkout(false)
    setRankMessage(result.coins === 50 ? `Workout ${result.ordinal} milestone! +50 coins ✦` : result.coins ? `Workout saved · +${result.coins} coins ✦` : 'Workout already saved · Wallet refreshed')
    setFeedback('idle')
    requestAnimationFrame(() => setFeedback('workout'))
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { setFeedback('idle'); setRankMessage('') }, 3500)
  }

  return <div className="app-shell">
    <header className="topbar"><Brand /><div className="topbar-account"><button className="header-coins" onClick={() => setTab('shop')}>✦ {economy.coins.toLocaleString()}<span> coins</span></button><button className="economy-link" onClick={() => { if (economy.userId) void flexiAPI.logout().catch(() => setRankMessage('Unable to sign out. Please retry.')); else setShowAccount(true) }}>{economy.userId ? 'Sign out' : 'Sign in'}</button><button className="mini-profile" onClick={() => setTab('profile')}><AvatarArt avatar={avatar.key} /></button></div></header>
    {rankMessage && <div className="rank-toast" role="status"><Icon name="trophy" />{rankMessage}</div>}
    <main className="tab-content">
      {economy.error && <div className="economy-alert" role="alert">{economy.error}<button onClick={() => { void economy.refresh() }}>Retry</button></div>}
      {economy.paymentMessage && <div className="economy-alert" role="status">{economy.paymentMessage}{economy.pendingOrder && <button onClick={() => { void economy.checkPayment(economy.pendingOrder!) }}>Check payment</button>}</div>}
      {!economy.ready && !economy.error && <p role="status">Loading your wallet…</p>}
      {tab === 'home' && <section className="workout-wallet"><div><span className="eyebrow">YOUR COIN WALLET</span><h2>✦ {economy.coins.toLocaleString()} coins</h2><p>Earn 10 coins per workout. Entries 25, 50, 75 & 100 earn 50 coins each.</p><small>{economy.userId ? 'Saved to your account' : 'Demo wallet · Saved on this device'}</small></div><div>{nextMilestone ? <><b>{economy.lifetimeWorkouts} / {nextMilestone}</b><span>Next 50-coin milestone</span></> : <><b>All four milestones earned!</b><span>Keep going for 10 coins per entry.</span></>}<button onClick={() => setTab('shop')}>Visit the shop ↗</button></div></section>}

      <div hidden={tab !== 'shop'}><ShopTab key={economy.userId ?? 'demo'} avatar={avatar.key} evolved={evolved} economy={economy} onSignIn={() => setShowAccount(true)} /></div>
      {tab === 'home' && <HomeTab avatar={avatar} evolved={evolved} level={level} xp={xp} xpMax={xpMax} dailyStreak={dailyStreak} disabled={!economy.ready || economy.busy} workouts={workouts} points={points} feedback={feedback} rank={rank} onWorkout={() => setShowWorkout(true)} />}
      {tab === 'leaderboard' && <LeaderboardTab ranked={ranked} />}
      {tab === 'profile' && <ProfileTab avatar={avatar} level={level} xp={xp} xpMax={xpMax} workouts={workouts} points={points} rank={rank} />}
    </main>
    {showAccount && <AccountDialog onClose={() => setShowAccount(false)} />}
    {showWorkout && <WorkoutDialog key={economy.userId ?? 'demo'} pending={economy.pendingWorkout} busy={economy.busy} onSave={addWorkout} onClose={() => setShowWorkout(false)} />}
    <nav className="bottom-tabs" aria-label="Primary navigation">
      {(['home', 'leaderboard', 'profile', 'shop'] as const).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}><Icon name={item === 'leaderboard' ? 'trophy' : item === 'profile' ? 'user' : item === 'shop' ? 'shop' : 'home'} /><span>{item === 'home' ? 'Train' : item[0].toUpperCase() + item.slice(1)}</span></button>)}
    </nav>
  </div>
}

function Brand() { return <div className="brand">FLEXI</div> }

function HomeTab({ avatar, evolved, level, xp, xpMax, dailyStreak, disabled, workouts, points, feedback, rank, onWorkout }: { avatar: typeof avatars[number]; evolved: boolean; level: number; xp: number; xpMax: number; dailyStreak: number; disabled: boolean; workouts: number; points: number; feedback: string; rank: number; onWorkout: () => void }) {
  return <><section className="hero-card">
    <div className="hero-copy"><span className="eyebrow">LEVEL {level} · {evolved ? 'POWERED UP' : 'RISING ROOKIE'}</span><h1>Keep showing up,<br /><em>keep growing.</em></h1><p>{evolved ? `${avatar.name} evolved! Keep training to master this stronger form.` : `${avatar.name} is getting stronger with every rep.`}</p><div className="progress-label"><span>Level progress</span><b>{xp} / {xpMax} XP</b></div><div className="progress"><i style={{ width: `${xp / xpMax * 100}%` }} /></div><button className="primary" disabled={disabled} onClick={onWorkout}><Icon name="plus" />Log a workout</button></div>
    <div className={`avatar-stage ${feedback}`}><span className="xp-pop">WORKOUT SAVED</span><span className="level-pop">LEVEL UP</span><AvatarArt avatar={avatar.key} evolved={evolved} /><div className="level-chip"><small>LVL</small><b>{level}</b></div></div>
  </section>
  <section className="stat-grid"><article><Icon name="flame" /><div><b>{dailyStreak} {dailyStreak === 1 ? 'day' : 'days'}</b><span>Current streak</span></div></article><article><Icon name="bolt" /><div><b>{workouts}</b><span>Total workouts</span></div></article><article><Icon name="trophy" /><div><b>#{rank}</b><span>Global rank</span></div></article></section>
  <section className="rank-card"><div><span className="eyebrow">GLOBAL LEAGUE</span><h2>You&apos;re at #{rank} with {points.toLocaleString()} points</h2><p>Log workouts to pass the athletes ahead of you.</p></div><Icon name="trophy" /></section></>
}

function LeaderboardTab({ ranked }: { ranked: Array<LeaderboardPlayer & { current?: true }> }) {
  return <section className="page-panel"><div className="page-heading"><span className="eyebrow">GLOBAL LEADERBOARD</span><h1>Flexi League</h1><p>Every logged workout earns points and moves you closer to the top.</p></div><div className="podium">{ranked.slice(0, 3).map((player, index) => <div key={player.id} className={`podium-player place-${index + 1}`}><span>#{index + 1}</span><div className="leader-avatar"><AvatarArt avatar={player.avatar} /></div><b>{player.name}</b><small>{player.points.toLocaleString()} pts</small></div>)}</div><div className="leader-list">{ranked.slice(3).map((player, index) => <article key={player.id} className={player.current ? 'current' : ''}><b className="rank-number">{index + 4}</b><div className="list-avatar"><AvatarArt avatar={player.avatar} /></div><div className="leader-name"><b>{player.name}{player.current && <span>YOU</span>}</b><small>@{player.handle} · {player.streak} day streak</small></div><strong>{player.points.toLocaleString()}<small> pts</small></strong></article>)}</div></section>
}

function ProfileTab({ avatar, level, xp, xpMax, workouts, points, rank }: { avatar: typeof avatars[number]; level: number; xp: number; xpMax: number; workouts: number; points: number; rank: number }) {
  return <section className="page-panel profile-page"><div className="profile-hero"><div className="profile-avatar"><AvatarArt avatar={avatar.key} evolved={level >= 5} /></div><span className="level-badge">LEVEL {level}</span><h1>Flexi Athlete</h1><p>@flexi.athlete · Training with {avatar.name}</p></div><div className="profile-stats"><article><b>{points.toLocaleString()}</b><span>Total points</span></article><article><b>{workouts}</b><span>Workouts</span></article><article><b>#{rank}</b><span>Global rank</span></article></div><div className="profile-card"><div><span className="eyebrow">CURRENT LEVEL</span><h2>{xp} XP earned</h2></div><b>{xpMax - xp} XP to go</b><div className="progress"><i style={{ width: `${xp / xpMax * 100}%` }} /></div></div></section>
}
