import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  allPages,
  eventOnDay,
  googleCalendarURL,
  localDateTime,
  monthRange,
  zonedInstant,
} from '../../src/lib/frontend-data.ts'
import { onboardingInput, workoutInput, calendarInput } from '../../src/backend/domain.ts'
import type { CalendarEvent } from '../../src/backend/data.ts'

test('frontend consumes every page, including history beyond a preview', async () => {
  const visited: number[] = []
  const docs = await allPages(async (page) => {
    visited.push(page)
    return { docs: [page], page, totalDocs: 3, totalPages: 3, hasNextPage: page < 3 }
  })
  assert.deepEqual(visited, [1, 2, 3])
  assert.deepEqual(docs, [1, 2, 3])
  await assert.rejects(
    allPages(async (page) => ({ docs: [], page, totalDocs: 1, totalPages: 2, hasNextPage: true })),
    /remaining records/,
  )
})
test('wall-clock inputs respect account timezone and daylight saving transitions', () => {
  assert.equal(zonedInstant('2026-11-14T18:30', 'America/New_York'), '2026-11-14T23:30:00.000Z')
  assert.equal(zonedInstant('2026-07-14T18:30', 'America/New_York'), '2026-07-14T22:30:00.000Z')
  assert.equal(zonedInstant('2026-11-14T18:30', 'Asia/Kolkata'), '2026-11-14T13:00:00.000Z')
  assert.throws(() => zonedInstant('2026-03-08T02:30', 'America/New_York'), /clocks change/)
  assert.throws(() => zonedInstant('2026-02-30T12:00', 'UTC'), /valid date/)
  assert.equal(
    localDateTime(new Date('2026-11-14T04:00:00Z'), 'America/New_York'),
    '2026-11-13T23:00',
  )
  const range = monthRange('2026-03', 'America/New_York')
  assert.deepEqual(range, { from: '2026-03-01T05:00:00.000Z', to: '2026-04-01T04:00:00.000Z' })
})
const event: CalendarEvent = {
  id: 'test',
  owner: 'test',
  title: 'Gym & stretch',
  startsAt: '2026-11-15T04:30:00Z',
  endsAt: '2026-11-15T05:30:00Z',
  timezone: 'America/New_York',
  notes: 'Bring water',
  status: 'planned',
  createdAt: '2026-11-14T12:00:00Z',
  workoutType: 'mobility',
  requestId: 'test-request',
}
test('calendar marks overlapping local days and exports valid Google timestamps', () => {
  assert.equal(eventOnDay(event, '2026-11-14', event.timezone), true)
  assert.equal(eventOnDay(event, '2026-11-15', event.timezone), true)
  assert.equal(
    eventOnDay({ ...event, endsAt: '2026-11-15T05:00:00Z' }, '2026-11-15', event.timezone),
    false,
  )
  const url = new URL(googleCalendarURL(event))
  assert.equal(url.searchParams.get('dates'), '20261115T043000Z/20261115T053000Z')
  assert.equal(url.searchParams.get('text'), event.title)
})
test('new form validators reject forged or malformed fields', () => {
  const workout = {
    requestId: 'new-workout-123',
    title: 'Gym',
    durationMinutes: 30,
    activity: 'strength',
    intensity: 'moderate',
    focusArea: 'arms',
    performedAt: '2025-01-01T23:00:00-05:00',
  }
  assert.equal(workoutInput(workout).performedAt, '2025-01-02T04:00:00.000Z')
  for (const extra of [
    { activity: 'admin' },
    { intensity: null },
    { focusArea: 'head' },
    { performedAt: '2999-01-01T00:00:00Z' },
    { owner: 'other' },
  ])
    assert.throws(() => workoutInput({ ...workout, ...extra }))
  const preferences = {
    goals: ['stay-consistent'],
    experienceLevel: 'beginner',
    weeklyGoal: 3,
    preferredTime: 'flexible',
    calendarProvider: 'none',
  }
  assert.equal(onboardingInput(preferences).weeklyGoal, 3)
  for (const extra of [
    { goals: [] },
    { goals: ['admin'] },
    { weeklyGoal: 8 },
    { calendarProvider: 'connected' },
    { xp: 100 },
  ])
    assert.throws(() => onboardingInput({ ...preferences, ...extra }))
  assert.throws(() =>
    calendarInput({
      title: 'Gym',
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timezone: event.timezone,
      requestId: 'bad',
      workoutType: 'strength',
    }),
  )
})
