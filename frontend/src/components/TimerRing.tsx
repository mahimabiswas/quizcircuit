// The circular countdown in the corner of the question screen.

const RADIUS = 18
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const WARNING_SECONDS = 5 // turns red for the last few seconds

interface TimerRingProps {
  secondsLeft: number
  timeLimit: number
}

export function TimerRing({ secondsLeft, timeLimit }: TimerRingProps) {
  const shown = Math.ceil(secondsLeft) // 13.2s left shows as 14, like a kitchen timer
  const fraction = timeLimit > 0 ? Math.min(1, secondsLeft / timeLimit) : 0
  const warning = secondsLeft > 0 && secondsLeft <= WARNING_SECONDS

  return (
    <div
      className={`relative grid size-12 place-items-center ${warning ? 'text-wrong' : 'text-accent'}`}
      role="timer"
      aria-label={`${shown} seconds left`}
    >
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r={RADIUS} fill="none" strokeWidth="4" className="stroke-border" />
        <circle
          cx="22"
          cy="22"
          r={RADIUS}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={CIRCUMFERENCE}
          // The ring shrinks as time runs out: hide the used-up part of the outline.
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-300 ease-linear"
        />
      </svg>
      <span className="text-sm font-semibold text-text">{shown}</span>
    </div>
  )
}
