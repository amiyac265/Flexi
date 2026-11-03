import FlexiApp, { type LeaderboardPlayer } from './FlexiApp'
import { serverSupabase } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
export const dynamic = 'force-dynamic'
export default async function HomePage() {
  let players: LeaderboardPlayer[] = []
  if (isSupabaseConfigured()) {
    const result = await serverSupabase().from('leaderboard_entries').select('*').order('points', { ascending: false }).order('id').limit(20)
    if (result.error) throw new Error('Unable to load leaderboard content. Verify that Supabase migrations have been applied.')
    players = result.data.map(player => ({ id: player.id, name: player.display_name, handle: player.handle, points: player.points, workouts: player.workouts, streak: player.streak, avatar: player.avatar }))
  }
  return <FlexiApp players={players} />
}
