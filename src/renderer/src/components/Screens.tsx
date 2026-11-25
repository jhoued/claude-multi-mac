import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, Check, ChevronRight, Copy, FolderOpen, Loader2, RefreshCw, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { cn } from '@renderer/lib/utils'
import { call, type Activity, type Check as CheckT, type Outdated } from '@renderer/lib/api'

function Header(p: { title: string; sub: string; onBack(): void; children?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="drag sticky top-0 z-10 flex items-end gap-3 bg-background px-8 pt-11 pb-5">
      <Button variant="ghost" size="icon" className="no-drag mb-0.5 -ml-2" onClick={p.onBack} title="Voltar aos perfis">
        <ArrowLeft />
      </Button>
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{p.title}</h1>
        <p className="text-muted-foreground">{p.sub}</p>
      </div>
      <div className="flex-1" />
      <div className="no-drag flex gap-2">{p.children}</div>
    </div>
  )
}

function when(t: number): string {
  const d = new Date(t)
  const today = new Date().toDateString() === d.toDateString()
  return today ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export function ActivityScreen({ onBack }: { onBack(): void }): React.JSX.Element {
  const [items, setItems] = useState<Activity[]>([])
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => {
    call<Activity[]>('activity').then(setItems)
    return window.api.onActivity((a) => setItems(a as Activity[]))
  }, [])

  const names = [...new Set(items.map((i) => i.name))].slice(0, 5)
  const shown = items.filter((i) => filter === 'all' || (filter === 'errors' ? !i.ok : i.name === filter))
  const copy = (): void => {
    navigator.clipboard.writeText(shown.map((i) => `${new Date(i.t).toISOString()} ${i.name}: ${i.msg}${i.detail ? '\n' + i.detail : ''}`).join('\n'))
    toast.success('Log copiado')
  }

  return (
    <div className="h-full overflow-auto">
      <Header title="Atividade" sub="O que o app fez, em ordem. Útil quando uma janela não abre." onBack={onBack}>
        <Button variant="outline" size="sm" onClick={copy} disabled={!shown.length}><Copy /> Copiar log</Button>
        <Button variant="outline" size="sm" onClick={() => call('openHome')}><FolderOpen /> Abrir pasta</Button>
      </Header>
      <div className="px-8 pb-10">
        <Tabs value={filter} onValueChange={setFilter} className="mb-3">
          <TabsList>
            <TabsTrigger value="all">Tudo</TabsTrigger>
            <TabsTrigger value="errors">Erros</TabsTrigger>
            {names.map((n) => <TabsTrigger key={n} value={n}>{n}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        {shown.length === 0 ? (
          <p className="rounded-xl border bg-card px-4 py-10 text-center text-muted-foreground">Nada por aqui ainda. Abra um perfil e as ações aparecem nesta lista.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            {shown.map((a, n) => (
              <div key={a.t + a.id + n} className="border-t first:border-t-0">
                <button className="grid w-full grid-cols-[64px_20px_150px_1fr_16px] items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50" onClick={() => setOpen(open === n ? null : n)} disabled={!a.detail}>
                  <time className="text-xs text-muted-foreground tabular-nums">{when(a.t)}</time>
                  {a.ok ? <Check className="size-4 text-success" /> : <X className="size-4 text-destructive" />}
                  <span className="truncate font-semibold">{a.name}</span>
                  <span className={cn('truncate', !a.ok && 'text-destructive')}>{a.msg}</span>
                  {a.detail ? <ChevronRight className={cn('size-4 text-muted-foreground transition', open === n && 'rotate-90')} /> : <span />}
                </button>
                {open === n && a.detail && (
                  <pre className="mx-4 mb-3 max-h-60 overflow-auto rounded-lg border bg-background p-3 font-mono text-[11.5px] whitespace-pre-wrap text-muted-foreground select-text">{a.detail}</pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const CHECK_PT: Record<string, string> = {
  'Python Version': 'Python 3',
  'Claude.app': 'Claude instalado',
  'macOS System Tools': 'Ferramentas do sistema',
  'Disk Space & APFS': 'Espaço em disco',
  'Gatekeeper Quarantine': 'Bloqueio do Gatekeeper',
  'Config Permissions': 'Arquivo de configuração',
  'Proxy Syntax': 'Proxies',
  'Clone Versions': 'Cópias do Claude'
}

export function DoctorScreen({ onBack }: { onBack(): void }): React.JSX.Element {
  const [data, setData] = useState<{ checks: CheckT[]; outdated: Outdated[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = (): void => {
    setData(null)
    setError(null)
    call<{ checks: CheckT[]; outdated: Outdated[] }>('doctor').then(setData, (e) => setError(e.message))
  }
  useEffect(load, [])

  async function rebuild(o: Outdated): Promise<void> {
    setBusy(o.id)
    try {
      await call('rebuild', o.id)
      toast.success(`Cópia de “${o.name}” atualizada`)
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const checks = data?.checks.filter((c) => c.name !== 'Tkinter GUI Support') ?? []
  return (
    <div className="h-full overflow-auto">
      <Header title="Diagnóstico" sub="Confere se o Mac tem tudo que o app precisa." onBack={onBack}>
        <Button variant="outline" size="sm" onClick={load} disabled={!data && !error}><RefreshCw /> Verificar de novo</Button>
      </Header>
      <div className="space-y-4 px-8 pb-10">
        {error && <p className="rounded-xl bg-destructive/10 px-4 py-3 text-destructive">{error}</p>}
        {!data && !error && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Verificando…</p>}
        {data && data.outdated.length > 0 && (
          <div className="overflow-hidden rounded-xl border bg-card">
            {data.outdated.map((o) => (
              <div key={o.id} className="flex items-center gap-3 border-t px-4 py-3.5 first:border-t-0">
                <AlertTriangle className="size-5 shrink-0 text-amber-500" />
                <div className="flex-1">
                  <b className="block">A cópia de “{o.name}” está desatualizada</b>
                  <span className="text-xs text-muted-foreground">O Claude foi atualizado para {o.src}; este perfil ainda usa {o.clone}. Feche a janela dele antes de atualizar.</span>
                </div>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => rebuild(o)}>
                  {busy === o.id && <Loader2 className="animate-spin" />} Atualizar cópia
                </Button>
              </div>
            ))}
          </div>
        )}
        {data && (
          <div className="overflow-hidden rounded-xl border bg-card">
            {checks.map((c) => (
              <div key={c.name} className="flex items-start gap-3 border-t px-4 py-3.5 first:border-t-0">
                <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full',
                  c.status === 'PASS' ? 'bg-success/15 text-success' : c.status === 'WARN' ? 'bg-amber-500/15 text-amber-500' : 'bg-destructive/15 text-destructive')}>
                  {c.status === 'PASS' ? <Check className="size-3" strokeWidth={3} /> : c.status === 'WARN' ? <span className="text-xs font-bold">!</span> : <X className="size-3" strokeWidth={3} />}
                </span>
                <div>
                  <b className="block">{CHECK_PT[c.name] ?? c.name}</b>
                  <span className="text-xs text-muted-foreground">{c.message}</span>
                  {c.remediation && c.status !== 'PASS' && <span className="mt-1 block text-xs">Como resolver: {c.remediation}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
