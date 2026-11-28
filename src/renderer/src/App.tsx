import { useCallback, useEffect, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { Activity as ActivityIcon, Monitor, Moon, Sun, Copy, FolderOpen, Loader2, MoreHorizontal, Pencil, Plus, Power, RotateCw, Stethoscope, Trash2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import { call, colorOf, type Instance, type State } from '@renderer/lib/api'
import { Critter } from '@renderer/components/Critter'
import { Editor } from '@renderer/components/Editor'
import { ActivityScreen, DoctorScreen } from '@renderer/components/Screens'

type Screen = 'home' | 'activity' | 'doctor'

type Theme = 'system' | 'light' | 'dark'
const THEMES: { id: Theme; label: string; icon: React.ReactNode }[] = [
  { id: 'system', label: 'Igual ao Mac', icon: <Monitor /> },
  { id: 'light', label: 'Claro', icon: <Sun /> },
  { id: 'dark', label: 'Escuro', icon: <Moon /> }
]

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('theme') as Theme) || 'system'
    } catch {
      return 'system'
    }
  })
  useEffect(() => {
    // nativeTheme drives prefers-color-scheme, so useDarkClass and native menus follow it
    window.api.setTheme(theme)
    try {
      localStorage.setItem('theme', theme)
    } catch {
      /* private storage unavailable: theme just isn't remembered */
    }
  }, [theme])
  return [theme, setTheme]
}

function useDarkClass(): void {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const set = (): void => void document.documentElement.classList.toggle('dark', mq.matches)
    set()
    mq.addEventListener('change', set)
    return () => mq.removeEventListener('change', set)
  }, [])
}

export default function App(): React.JSX.Element {
  useDarkClass()
  const [theme, setTheme] = useTheme()
  const [state, setState] = useState<State | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>('home')
  const [busy, setBusy] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<Instance | 'new' | null>(null)
  const [removing, setRemoving] = useState<Instance | null>(null)

  const refresh = useCallback(async () => {
    try {
      setState(await call<State>('state'))
      setLoadError(null)
    } catch (e) {
      setLoadError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(() => document.hasFocus() && refresh(), 4000)
    window.addEventListener('focus', refresh)
    return () => (clearInterval(t), window.removeEventListener('focus', refresh))
  }, [refresh])

  async function act(i: Instance, what: 'open' | 'stop' | 'restart' | 'duplicate' | 'remove', label: string): Promise<void> {
    setBusy((b) => ({ ...b, [i.id]: label }))
    try {
      await call(what, i.id)
      if (what === 'remove') toast.success(`“${i.name}” removido`)
      if (what === 'duplicate') toast.success('Perfil duplicado')
    } catch (e) {
      toast.error((e as Error).message, { action: { label: 'Ver atividade', onClick: () => setScreen('activity') } })
    } finally {
      setBusy(({ [i.id]: _, ...rest }) => rest)
      refresh()
    }
  }

  return (
    <TooltipProvider>
      <Toaster position="bottom-center" richColors theme="system" />
      {screen === 'home' && (
        <div className="flex h-full flex-col">
          <div className="drag flex h-11 shrink-0 items-center justify-center text-xs font-semibold text-muted-foreground">MultiCode</div>
          <main className="flex flex-1 flex-col items-center justify-center overflow-auto px-8 pb-10 text-center">
            <h1 className="text-[26px] font-semibold tracking-tight">Qual perfil você quer abrir?</h1>
            <p className="mt-1.5 mb-9 text-muted-foreground">Clique num perfil para abrir. Se já estiver aberto, a janela vem para a frente.</p>
            {loadError && <p className="mb-6 max-w-lg rounded-lg bg-destructive/10 px-4 py-3 text-destructive">{loadError}</p>}
            <div className="flex max-w-[920px] flex-wrap justify-center gap-4">
              {state?.instances.map((i) => (
                <Tile
                  key={i.id}
                  i={i}
                  color={colorOf(i.palette, state.palettes)}
                  busy={busy[i.id]}
                  onOpen={() => act(i, 'open', i.running ? '' : 'Abrindo…')}
                  onEdit={() => setEditing(i)}
                  onStop={() => act(i, 'stop', 'Fechando…')}
                  onRestart={() => act(i, 'restart', 'Reiniciando…')}
                  onDuplicate={() => act(i, 'duplicate', 'Duplicando…')}
                  onReveal={() => call('reveal', i.dataDir).catch((e) => toast.error(e.message))}
                  onRemove={() => setRemoving(i)}
                />
              ))}
              {state && (
                <button onClick={() => setEditing('new')} className="group flex w-[164px] flex-col items-center gap-1.5 rounded-2xl border border-transparent px-3 pt-5 pb-4 outline-none hover:border-border hover:bg-card hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50">
                  <div className="mb-1.5 grid size-24 place-items-center rounded-full border-2 border-dashed border-border text-muted-foreground transition group-hover:border-primary group-hover:text-primary">
                    <Plus className="size-10" strokeWidth={1.5} />
                  </div>
                  <span className="text-sm font-semibold">Adicionar</span>
                  <span className="text-xs text-muted-foreground">Conta ou API</span>
                  <span className="h-4" />
                </button>
              )}
            </div>
            {state && state.instances.length === 1 && (
              <p className="mt-10 max-w-md text-muted-foreground">
                Você só tem o seu Claude de sempre. Clique em <b className="text-foreground">Adicionar</b> para criar uma janela com outra conta ou com a sua API.
              </p>
            )}
          </main>
          <footer className="flex items-center gap-1 border-t px-4 py-2.5 text-xs text-muted-foreground">
            <span className="px-2">Os dados de cada perfil ficam em ~/.claude-multi</span>
            <div className="flex-1" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" title="Tema">{THEMES.find((t) => t.id === theme)?.icon} Tema</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {THEMES.map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => setTheme(t.id)} className={theme === t.id ? 'font-semibold' : ''}>
                    {t.icon} {t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" onClick={() => setScreen('activity')}><ActivityIcon /> Atividade</Button>
            <Button variant="ghost" size="sm" onClick={() => setScreen('doctor')}><Stethoscope /> Diagnóstico</Button>
          </footer>
        </div>
      )}
      {screen === 'activity' && <ActivityScreen onBack={() => setScreen('home')} />}
      {screen === 'doctor' && <DoctorScreen onBack={() => setScreen('home')} />}

      {editing && state && (
        <Editor
          instance={editing === 'new' ? null : editing}
          palettes={state.palettes}
          onClose={() => setEditing(null)}
          onSaved={async (id, open) => {
            setEditing(null)
            await refresh()
            if (open) {
              const s = await call<State>('state')
              const i = s.instances.find((x) => x.id === id)
              if (i) act(i, 'open', 'Abrindo…')
            } else toast.success('Perfil salvo')
          }}
        />
      )}

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{removing?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              A cópia do Claude deste perfil é apagada. As conversas, o login e a chave continuam guardados em{' '}
              <code className="text-foreground">~/.claude-multi/{removing?.id}</code>.
              {removing?.running && <b className="mt-2 block text-foreground">A janela está aberta. Feche antes para não perder o que estiver digitando.</b>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => removing && act(removing, 'remove', 'Removendo…')}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}

type TileProps = {
  i: Instance
  color: string
  busy?: string
  onOpen(): void
  onEdit(): void
  onStop(): void
  onRestart(): void
  onDuplicate(): void
  onReveal(): void
  onRemove(): void
}

function Tile({ i, color, busy, ...on }: TileProps): React.JSX.Element {
  const type = i.primary ? 'Seu Claude de sempre' : i.app === 'opencode' ? 'OpenCode · API' : i.kind === 'official' ? 'Conta Claude' : 'API própria'
  const [menu, setMenu] = useState(false)
  return (
    <div
      className="group relative w-[164px]"
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu(true)
      }}
    >
      <button
        onClick={on.onOpen}
        disabled={!!busy}
        title={i.running ? `Trazer “${i.name}” para a frente` : `Abrir “${i.name}”`}
        className="flex w-full flex-col items-center gap-1.5 rounded-2xl border border-transparent px-3 pt-5 pb-4 outline-none group-hover:border-border group-hover:bg-card group-hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-80"
      >
        <div className="relative mb-1.5 size-24 transition group-hover:-translate-y-0.5 group-hover:scale-[1.05]">
          <Critter shape={i.avatar || (i.primary ? 'losango' : 'bolha')} color={color} seed={i.id.length} />
          {busy && <Loader2 className="absolute inset-0 m-auto size-9 animate-spin text-white drop-shadow" />}
          {i.running && <span className="absolute right-1 bottom-2 size-5 rounded-full border-[3px] border-background bg-success group-hover:border-card" />}
        </div>
        <span className="max-w-[140px] truncate text-sm font-semibold">{i.name}</span>
        <span className="text-xs text-muted-foreground">{type}</span>
        <span className="h-4 text-[11.5px] font-semibold text-success">{busy ? <span className="text-muted-foreground">{busy}</span> : i.running ? 'Aberto' : ''}</span>
      </button>
        <div className={`absolute top-2 right-2 flex gap-0.5 transition group-focus-within:opacity-100 group-hover:opacity-100 ${menu ? 'opacity-100' : 'opacity-0'}`}>
          <Button variant="ghost" size="icon" className="size-7" title="Editar" onClick={on.onEdit}><Pencil /></Button>
          <DropdownMenu open={menu} onOpenChange={setMenu}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7" title="Mais ações"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {i.running && !i.primary && (
                <>
                  <DropdownMenuItem onClick={on.onStop}><Power /> Fechar janela</DropdownMenuItem>
                  <DropdownMenuItem onClick={on.onRestart}><RotateCw /> Reiniciar</DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={on.onEdit}><Pencil /> Editar…</DropdownMenuItem>
              {!i.primary && (
                <>
                  <DropdownMenuItem onClick={on.onDuplicate}><Copy /> Duplicar</DropdownMenuItem>
                  <DropdownMenuItem onClick={on.onReveal}><FolderOpen /> Mostrar dados no Finder</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={on.onRemove}><Trash2 /> Remover…</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
    </div>
  )
}
