'use client'

import { useMemo, useRef, useState } from 'react'

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

type IconName = 'home' | 'trophy' | 'user' | 'plus' | 'bolt' | 'flame'

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
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
  const [avatarIndex] = useState(0)
  const [tab, setTab] = useState<'home' | 'leaderboard' | 'profile'>('home')
  const [xp, setXp] = useState(68)
  const [level, setLevel] = useState(4)
  const [workouts, setWorkouts] = useState(12)
  const [points, setPoints] = useState(752)
  const [feedback, setFeedback] = useState<'idle' | 'workout' | 'levelup'>('idle')
  const [rankMessage, setRankMessage] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const avatar = avatars[avatarIndex]
  const evolved = level >= 5

  const ranked = useMemo(() => {
    const current: LeaderboardPlayer & { current: true } = { id: 'you', name: 'You', handle: 'flexi.athlete', points, workouts, streak: 6, avatar: avatar.key, current: true }
    return [...players, current].sort((a, b) => b.points - a.points)
  }, [players, points, workouts, avatar.key])
  const rank = ranked.findIndex((player) => player.id === 'you') + 1

  const addWorkout = () => {
    const oldRank = rank
    const nextXp = xp + 16
    const leveledUp = nextXp >= 100
    const nextPoints = points + 24
    const nextRank = [...players, { points: nextPoints }].sort((a, b) => b.points - a.points).findIndex((player) => 'points' in player && player.points === nextPoints) + 1
    setXp(leveledUp ? nextXp - 100 : nextXp)
    if (leveledUp) setLevel((value) => value + 1)
    setPoints(nextPoints)
    setWorkouts((value) => value + 1)
    setRankMessage(nextRank < oldRank ? `You moved up to #${nextRank}!` : 'Workout logged · +24 points')
    setFeedback('idle')
    requestAnimationFrame(() => setFeedback(leveledUp ? 'levelup' : 'workout'))
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { setFeedback('idle'); setRankMessage('') }, 2200)
  }

  return <div className="app-shell">
    <header className="topbar"><Brand /><button className="mini-profile" onClick={() => setTab('profile')}><AvatarArt avatar={avatar.key} /></button></header>
    {rankMessage && <div className="rank-toast"><Icon name="trophy" />{rankMessage}</div>}
    <main className="tab-content">
      {tab === 'home' && <HomeTab avatar={avatar} evolved={evolved} level={level} xp={xp} workouts={workouts} points={points} feedback={feedback} rank={rank} onWorkout={addWorkout} />}
      {tab === 'leaderboard' && <LeaderboardTab ranked={ranked} />}
      {tab === 'profile' && <ProfileTab avatar={avatar} level={level} xp={xp} workouts={workouts} points={points} rank={rank} />}
    </main>
    <nav className="bottom-tabs" aria-label="Primary navigation">
      {(['home', 'leaderboard', 'profile'] as const).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}><Icon name={item === 'leaderboard' ? 'trophy' : item === 'profile' ? 'user' : 'home'} /><span>{item === 'home' ? 'Train' : item[0].toUpperCase() + item.slice(1)}</span></button>)}
    </nav>
  </div>
}

function Brand() { return <div className="brand">FLEXI</div> }

function HomeTab({ avatar, evolved, level, xp, workouts, points, feedback, rank, onWorkout }: { avatar: typeof avatars[number]; evolved: boolean; level: number; xp: number; workouts: number; points: number; feedback: string; rank: number; onWorkout: () => void }) {
  return <><section className="hero-card">
    <div className="hero-copy"><span className="eyebrow">LEVEL {level} · {evolved ? 'POWERED UP' : 'RISING ROOKIE'}</span><h1>Keep showing up,<br /><em>keep growing.</em></h1><p>{evolved ? `${avatar.name} evolved! Keep training to master this stronger form.` : `${avatar.name} is getting stronger with every rep.`}</p><div className="progress-label"><span>Level progress</span><b>{xp} / 100 XP</b></div><div className="progress"><i style={{ width: `${xp}%` }} /></div><button className="primary" onClick={onWorkout}><Icon name="plus" />Log a workout</button></div>
    <div className={`avatar-stage ${feedback}`}><span className="xp-pop">+16 XP</span><span className="level-pop">LEVEL UP</span><AvatarArt avatar={avatar.key} evolved={evolved} /><div className="level-chip"><small>LVL</small><b>{level}</b></div></div>
  </section>
  <section className="stat-grid"><article><Icon name="flame" /><div><b>6 days</b><span>Current streak</span></div></article><article><Icon name="bolt" /><div><b>{workouts}</b><span>Total workouts</span></div></article><article><Icon name="trophy" /><div><b>#{rank}</b><span>Global rank</span></div></article></section>
  <section className="rank-card"><div><span className="eyebrow">GLOBAL LEAGUE</span><h2>You&apos;re at #{rank} with {points.toLocaleString()} points</h2><p>Log workouts to pass the athletes ahead of you.</p></div><Icon name="trophy" /></section></>
}

function LeaderboardTab({ ranked }: { ranked: Array<LeaderboardPlayer & { current?: true }> }) {
  return <section className="page-panel"><div className="page-heading"><span className="eyebrow">GLOBAL LEADERBOARD</span><h1>Flexi League</h1><p>Every logged workout earns points and moves you closer to the top.</p></div><div className="podium">{ranked.slice(0, 3).map((player, index) => <div key={player.id} className={`podium-player place-${index + 1}`}><span>#{index + 1}</span><div className="leader-avatar"><AvatarArt avatar={player.avatar} /></div><b>{player.name}</b><small>{player.points.toLocaleString()} pts</small></div>)}</div><div className="leader-list">{ranked.slice(3).map((player, index) => <article key={player.id} className={player.current ? 'current' : ''}><b className="rank-number">{index + 4}</b><div className="list-avatar"><AvatarArt avatar={player.avatar} /></div><div className="leader-name"><b>{player.name}{player.current && <span>YOU</span>}</b><small>@{player.handle} · {player.streak} day streak</small></div><strong>{player.points.toLocaleString()}<small> pts</small></strong></article>)}</div></section>
}

function ProfileTab({ avatar, level, xp, workouts, points, rank }: { avatar: typeof avatars[number]; level: number; xp: number; workouts: number; points: number; rank: number }) {
  return <section className="page-panel profile-page"><div className="profile-hero"><div className="profile-avatar"><AvatarArt avatar={avatar.key} evolved={level >= 5} /></div><span className="level-badge">LEVEL {level}</span><h1>Flexi Athlete</h1><p>@flexi.athlete · Training with {avatar.name}</p></div><div className="profile-stats"><article><b>{points.toLocaleString()}</b><span>Total points</span></article><article><b>{workouts}</b><span>Workouts</span></article><article><b>#{rank}</b><span>Global rank</span></article></div><div className="profile-card"><div><span className="eyebrow">CURRENT LEVEL</span><h2>{xp} XP earned</h2></div><b>{100 - xp} XP to go</b><div className="progress"><i style={{ width: `${xp}%` }} /></div></div></section>
}
