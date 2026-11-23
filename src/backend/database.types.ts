// SQL contract for the versioned migrations in supabase/migrations.
// Replace with `supabase gen types typescript --linked` after project setup if desired.
import type { Avatar, LoggedExercise, Equipment, OnboardingInput, WorkoutInput, CalendarInput } from './domain.ts'
export type ProfileRow = { id: string; friend_code: string; display_name: string; avatar: Avatar; timezone: string; weekly_goal: number; equipped_cosmetic_id: string | null; created_at: string; goals: OnboardingInput['goals']; experience_level: OnboardingInput['experienceLevel']; preferred_time: OnboardingInput['preferredTime']; calendar_provider: OnboardingInput['calendarProvider']; onboarding_completed: boolean; equipped_cosmetics: Equipment }
export type WorkoutRow = { id: string; owner: string; request_id: string; title: string; duration_minutes: number; notes: string; exercises: LoggedExercise[]; completed_at: string; local_date: string; status: 'completed' | 'voided'; voided_at: string | null; coin_reward: number; activity: NonNullable<WorkoutInput['activity']>; intensity: NonNullable<WorkoutInput['intensity']> | null; focus_area: NonNullable<WorkoutInput['focusArea']>; performed_at: string; distance: number | null; distance_unit: NonNullable<WorkoutInput['distanceUnit']> | null; sport_type: NonNullable<WorkoutInput['sport']> | null }
export type CalendarRow = { id: string; owner: string; title: string; starts_at: string; ends_at: string; timezone: string; notes: string; status: 'planned' | 'completed' | 'cancelled'; created_at: string; workout_type: NonNullable<CalendarInput['workoutType']>; request_id: string | null }
export type ContentRow = { id: string; slug: string; title: string; kind: 'news' | 'tutorial'; summary: string; body: string | null; source_url: string | null; image_url: string | null; status: 'draft' | 'published'; published_at: string }
export type CosmeticRow = { id: string; slug: string; name: string; description: string | null; slot: 'hat' | 'outfit' | 'accessory' | 'top' | 'bottom' | 'shoes' | 'background'; minimum_level: number; coin_price: number; active: boolean; image_url: string | null; category: 'clothing' | 'accessories' | 'backgrounds' | 'special'; style_key: string; primary_color: string; accent_color: string }
export type InventoryRow = { id: string; owner: string; item: string; acquired_at: string }
export type LeaderboardRow = { id: string; display_name: string; handle: string; points: number; workouts: number; streak: number; avatar: Avatar }
export type FriendshipRow = { user_low: string; user_high: string; created_at: string }
export type Friend = { id: string; displayName: string; avatar: Avatar; addedAt: string }
export type Friends = { code: string; friends: Friend[] }
export type AddFriendResult = { friend: Friend; replayed: boolean }
export type ProgressDay = { local_date: string; workouts: number; minutes: number }
export type Wallet = { balance: number; lifetimeWorkouts: number }
export type CoinPackRow = { id: string; coins: number; amount_cents: number; currency: string; active: boolean }
export type CoinOrderRow = { id: string; owner: string; request_id: string; pack_id: string; coins: number; amount_cents: number; currency: string; status: 'pending' | 'paid'; checkout_session_id: string | null; created_at: string; paid_at: string | null }
type Table<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] }
type Mutation<T> = { Args: { p_input: Record<string, unknown> }; Returns: T }
export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow>; workout_logs: Table<WorkoutRow>; calendar_events: Table<CalendarRow>;
      training_content: Table<ContentRow>; cosmetic_items: Table<CosmeticRow>; user_cosmetics: Table<InventoryRow>;
      leaderboard_entries: Table<LeaderboardRow>; friendships: Table<FriendshipRow>;
      coin_wallets: Table<{ owner: string; balance: number; lifetime_workouts: number }>;
      coin_packs: Table<CoinPackRow>; coin_orders: Table<CoinOrderRow>
    }
    Views: Record<never, never>
    Functions: {
      flexi_friends: { Args: Record<never, never>; Returns: Friends }
      flexi_add_friend: Mutation<AddFriendResult>
      flexi_wallet: { Args: Record<never, never>; Returns: Wallet }
      flexi_create_coin_order: { Args: { p_pack: string; p_request_id: string }; Returns: CoinOrderRow }
      flexi_log_workout: Mutation<{ workout: WorkoutRow; replayed: boolean }>
      flexi_void_workout: { Args: { p_id: string }; Returns: WorkoutRow }
      flexi_update_profile: Mutation<ProfileRow>
      flexi_save_onboarding: Mutation<ProfileRow>
      flexi_create_calendar: Mutation<CalendarRow>
      flexi_update_calendar: { Args: { p_id: string; p_input: Record<string, unknown> }; Returns: CalendarRow }
      flexi_claim_cosmetic: { Args: { p_id: string }; Returns: { inventory: InventoryRow; replayed: boolean; wallet: Wallet } }
      flexi_progress_days: { Args: Record<never, never>; Returns: ProgressDay[] }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}
