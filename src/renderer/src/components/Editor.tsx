import { useState } from 'react'
import { ChevronRight, Eye, EyeOff, Loader2, Plug, UserRound, AppWindow, Terminal } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@renderer/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@renderer/components/ui/collapsible'
import { cn } from '@renderer/lib/utils'
import { Critter, SHAPES } from '@renderer/components/Critter'
import { ModelList, initialRows, type Row } from '@renderer/components/ModelList'
import { call, colorOf, SWATCHES, TIMEZONES, type Instance, type Palette } from '@renderer/lib/api'

type Props = {
  instance: Instance | null
  palettes: Record<string, Palette>
  onClose(): void
  onSaved(id: string, open: boolean): void
}

export function Editor({ instance: i, palettes, onClose, onSaved }: Props): React.JSX.Element {
  const [name, setName] = useState(i?.name ?? '')
  const [palette, setPalette] = useState(i?.palette ?? 'violet')
  const [avatar, setAvatar] = useState(i?.avatar ?? (i?.primary ? 'losango' : 'bolha'))
  const [frame, setFrame] = useState(i?.frame ?? true)
  const color = colorOf(palette, palettes)
  const [kind, setKind] = useState<'official' | 'api'>(i ? (i.kind === 'official' ? 'official' : 'api') : 'api')
  const [appName, setAppName] = useState<'claude' | 'opencode'>(i?.app === 'opencode' ? 'opencode' : 'claude')
  const opencode = appName === 'opencode'
  const [ocSounds, setOcSounds] = useState(i?.ocPrefs?.sounds ?? false)
  const [ocNotify, setOcNotify] = useState(i?.ocPrefs?.notifications ?? true)
  const [ocSidebar, setOcSidebar] = useState(i?.ocPrefs?.sidebar ?? true)
  const [ocCompact, setOcCompact] = useState(i?.ocPrefs?.autoCompact ?? true)
  const [ocCompactAt, setOcCompactAt] = useState(String(i?.ocPrefs?.compactAt ?? 200000))
  const [provider, setProvider] = useState<'anthropic' | 'gateway'>(i?.api?.provider ?? 'anthropic')
  const [url, setUrl] = useState(i?.api?.url ?? '')
  const [key, setKey] = useState(i?.api?.key ?? '')
  const [showKey, setShowKey] = useState(false)
  const [models, setModels] = useState<Row[]>(() => initialRows(i?.api?.models))
  const [proxy, setProxy] = useState(i?.proxy ?? '')
  const [timezone, setTimezone] = useState(i?.timezone ?? 'auto')
  const [lang, setLang] = useState(i?.lang ?? 'auto')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const advancedOpen = !!(i?.proxy || (i?.timezone && i.timezone !== 'auto') || (i?.lang && i.lang !== 'auto'))

  async function save(open: boolean): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      const r = await call<{ id: string }>('save', {
        instance: {
          id: i?.id,
          name,
          palette,
          avatar,
          frame,
          app: appName,
          ocPrefs: opencode ? { sounds: ocSounds, notifications: ocNotify, sidebar: ocSidebar, autoCompact: ocCompact, compactAt: Number(ocCompactAt) } : undefined,
          kind: opencode ? 'api' : kind,
          proxy,
          timezone: timezone === 'auto' ? '' : timezone,
          lang: lang === 'auto' ? '' : lang
        },
        api: kind === 'api' ? { provider, url, key, models: models.filter((m) => m.enabled && m.name.trim()).map(({ name, label, supports1m }) => ({ name, label, supports1m })) } : undefined
      })
      onSaved(r.id, open)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }


  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-[560px] flex-col gap-0 p-0 sm:max-w-[560px]">
        <SheetHeader className="flex-row items-center gap-3 border-b px-6 py-5">
          <div className="shrink-0"><Critter shape={avatar} color={color} size={52} /></div>
          <div>
            <SheetTitle className="text-base">{i ? `Editar “${i.name}”` : 'Novo perfil'}</SheetTitle>
            <SheetDescription>Cada perfil tem login, conversas e configurações separados.</SheetDescription>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-7 overflow-auto px-6 py-5">
          <section className="space-y-4">
            <h4 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Identidade</h4>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Trabalho, Cliente X, OpenRouter" />
              <p className="text-xs text-muted-foreground">Aparece no Dock e no nome da janela.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Formato</Label>
              <div className="flex flex-wrap gap-1.5">
                {SHAPES.map((s) => (
                  <button
                    key={s.id}
                    title={s.label}
                    aria-label={s.label}
                    onClick={() => setAvatar(s.id)}
                    className={cn('rounded-xl border-[1.5px] p-1.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', avatar === s.id ? 'border-foreground bg-muted' : 'border-transparent hover:bg-muted')}
                  >
                    <Critter shape={s.id} color={color} size={44} />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {SWATCHES.map((s) => (
                  <button
                    key={s.id}
                    title={s.label}
                    aria-label={s.label}
                    onClick={() => setPalette(s.id)}
                    className={cn('size-8 rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring', palette === s.id && 'ring-2 ring-foreground')}
                    style={{ background: colorOf(s.id, palettes) }}
                  />
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-xl border bg-card px-3.5 py-3">
              <span>
                <b className="block">Borda colorida na janela</b>
                <span className="text-xs text-muted-foreground">Quando esta janela estiver em uso, ganha uma borda na cor do perfil com o nome em cima.</span>
              </span>
              <Switch checked={frame} onCheckedChange={setFrame} />
            </label>
          </section>

          {i?.primary ? (
            <p className="rounded-xl bg-muted px-3.5 py-3 text-xs text-muted-foreground">Este é o seu Claude de sempre. Aqui você muda só como ele aparece no app e na borda; o login e a conexão dele não são tocados.</p>
          ) : (
          <>
          <section className="space-y-3">
            <h4 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Aplicativo</h4>
            <div className="grid grid-cols-2 gap-2.5">
              <KindOption on={!opencode} onClick={() => setAppName('claude')} icon={<AppWindow className="size-4" />} title="Claude Desktop"
                text="Uma cópia do Claude Desktop só deste perfil." />
              <KindOption on={opencode} onClick={() => { setAppName('opencode'); setKind('api') }} icon={<Terminal className="size-4" />} title="OpenCode Desktop"
                text="O OpenCode com pasta, chave e servidor só deste perfil. Precisa dele em Aplicativos." />
            </div>
          </section>

          {!opencode && (
          <section className="space-y-3">
            <h4 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Como esta janela se conecta</h4>
            <div className="grid grid-cols-2 gap-2.5">
              <KindOption on={kind === 'official'} onClick={() => setKind('official')} icon={<UserRound className="size-4" />} title="Conta Claude"
                text="Outra conta de assinatura. Você faz login dentro da janela." />
              <KindOption on={kind === 'api'} onClick={() => setKind('api')} icon={<Plug className="size-4" />} title="API própria"
                text="Um endpoint compatível com a API da Anthropic, com a sua chave." />
            </div>
          </section>
          )}

          {(kind === 'api' || opencode) && (
            <section className="space-y-4">
              <h4 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Conexão da API</h4>
              <div className="space-y-1.5">
                <Label>De onde é a chave</Label>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup">
                  {([['anthropic', 'Anthropic', 'chave sk-ant-…'], ['gateway', 'Outro endpoint', 'gateway, OpenRouter…']] as const).map(([v, t, s]) => (
                    <button
                      key={v}
                      role="radio"
                      aria-checked={provider === v}
                      onClick={() => setProvider(v)}
                      className={cn('rounded-md px-3 py-1.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', provider === v ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                    >
                      <b className="block text-[13px]">{t}</b>
                      <span className="text-[11px] text-muted-foreground">{s}</span>
                    </button>
                  ))}
                </div>
                {provider === 'anthropic' && (
                  <p className="text-xs text-muted-foreground">Usa direto a API da Anthropic (api.anthropic.com), do mesmo jeito que o Claude Desktop faz quando você entra com uma chave.</p>
                )}
              </div>
              {provider === 'gateway' && (
                <div className="space-y-1.5">
                  <Label htmlFor="url">Endereço da API</Label>
                  <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://openrouter.ai/api" spellCheck={false} />
                  <p className="text-xs text-muted-foreground">Sem o /v1 no final (se colar com /v1, o app tira).</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="key">Chave da API</Label>
                <div className="flex gap-2">
                  <Input id="key" placeholder={provider === 'anthropic' ? 'sk-ant-…' : ''} type={showKey ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} spellCheck={false} autoComplete="off" />
                  <Button variant="outline" size="icon" onClick={() => setShowKey(!showKey)} title={showKey ? 'Esconder' : 'Mostrar'}>
                    {showKey ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Fica só neste Mac, num arquivo que só o seu usuário lê.</p>
              </div>
              <ModelList rows={models} setRows={setModels} provider={provider} url={url} apiKey={key} />
              {opencode && <p className="text-xs text-muted-foreground">No OpenCode, o primeiro modelo ligado vira o padrão; os outros você escolhe dentro dele com /models.</p>}
            </section>
          )}

          {opencode && (
            <section className="space-y-3">
              <h4 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Preferências do OpenCode</h4>
              <div className="overflow-hidden rounded-xl border bg-card">
                <label className="flex items-center justify-between gap-4 px-3.5 py-3">
                  <span>
                    <b className="block">Compactação automática</b>
                    <span className="text-xs text-muted-foreground">Quando a conversa fica grande, o OpenCode resume a parte antiga e continua. Recomendado.</span>
                  </span>
                  <Switch checked={ocCompact} onCheckedChange={setOcCompact} />
                </label>
                <div className={cn('flex items-center justify-between gap-4 border-t px-3.5 py-3', !ocCompact && 'opacity-50')}>
                  <span>
                    <b className="block">Compactar a partir de</b>
                    <span className="text-xs text-muted-foreground">Tamanho da conversa (em tokens) em que ela é resumida. Quanto menor, mais barata cada mensagem; os modelos novos aceitam até 1 milhão, o que fica caro.</span>
                  </span>
                  <Select value={ocCompactAt} onValueChange={setOcCompactAt} disabled={!ocCompact}>
                    <SelectTrigger className="w-44 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="100000">100 mil tokens</SelectItem>
                      <SelectItem value="200000">200 mil (recomendado)</SelectItem>
                      <SelectItem value="400000">400 mil tokens</SelectItem>
                      <SelectItem value="0">Só no limite do modelo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center justify-between gap-4 border-t px-3.5 py-3">
                  <span>
                    <b className="block">Barra lateral aberta</b>
                    <span className="text-xs text-muted-foreground">Projetos e conversas visíveis à esquerda ao abrir.</span>
                  </span>
                  <Switch checked={ocSidebar} onCheckedChange={setOcSidebar} />
                </label>
                <label className="flex items-center justify-between gap-4 border-t px-3.5 py-3">
                  <span>
                    <b className="block">Sons</b>
                    <span className="text-xs text-muted-foreground">Os bipes quando o agente termina, pede permissão, pergunta algo ou dá erro.</span>
                  </span>
                  <Switch checked={ocSounds} onCheckedChange={setOcSounds} />
                </label>
                <label className="flex items-center justify-between gap-4 border-t px-3.5 py-3">
                  <span>
                    <b className="block">Notificações</b>
                    <span className="text-xs text-muted-foreground">Avisos do macOS quando o agente termina, pede permissão ou pergunta algo.</span>
                  </span>
                  <Switch checked={ocNotify} onCheckedChange={setOcNotify} />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">Entram na próxima vez que este OpenCode abrir. O que você mudar dentro do próprio OpenCode continua valendo até você mudar aqui de novo.</p>
            </section>
          )}

          {!opencode && (
          <Collapsible defaultOpen={advancedOpen} className="group/adv">
            <CollapsibleTrigger className="flex items-center gap-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground">
              <ChevronRight className="size-4 transition group-data-[state=open]/adv:rotate-90" /> Avançado
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="proxy">Proxy</Label>
                <Input id="proxy" value={proxy} onChange={(e) => setProxy(e.target.value)} placeholder="http://usuario:senha@host:porta" spellCheck={false} />
                <p className="text-xs text-muted-foreground">Opcional. Só esta janela passa pelo proxy.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Fuso horário</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Igual ao do Mac</SelectItem>
                      {[...new Set([...TIMEZONES, ...(timezone !== 'auto' ? [timezone] : [])])].map((t) => (
                        <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Idioma da janela</Label>
                  <Select value={lang} onValueChange={setLang}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Automático</SelectItem>
                      <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                      <SelectItem value="en-US">English</SelectItem>
                      <SelectItem value="es-ES">Español</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
          )}
          </>
          )}
        </div>

        <SheetFooter className="flex-row items-center gap-2 border-t px-6 py-3.5">
          {error && <p className="mr-auto max-w-[260px] text-xs text-destructive">{error}</p>}
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="outline" disabled={saving} onClick={() => save(false)}>Salvar</Button>
          <Button disabled={saving} onClick={() => save(true)}>{saving && <Loader2 className="animate-spin" />} Salvar e abrir</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function KindOption(p: { on: boolean; onClick(): void; icon: React.ReactNode; title: string; text: string }): React.JSX.Element {
  return (
    <button
      onClick={p.onClick}
      className={cn('rounded-xl border-[1.5px] bg-card p-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', p.on ? 'border-primary ring-[3px] ring-primary/15' : 'hover:border-muted-foreground/40')}
    >
      <b className="mb-1 flex items-center gap-1.5">{p.icon}{p.title}</b>
      <span className="text-xs text-muted-foreground">{p.text}</span>
    </button>
  )
}
