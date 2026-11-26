import { useState } from 'react'
import { CheckCircle2, CircleHelp, Loader2, Plus, X, XCircle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { cn } from '@renderer/lib/utils'
import { call, type Model } from '@renderer/lib/api'

export type Row = Model & { enabled: boolean; preset: boolean; status?: 'ok' | 'bad'; note?: string }

// Current Claude models (IDs from Anthropic's model list, Nov 2026). The first three start switched on.
const PRESETS: Omit<Row, 'enabled' | 'preset'>[] = [
  { name: 'claude-opus-5-5', label: 'Opus 5.5', supports1m: true },
  { name: 'claude-sonnet-5-5', label: 'Sonnet 5.5', supports1m: true },
  { name: 'claude-haiku-5-5', label: 'Haiku 5.5', supports1m: true },
  { name: 'claude-fable-5-2', label: 'Fable 5.2', supports1m: true },
  { name: 'claude-opus-5', label: 'Opus 5', supports1m: true },
  { name: 'claude-sonnet-5', label: 'Sonnet 5', supports1m: true },
  { name: 'claude-opus-4-8', label: 'Opus 4.8', supports1m: true },
  { name: 'claude-sonnet-4-6', label: 'Sonnet 4.6', supports1m: true },
  { name: 'claude-haiku-4-5', label: 'Haiku 4.5', supports1m: false }
]
const ON_BY_DEFAULT = 3

/** Presets first (saved ones switched on), then any custom models the profile already had. */
export function initialRows(saved?: Model[]): Row[] {
  const have = new Map((saved ?? []).map((m) => [m.name, m]))
  const rows: Row[] = PRESETS.map((p, n) => {
    const s = have.get(p.name)
    return { ...p, ...(s ?? {}), preset: true, enabled: saved?.length ? !!s : n < ON_BY_DEFAULT }
  })
  for (const m of saved ?? []) if (!PRESETS.some((p) => p.name === m.name)) rows.push({ ...m, preset: false, enabled: true })
  return rows
}

type Probe = Record<string, { ok: boolean; msg: string }>

export function ModelList({ rows, setRows, provider, url, apiKey }: { rows: Row[]; setRows(r: Row[]): void; provider: 'anthropic' | 'gateway'; url: string; apiKey: string }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<{ ok: boolean; msg: string } | null>(null)
  const set = (n: number, m: Partial<Row>): void => setRows(rows.map((x, k) => (k === n ? { ...x, ...m } : x)))

  async function test(): Promise<void> {
    setBusy(true)
    setSummary(null)
    try {
      const ids = rows.filter((r) => r.name.trim()).map((r) => r.name.trim())
      const res = await call<Probe>('testModels', { provider, url, key: apiKey, models: ids })
      const next = rows.map((r) => {
        const p = res[r.name.trim()]
        if (!p) return r
        // a model that doesn't answer is switched off; one that answers keeps the user's choice
        return { ...r, status: p.ok ? ('ok' as const) : ('bad' as const), note: p.msg, enabled: p.ok ? r.enabled : false }
      })
      setRows(next)
      const good = Object.values(res).filter((p) => p.ok).length
      setSummary({ ok: good > 0, msg: `${good} de ${ids.length} modelos responderam com esta chave.${good < ids.length ? ' Os que não responderam foram desligados.' : ''}` })
    } catch (e) {
      setSummary({ ok: false, msg: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const on = rows.filter((r) => r.enabled).length
  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between">
        <Label>Modelos</Label>
        <span className="text-xs text-muted-foreground">{on} ligado{on === 1 ? '' : 's'} · aparecem no menu da janela</span>
      </div>
      <div className="overflow-hidden rounded-lg border">
        {rows.map((m, n) => (
          <div key={n} className={cn('grid grid-cols-[36px_1fr_auto_20px_28px] items-center gap-2.5 border-t px-3 py-2 first:border-t-0', !m.enabled && 'bg-muted/40')}>
            <Switch checked={m.enabled} onCheckedChange={(v) => set(n, { enabled: v })} aria-label={`Ligar ${m.label || m.name}`} />
            <div className="min-w-0">
              {m.preset ? (
                <>
                  <div className={cn('font-medium', !m.enabled && 'text-muted-foreground')}>{m.label}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">{m.name}</div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  <Input className="h-7 font-mono text-xs" value={m.name} placeholder="id-do-modelo" spellCheck={false} onChange={(e) => set(n, { name: e.target.value, status: undefined })} />
                  <Input className="h-7 text-xs" value={m.label} placeholder="Nome no menu" onChange={(e) => set(n, { label: e.target.value })} />
                </div>
              )}
              {m.status === 'bad' && m.note && <div className="mt-0.5 text-[11px] text-destructive">{m.note}</div>}
            </div>
            <button
              onClick={() => set(n, { supports1m: !m.supports1m })}
              title="Contexto de 1 milhão de tokens"
              className={cn('rounded-full border px-1.5 text-[10px] font-semibold', m.supports1m ? 'border-foreground/30 text-foreground' : 'text-muted-foreground/60 line-through')}
            >
              1M
            </button>
            <span title={m.status === 'ok' ? 'Respondeu' : m.status === 'bad' ? 'Não respondeu' : 'Ainda não testado'}>
              {m.status === 'ok' ? <CheckCircle2 className="size-4 text-success" /> : m.status === 'bad' ? <XCircle className="size-4 text-destructive" /> : <CircleHelp className="size-4 text-muted-foreground/50" />}
            </span>
            {m.preset ? <span /> : (
              <Button variant="ghost" size="icon" className="size-7" title="Tirar modelo" onClick={() => setRows(rows.filter((_, k) => k !== n))}><X /></Button>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={() => setRows([...rows, { name: '', label: '', supports1m: true, enabled: true, preset: false }])}>
          <Plus /> Outro modelo
        </Button>
        <div className="flex-1" />
        <Button size="sm" disabled={!apiKey || (provider === 'gateway' && !url) || busy} onClick={test}>
          {busy && <Loader2 className="animate-spin" />} {busy ? 'Testando…' : 'Testar modelos com esta chave'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">O teste manda um “oi” curtinho para cada modelo (custa frações de centavo).</p>
      {summary && (
        <div className={cn('mt-1 flex items-start gap-2 rounded-lg px-3 py-2 text-xs', summary.ok ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>
          {summary.ok ? <CheckCircle2 className="mt-px size-4 shrink-0" /> : <XCircle className="mt-px size-4 shrink-0" />}
          <span>{summary.msg}</span>
        </div>
      )}
    </div>
  )
}
