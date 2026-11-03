import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addDays, calendarInput, calculateProgress, dateKey, timezone, weekStart, workoutInput } from '../../src/backend/domain.ts'

const workouts = (days: string[]) => days.map((localDate) => ({ localDate, status: 'completed', durationMinutes: 30 }))
const now = new Date('2026-11-04T18:00:00Z')

test('empty progress starts at level one with no earned XP', () => {
  const result = calculateProgress([], 'America/New_York', 3, now)
  assert.equal(result.totalXp, 0)
  assert.equal(result.level, 1)
  assert.equal(result.weeklyStreak, 0)
  assert.equal(result.lastWorkoutDate, null)
  assert.equal(result.currentWeekPending, true)
})

test('multiple workouts on the same day count as logs but award one daily reward', () => {
  const result = calculateProgress(workouts(['2026-11-02', '2026-11-02', '2026-11-04']), 'UTC', 3, now)
  assert.equal(result.totalWorkouts, 3)
  assert.equal(result.totalMinutes, 90)
  assert.equal(result.totalXp, 200)
  assert.equal(result.completedDaysThisWeek, 2)
})

test('voiding removes credit only when the final workout on a day is voided', () => {
  const logs = workouts(['2026-11-02', '2026-11-02'])
  logs[0].status = 'voided'
  assert.equal(calculateProgress(logs, 'UTC', 3, now).totalXp, 100)
  logs[1].status = 'voided'
  assert.equal(calculateProgress(logs, 'UTC', 3, now).totalXp, 0)
  logs.push(...workouts(['2026-11-02']))
  assert.equal(calculateProgress(logs, 'UTC', 3, now).totalXp, 100)
})

test('level boundaries and displayed percentage derive from earned XP', () => {
  const four = workouts(['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'])
  assert.equal(calculateProgress(four, 'UTC', 3, now).level, 1)
  assert.equal(calculateProgress(four, 'UTC', 3, now).levelProgressPercent, 80)
  const five = calculateProgress([...four, ...workouts(['2026-11-01'])], 'UTC', 3, now)
  assert.equal(five.level, 2)
  assert.equal(five.xpIntoLevel, 0)
  assert.equal(five.xpToNextLevel, 500)
})

test('unfinished current week preserves the streak ending last week', () => {
  const logs = workouts(['2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26', '2026-10-28', '2026-10-30', '2026-11-02'])
  const result = calculateProgress(logs, 'UTC', 3, now)
  assert.equal(result.weeklyStreak, 2)
  assert.equal(result.bestWeeklyStreak, 2)
  assert.equal(result.currentWeekPending, true)
  const completed = calculateProgress([...logs, ...workouts(['2026-11-03', '2026-11-04'])], 'UTC', 3, now)
  assert.equal(completed.weeklyStreak, 3)
  assert.equal(completed.currentWeekPending, false)
})

test('missing weeks break streaks instead of joining adjacent database rows', () => {
  const result = calculateProgress(workouts(['2026-10-12', '2026-10-26']), 'UTC', 1, now)
  assert.equal(result.weeklyStreak, 1)
  assert.equal(result.bestWeeklyStreak, 1)
  const later = calculateProgress(workouts(['2026-10-12', '2026-10-26']), 'UTC', 1, new Date('2026-11-10T12:00:00Z'))
  assert.equal(later.weeklyStreak, 0)
})

test('daily streak allows today to be incomplete and breaks after a missed day', () => {
  assert.equal(calculateProgress(workouts(['2026-11-02', '2026-11-03']), 'UTC', 3, now).dailyStreak, 2)
  assert.equal(calculateProgress(workouts(['2026-11-01', '2026-11-02']), 'UTC', 3, now).dailyStreak, 0)
})

test('timezone conversion handles UTC midnight, DST gaps, and folds', () => {
  assert.equal(dateKey(new Date('2026-11-02T02:00:00Z'), 'America/New_York'), '2026-11-01')
  assert.equal(dateKey(new Date('2026-03-08T07:01:00Z'), 'America/New_York'), '2026-03-08')
  assert.equal(dateKey(new Date('2026-11-01T05:30:00Z'), 'America/New_York'), '2026-11-01')
  assert.equal(dateKey(new Date('2026-11-01T06:30:00Z'), 'America/New_York'), '2026-11-01')
  assert.equal(weekStart('2027-01-01'), '2026-12-28')
  assert.equal(addDays('2024-02-28', 1), '2024-02-29')
})

test('workout validation rejects ownership/reward injection and malformed numeric data', () => {
  const valid = { requestId: 'request-1234', title: ' Training ', durationMinutes: 30 }
  assert.equal(workoutInput(valid).title, 'Training')
  for (const malicious of [{ owner: 'someone' }, { completedAt: now.toISOString() }, { xp: 999 }, { localDate: '2000-01-01' }]) {
    assert.throws(() => workoutInput({ ...valid, ...malicious }), /Unsupported fields/)
  }
  for (const value of [0, -1, 1.5, NaN, Infinity, '30']) {
    assert.throws(() => workoutInput({ ...valid, durationMinutes: value }))
  }
  assert.throws(() => workoutInput({ ...valid, exercises: [{ name: 'Squat', weightKg: NaN }] }))
  assert.throws(() => workoutInput({ ...valid, exercises: Array(31).fill({ name: 'Squat' }) }))
})

test('calendar validates explicit instants and ranges while allowing simple overlapping plans', () => {
  const valid = { title: 'Train', startsAt: '2026-11-02T18:00:00-05:00', endsAt: '2026-11-02T19:00:00-05:00', timezone: 'America/New_York' }
  assert.equal(calendarInput(valid).startsAt, '2026-11-02T23:00:00.000Z')
  assert.equal(calendarInput(valid).status, 'planned')
  assert.throws(() => calendarInput({ ...valid, endsAt: valid.startsAt }))
  assert.throws(() => calendarInput({ ...valid, startsAt: '2026-11-02T18:00:00' }))
  assert.throws(() => calendarInput({ ...valid, endsAt: '2026-11-05T19:00:00Z' }))
  assert.throws(() => timezone('Not/A_Timezone'))
})

