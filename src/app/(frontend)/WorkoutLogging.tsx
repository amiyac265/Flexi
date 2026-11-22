'use client'

import type { FormEvent } from 'react'
import { workoutInput, type WorkoutInput } from '@/backend/domain'
import { localDateTime, zonedInstant } from '@/lib/frontend-data'
import { Icon, type IconName } from './Icon'
import { useDialog } from './use-dialog'
import { StrengthExerciseBuilder } from './StrengthExerciseBuilder'

export type WorkoutType = 'weight' | 'cardio' | 'sport'

export function workoutInputFromForm(data: FormData, zone: string) {
  const intensity = String(data.get('intensity') ?? '')
  const focusArea = String(data.get('focusArea') ?? '')
  const distance = String(data.get('distance') ?? '')
  const distanceUnit = String(data.get('distanceUnit') ?? '')
  const sport = String(data.get('sport') ?? '')
  const strengthExercises = String(data.get('strengthExercises') ?? '')
  let exercises: unknown[] | undefined
  if (strengthExercises) {
    try {
      exercises = JSON.parse(strengthExercises) as unknown[]
    } catch {
      throw new Error('Check the strength exercises and try again.')
    }
  }
  return workoutInput({
    requestId: crypto.randomUUID(),
    title: data.get('title'),
    activity: data.get('activity'),
    ...(intensity ? { intensity } : {}),
    ...(focusArea ? { focusArea } : {}),
    ...(distance && distanceUnit ? { distance: Number(distance), distanceUnit } : {}),
    ...(sport ? { sport } : {}),
    ...(exercises ? { exercises } : {}),
    durationMinutes: Number(data.get('duration')),
    performedAt: zonedInstant(String(data.get('performedAt')), zone),
    notes: String(data.get('notes') ?? ''),
  })
}

const workoutTypes: Array<{
  type: WorkoutType
  title: string
  description: string
  icon: IconName
}> = [
  {
    type: 'weight',
    title: 'Weight',
    description: 'Strength training, lifting, and resistance work',
    icon: 'weight',
  },
  {
    type: 'cardio',
    title: 'Cardio',
    description: 'Running, walking, cycling, and conditioning',
    icon: 'cardio',
  },
  {
    type: 'sport',
    title: 'Sport',
    description: 'Games, practices, matches, and team activities',
    icon: 'sport',
  },
]

const cardioActivities = [
  ['walking', 'Walking'],
  ['running', 'Running'],
  ['cycling', 'Cycling'],
  ['rowing', 'Rowing'],
  ['swimming', 'Swimming'],
  ['elliptical', 'Elliptical'],
  ['stair-climber', 'Stair climber'],
  ['hiking', 'Hiking'],
  ['jump-rope', 'Jump rope'],
] as const

const sportTypes = [
  ['basketball', 'Basketball'],
  ['soccer', 'Soccer'],
  ['football', 'Football'],
  ['tennis', 'Tennis'],
  ['volleyball', 'Volleyball'],
  ['baseball-softball', 'Baseball / softball'],
  ['hockey', 'Hockey'],
  ['golf', 'Golf'],
  ['pickleball', 'Pickleball'],
  ['other', 'Other'],
] as const

function defaultWorkoutTitle(type: WorkoutType, zone: string) {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date()),
  )
  const period = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'
  const activity = type === 'weight' ? 'lift' : type === 'cardio' ? 'cardio' : 'game'
  return `${period} ${activity}`
}

export function isCardioActivity(activity?: string) {
  return cardioActivities.some(([value]) => value === activity)
}

export function WorkoutTypeModal({
  onClose,
  onSelect,
}: {
  onClose: () => void
  onSelect: (type: WorkoutType) => void
}) {
  const dialog = useDialog(false, onClose)
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        className="workout-modal workout-type-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workout-type-title"
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">LOG A WORKOUT</span>
            <h2 id="workout-type-title">What did you do?</h2>
            <p>Choose a workout type to get started.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close workout type picker">
            ×
          </button>
        </div>
        <div className="workout-type-grid">
          {workoutTypes.map((option) => (
            <button key={option.type} type="button" onClick={() => onSelect(option.type)}>
              <span className={`workout-type-icon ${option.type}`}>
                <Icon name={option.icon} />
              </span>
              <span>
                <b>{option.title}</b>
                <small>{option.description}</small>
              </span>
              <span className="workout-type-arrow" aria-hidden="true">
                →
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

export function WorkoutModal({
  pending,
  draft,
  type,
  zone,
  error,
  onClose,
  onSubmit,
}: {
  pending: boolean
  draft: WorkoutInput | null
  type: WorkoutType
  zone: string
  error: string
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const dialog = useDialog(pending, onClose)
  const cardio = type === 'cardio' || isCardioActivity(draft?.activity)
  const sport = type === 'sport' || draft?.activity === 'sports'
  const strength = type === 'weight' || draft?.activity === 'strength'
  const effectiveType: WorkoutType = cardio ? 'cardio' : sport ? 'sport' : 'weight'
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
        className={`workout-modal ${strength ? 'strength-modal' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Log workout"
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">
              {cardio ? 'CARDIO' : sport ? 'SPORT' : strength ? 'STRENGTH' : 'ADD ACTIVITY'}
            </span>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            aria-label="Close workout form"
          >
            ×
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <fieldset disabled={pending || Boolean(draft)}>
            <div className="full-field workout-name-field">
              <input
                name="title"
                aria-label="Workout title"
                defaultValue={draft?.title ?? defaultWorkoutTitle(effectiveType, zone)}
                maxLength={120}
                required
              />
            </div>
            {strength ? (
              <>
                <input type="hidden" name="activity" value="strength" />
                <StrengthExerciseBuilder draft={draft} />
              </>
            ) : sport ? (
              <>
                <input type="hidden" name="activity" value="sports" />
                <label className="full-field">
                  <span>Sport</span>
                  <select name="sport" defaultValue={draft?.sport ?? 'basketball'} required>
                    {sportTypes.map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <label className="full-field">
                <span>Activity</span>
                <select
                  name="activity"
                  defaultValue={draft?.activity ?? (cardio ? 'walking' : 'strength')}
                  required
                >
                  {cardio ? (
                    cardioActivities.map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="strength">Strength training</option>
                      <option value="yoga">Yoga or mobility</option>
                      <option value="other">Other activity</option>
                    </>
                  )}
                </select>
              </label>
            )}
            <div className="field-row">
              <label>
                <span>Duration</span>
                <div className="input-suffix">
                  <input
                    name="duration"
                    type="number"
                    min="1"
                    max="1440"
                    defaultValue={draft?.durationMinutes ?? 30}
                    required
                  />
                  <small>min</small>
                </div>
              </label>
              {cardio ? (
                <label>
                  <span>Distance</span>
                  <div className="distance-input">
                    <input
                      name="distance"
                      type="number"
                      min="0.001"
                      max="10000"
                      step="0.001"
                      defaultValue={draft?.distance ?? ''}
                      placeholder="3.1"
                      required
                    />
                    <select
                      name="distanceUnit"
                      defaultValue={draft?.distanceUnit ?? 'mi'}
                      aria-label="Distance unit"
                      required
                    >
                      <option value="mi">mi</option>
                      <option value="km">km</option>
                      <option value="m">m</option>
                      <option value="yd">yd</option>
                    </select>
                  </div>
                </label>
              ) : sport || strength ? (
                <label>
                  <span>
                    Intensity <small>optional</small>
                  </span>
                  <select name="intensity" defaultValue={draft?.intensity ?? ''}>
                    <option value=""></option>
                    <option value="light">Light</option>
                    <option value="moderate">Moderate</option>
                    <option value="intense">Intense</option>
                  </select>
                </label>
              ) : (
                <label>
                  <span>Intensity</span>
                  <select name="intensity" defaultValue={draft?.intensity ?? 'moderate'} required>
                    <option value="light">Light</option>
                    <option value="moderate">Moderate</option>
                    <option value="intense">Intense</option>
                  </select>
                </label>
              )}
            </div>
            {cardio ? (
              <label className="full-field">
                <span>
                  Intensity <small>optional</small>
                </span>
                <select name="intensity" defaultValue={draft?.intensity ?? ''}>
                  <option value=""></option>
                  <option value="light">Light</option>
                  <option value="moderate">Moderate</option>
                  <option value="intense">Intense</option>
                </select>
              </label>
            ) : sport || strength ? null : (
              <label className="full-field">
                <span>Area trained</span>
                <select name="focusArea" defaultValue={draft?.focusArea ?? 'arms'} required>
                  <option value="arms">Arms</option>
                  <option value="chest">Chest</option>
                  <option value="legs">Legs</option>
                  <option value="full-body">Full body</option>
                </select>
              </label>
            )}
            <label className="full-field">
              <span>Date & time</span>
              <input
                name="performedAt"
                type="datetime-local"
                defaultValue={localDateTime(
                  draft?.performedAt ? new Date(draft.performedAt) : new Date(),
                  zone,
                )}
                max={localDateTime(new Date(), zone)}
                required
              />
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
                placeholder="How did the workout feel?"
              />
            </label>
          </fieldset>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {draft && !pending && (
            <p className="status-notice">
              Your submission is saved in this tab. Retry it to confirm the outcome without creating
              a duplicate.
            </p>
          )}
          <div className="reward-preview">
            <Icon name="bolt" />
            <div>
              <b>100 XP for each active day</b>
              <span>
                Additional workouts on the same day add to your history. Every 500 XP earns a new
                level.
              </span>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary" disabled={pending} onClick={onClose}>
              Close
            </button>
            <button type="submit" className="primary save-workout" disabled={pending}>
              {pending ? 'Saving…' : draft ? 'Retry saved workout' : 'Save workout'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
