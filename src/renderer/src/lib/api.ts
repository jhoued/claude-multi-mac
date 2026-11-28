export type Model = { name: string; label: string; supports1m: boolean }
export type ApiConf = { provider: 'anthropic' | 'gateway'; url: string; key: string; models: Model[] }
export type Instance = {
  id: string
  name: string
  kind: 'official' | 'cc-switch'
  palette: string
  avatar?: string
  frame?: boolean
  app?: 'opencode'
  ocPrefs?: { sounds?: boolean; notifications?: boolean; sidebar?: boolean; autoCompact?: boolean; compactAt?: number }
  pids: number[]
  proxy?: string
  timezone?: string
  lang?: string
  primary: boolean
  running: boolean
  api: ApiConf | null
  clonePath: string | null
  dataDir: string
}
export type Palette = { hue: number }
export type State = { instances: Instance[]; palettes: Record<string, Palette>; home: string }
export type Activity = { t: number; id: string; name: string; ok: boolean; msg: string; detail?: string }
export type Check = { name: string; status: 'PASS' | 'WARN' | 'FAIL'; message: string; remediation?: string }
export type Outdated = { id: string; name: string; src: string; clone: string }

type Fn = (...a: never[]) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>

/** Calls a main-process action; throws the Portuguese error message on failure. */
export async function call<T>(name: keyof Window['api'], ...args: unknown[]): Promise<T> {
  const r = await (window.api[name] as unknown as Fn)(...(args as never[]))
  if (!r.ok) throw new Error(r.error)
  return r.data as T
}

const EXTRA: Record<string, string> = { laranja: '#F97316', rosa: '#EC4899', amarelo: '#EAB308', grafite: '#71717A' }
export const SWATCHES: { id: string; label: string }[] = [
  { id: 'official', label: 'Laranja Claude' },
  { id: 'violet', label: 'Violeta' },
  { id: 'gemini', label: 'Azul' },
  { id: 'deepseek', label: 'Índigo' },
  { id: 'perplexity', label: 'Ciano' },
  { id: 'gpt', label: 'Verde' },
  { id: EXTRA.laranja, label: 'Laranja' },
  { id: EXTRA.rosa, label: 'Rosa' },
  { id: EXTRA.amarelo, label: 'Amarelo' },
  { id: EXTRA.grafite, label: 'Grafite' }
]

export function gradient(palette: string, palettes: Record<string, Palette>): string {
  if (/^#?[0-9a-f]{6}$/i.test(palette)) {
    const c = palette.startsWith('#') ? palette : `#${palette}`
    return `linear-gradient(145deg, color-mix(in oklab, ${c} 85%, white), ${c})`
  }
  const h = palette === 'official' ? 18 : (palettes[palette]?.hue ?? 272)
  return `linear-gradient(145deg, hsl(${h} 85% 64%), hsl(${h} 72% 50%))`
}

/** Solid colour of a palette (critters, window border). */
export function colorOf(palette: string, palettes: Record<string, Palette>): string {
  if (/^#?[0-9a-f]{6}$/i.test(palette)) return palette.startsWith('#') ? palette : `#${palette}`
  const h = palette === 'official' ? 18 : (palettes[palette]?.hue ?? 272)
  return `hsl(${h} 78% 60%)`
}

export const TIMEZONES = [
  'America/Sao_Paulo', 'America/Manaus', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Toronto',
  'Europe/Lisbon', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney'
]
