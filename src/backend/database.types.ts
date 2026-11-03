// SQL contract for supabase/migrations/20261102000000_flexi_core.sql.
// Replace with `supabase gen types typescript --linked` after project setup if desired.
import type { Avatar, LoggedExercise } from './domain.ts'
export type ProfileRow = { id: string; display_name: string; avatar: Avatar; timezone: string; weekly_goal: number; equipped_cosmetic_id: string | null; created_at: string }
export type WorkoutRow = { id: string; owner: string; request_id: string; title: string; duration_minutes: number; notes: string; exercises: LoggedExercise[]; completed_at: string; local_date: string; status: 'completed' | 'voided'; voided_at: string | null }
export type CalendarRow = { id: string; owner: string; title: string; starts_at: string; ends_at: string; timezone: string; notes: string; status: 'planned' | 'completed' | 'cancelled'; created_at: string }
export type ContentRow = { id: string; slug: string; title: string; kind: 'news' | 'tutorial'; summary: string; body: string | null; source_url: string | null; image_url: string | null; status: 'draft' | 'published'; published_at: string }
export type CosmeticRow = { id: string; slug: string; name: string; description: string | null; slot: 'hat' | 'outfit' | 'accessory'; minimum_level: number; active: boolean; image_url: string | null }
export type InventoryRow = { id: string; owner: string; item: string; acquired_at: string }
export type LeaderboardRow = { id: string; display_name: string; handle: string; points: number; workouts: number; streak: number; avatar: Avatar }
export type ProgressDay = { local_date: string; workouts: number; minutes: number }
type Table<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] }
type Mutation<T> = { Args: { p_input: Record<string, unknown> }; Returns: T }
export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow>; workout_logs: Table<WorkoutRow>; calendar_events: Table<CalendarRow>;
      training_content: Table<ContentRow>; cosmetic_items: Table<CosmeticRow>; user_cosmetics: Table<InventoryRow>;
      leaderboard_entries: Table<LeaderboardRow>
    }
    Views: Record<never, never>
    Functions: {
      flexi_log_workout: Mutation<{ workout: WorkoutRow; replayed: boolean }>
      flexi_void_workout: { Args: { p_id: string }; Returns: WorkoutRow }
      flexi_update_profile: Mutation<ProfileRow>
      flexi_create_calendar: Mutation<CalendarRow>
      flexi_update_calendar: { Args: { p_id: string; p_input: Record<string, unknown> }; Returns: CalendarRow }
      flexi_claim_cosmetic: { Args: { p_id: string }; Returns: { inventory: InventoryRow; replayed: boolean } }
      flexi_progress_days: { Args: Record<never, never>; Returns: ProgressDay[] }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}
