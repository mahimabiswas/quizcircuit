// A small "−  10  +" number picker.

interface StepperProps {
  /** What the number is, e.g. "questions": buttons read "Fewer questions" / "More questions". */
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}

export function Stepper({ label, value, min, max, onChange }: StepperProps) {
  const button =
    'grid size-9 place-items-center rounded-lg border border-border bg-surface-raised text-lg ' +
    'hover:border-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border'

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`Fewer ${label}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className={button}
      >
        −
      </button>
      <output aria-label={label} className="w-8 text-center font-semibold tabular-nums">
        {value}
      </output>
      <button
        type="button"
        aria-label={`More ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className={button}
      >
        +
      </button>
    </div>
  )
}
