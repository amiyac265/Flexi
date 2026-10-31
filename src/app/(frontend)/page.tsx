import config from '@payload-config'
import { getPayload } from 'payload'
import FlexiApp, { type LeaderboardPlayer } from './FlexiApp'

export default async function HomePage() {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'leaderboard-entries',
    limit: 20,
    sort: '-points',
    overrideAccess: false,
  })

  const players: LeaderboardPlayer[] = result.docs.map((player) => ({
    id: String(player.id),
    name: player.displayName,
    handle: player.handle,
    points: player.points,
    workouts: player.workouts,
    streak: player.streak,
    avatar: player.avatar,
  }))

  return <FlexiApp players={players} />
}
