export const SHAPES = [
  { id: 'bolha', label: 'Bolha' },
  { id: 'nuvem', label: 'Nuvem' },
  { id: 'quadrado', label: 'Quadrado' },
  { id: 'losango', label: 'Losango' },
  { id: 'ovo', label: 'Ovo' },
  { id: 'gota', label: 'Gota' }
] as const
export type Shape = (typeof SHAPES)[number]['id']

function Body({ shape }: { shape: string }): React.JSX.Element {
  switch (shape) {
    case 'nuvem':
      return (
        <>
          <circle cx="30" cy="58" r="20" />
          <circle cx="47" cy="40" r="23" />
          <circle cx="68" cy="50" r="21" />
          <circle cx="54" cy="64" r="20" />
          <rect x="22" y="50" width="56" height="30" rx="15" />
        </>
      )
    case 'quadrado':
      return <rect x="15" y="15" width="70" height="70" rx="22" />
    case 'losango':
      return <rect x="23" y="23" width="54" height="54" rx="16" transform="rotate(45 50 50)" />
    case 'ovo':
      return <ellipse cx="50" cy="53" rx="31" ry="37" />
    case 'gota':
      return <path d="M50 12 C 64 30, 84 46, 84 62 A 34 30 0 0 1 16 62 C 16 46, 36 30, 50 12 Z" />
    default:
      return <circle cx="50" cy="52" r="36" />
  }
}

/** A flat shape in the profile's colour (original art, drawn in SVG). */
export function Critter({ shape = 'bolha', color, size = 96 }: { shape?: string; color: string; size?: number; seed?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <g fill={color}>
        <Body shape={shape} />
      </g>
    </svg>
  )
}
