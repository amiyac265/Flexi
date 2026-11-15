'use client'

import { useState } from 'react'
import type { WorkoutInput } from '@/backend/domain'
import { Icon } from './Icon'

const strengthExercisesByMuscle = {
  chest: ['Bench press', 'Incline dumbbell press', 'Chest fly', 'Push-up'],
  back: ['Lat pulldown', 'Seated cable row', 'Bent-over row', 'Pull-up'],
  shoulders: ['Overhead press', 'Lateral raise', 'Front raise', 'Reverse fly'],
  biceps: ['Barbell curl', 'Dumbbell curl', 'Hammer curl', 'Preacher curl'],
  triceps: [
    'Triceps pushdown',
    'Skull crusher',
    'Overhead triceps extension',
    'Close-grip bench press',
  ],
  legs: ['Squat', 'Leg press', 'Lunge', 'Leg extension', 'Leg curl'],
  glutes: ['Hip thrust', 'Glute bridge', 'Romanian deadlift', 'Cable kickback'],
  core: ['Plank', 'Crunch', 'Hanging leg raise', 'Russian twist'],
} as const

type StrengthMuscle = keyof typeof strengthExercisesByMuscle
type StrengthSetDraft = { reps: string; weightLb: string }
type StrengthExerciseDraft = {
  muscleGroup: StrengthMuscle | ''
  name: string
  sets: StrengthSetDraft[]
}

const emptyStrengthExercise = (): StrengthExerciseDraft => ({
  muscleGroup: '',
  name: '',
  sets: [{ reps: '', weightLb: '' }],
})

const poundsToKilograms = (pounds: number) => Math.round((pounds / 2.2046226218) * 1000) / 1000
const kilogramsToPounds = (kilograms: number) => Math.round(kilograms * 2.2046226218 * 100) / 100

function focusForMuscle(muscle: StrengthMuscle | '') {
  if (muscle === 'chest') return 'chest'
  if (muscle === 'legs' || muscle === 'glutes') return 'legs'
  if (muscle === 'core') return 'full-body'
  return 'arms'
}

export function StrengthExerciseBuilder({ draft }: { draft: WorkoutInput | null }) {
  const [strengthExercises, setStrengthExercises] = useState<StrengthExerciseDraft[]>(() => {
    const saved = draft?.exercises
      .filter(
        (exercise) => exercise.muscleGroup && exercise.setDetails && exercise.setDetails.length > 0,
      )
      .map((exercise) => ({
        muscleGroup: exercise.muscleGroup as StrengthMuscle,
        name: exercise.name,
        sets: exercise.setDetails!.map((set) => ({
          reps: String(set.reps),
          weightLb: String(kilogramsToPounds(set.weightKg)),
        })),
      }))
    return saved?.length ? saved : [emptyStrengthExercise()]
  })
  const updateStrengthExercise = (
    index: number,
    update: (exercise: StrengthExerciseDraft) => StrengthExerciseDraft,
  ) =>
    setStrengthExercises((current) =>
      current.map((exercise, itemIndex) => (itemIndex === index ? update(exercise) : exercise)),
    )
  const setStrengthSetCount = (exerciseIndex: number, requestedCount: number) => {
    if (!Number.isFinite(requestedCount)) return
    const count = Math.min(10, Math.max(1, Math.round(requestedCount)))
    updateStrengthExercise(exerciseIndex, (current) => ({
      ...current,
      sets: Array.from(
        { length: count },
        (_, index) => current.sets[index] ?? { reps: '', weightLb: '' },
      ),
    }))
  }
  return (
    <>
      <input
        type="hidden"
        name="focusArea"
        value={focusForMuscle(strengthExercises[0]?.muscleGroup ?? '')}
      />
      <input
        type="hidden"
        name="strengthExercises"
        value={JSON.stringify(
          strengthExercises.map((exercise) => ({
            name: exercise.name,
            muscleGroup: exercise.muscleGroup,
            setDetails: exercise.sets.map((set) => ({
              reps: Number(set.reps),
              weightKg: poundsToKilograms(Number(set.weightLb)),
            })),
          })),
        )}
      />
      <div className="strength-builder">
        {strengthExercises.map((exercise, exerciseIndex) => (
          <section className="strength-exercise" key={exerciseIndex}>
            <div className="strength-exercise-heading">
              <span className="eyebrow">EXERCISE {exerciseIndex + 1}</span>
              <button
                type="button"
                className="remove-exercise"
                disabled={strengthExercises.length === 1}
                onClick={() =>
                  setStrengthExercises((current) =>
                    current.filter((_, index) => index !== exerciseIndex),
                  )
                }
                aria-label={`Delete exercise ${exerciseIndex + 1}`}
              >
                Delete
              </button>
            </div>
            <div className="field-row strength-choice-row">
              <label>
                <span>Muscle group</span>
                <select
                  value={exercise.muscleGroup}
                  onChange={(event) =>
                    updateStrengthExercise(exerciseIndex, (current) => ({
                      ...current,
                      muscleGroup: event.target.value as StrengthMuscle,
                      name: '',
                    }))
                  }
                  aria-label={`Exercise ${exerciseIndex + 1} muscle group`}
                  required
                >
                  <option value="">Select muscle</option>
                  {Object.keys(strengthExercisesByMuscle).map((muscle) => (
                    <option value={muscle} key={muscle}>
                      {muscle[0].toUpperCase() + muscle.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Exercise</span>
                <select
                  value={exercise.name}
                  disabled={!exercise.muscleGroup}
                  onChange={(event) =>
                    updateStrengthExercise(exerciseIndex, (current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  aria-label={`Exercise ${exerciseIndex + 1} exercise`}
                  required
                >
                  <option value="">Select exercise</option>
                  {exercise.muscleGroup &&
                    strengthExercisesByMuscle[exercise.muscleGroup].map((name) => (
                      <option value={name} key={name}>
                        {name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="set-count-field">
              <span>Number of sets</span>
              <div className="set-stepper">
                <button
                  type="button"
                  onClick={() => setStrengthSetCount(exerciseIndex, exercise.sets.length - 1)}
                  disabled={exercise.sets.length <= 1}
                  aria-label={`Decrease exercise ${exerciseIndex + 1} sets`}
                >
                  −
                </button>
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  inputMode="numeric"
                  value={exercise.sets.length}
                  onChange={(event) =>
                    setStrengthSetCount(exerciseIndex, Number(event.target.value))
                  }
                  aria-label={`Exercise ${exerciseIndex + 1} number of sets`}
                />
                <button
                  type="button"
                  onClick={() => setStrengthSetCount(exerciseIndex, exercise.sets.length + 1)}
                  disabled={exercise.sets.length >= 10}
                  aria-label={`Increase exercise ${exerciseIndex + 1} sets`}
                >
                  +
                </button>
              </div>
            </div>
            <div className="strength-sets">
              <div className="strength-set-labels" aria-hidden="true">
                <span>Set</span>
                <span>Weight (lb)</span>
                <span>Reps</span>
              </div>
              {exercise.sets.map((set, setIndex) => (
                <div className="strength-set" key={setIndex}>
                  <b>{setIndex + 1}</b>
                  <input
                    type="number"
                    min="0"
                    max="4409"
                    step="0.1"
                    value={set.weightLb}
                    onChange={(event) =>
                      updateStrengthExercise(exerciseIndex, (current) => ({
                        ...current,
                        sets: current.sets.map((item, index) =>
                          index === setIndex ? { ...item, weightLb: event.target.value } : item,
                        ),
                      }))
                    }
                    aria-label={`Exercise ${exerciseIndex + 1} set ${setIndex + 1} weight in pounds`}
                    placeholder="0"
                    required
                  />
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    value={set.reps}
                    onChange={(event) =>
                      updateStrengthExercise(exerciseIndex, (current) => ({
                        ...current,
                        sets: current.sets.map((item, index) =>
                          index === setIndex ? { ...item, reps: event.target.value } : item,
                        ),
                      }))
                    }
                    aria-label={`Exercise ${exerciseIndex + 1} set ${setIndex + 1} reps`}
                    placeholder="10"
                    required
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
        <button
          type="button"
          className="add-exercise"
          onClick={() => setStrengthExercises((current) => [...current, emptyStrengthExercise()])}
          disabled={strengthExercises.length >= 12}
        >
          <Icon name="plus" />
          Add another exercise
        </button>
      </div>
    </>
  )
}
