/** Shared display/demo rules. Real balances are always enforced by database RPCs. */
export const COIN_MILESTONES = [25, 50, 75, 100] as const
export function workoutCoins(ordinal: number) {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) throw new Error('Workout ordinal must be a positive integer.')
  return (COIN_MILESTONES as readonly number[]).includes(ordinal) ? 50 : 10
}
export type DemoEconomy = { workouts: number; coins: number; owned: string[] }
export const EMPTY_DEMO: DemoEconomy = { workouts: 0, coins: 0, owned: [] }
export function logDemoWorkout(state: DemoEconomy): DemoEconomy {
  const workouts = state.workouts + 1
  return { ...state, workouts, coins: state.coins + workoutCoins(workouts) }
}
export function buyDemoItem(state: DemoEconomy, item: { id: string; price: number }): DemoEconomy {
  if (state.owned.includes(item.id)) return state
  if (!Number.isSafeInteger(item.price) || item.price < 0 || state.coins < item.price) throw new Error('Not enough coins for this item.')
  return { ...state, coins: state.coins - item.price, owned: [...state.owned, item.id] }
}
