import { app, shell, BrowserWindow, ipcMain, nativeTheme, screen } from 'electron'
import { overlayLayout } from './overlayLayout'
import { execFile, spawn } from 'child_process'
import { createInterface } from 'readline'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

const PY = '/usr/bin/python3'
const RES = join(__dirname, '../../resources').replace('app.asar', 'app.asar.unpacked')
const BRIDGE = join(RES, 'bridge.py')
const CLI = join(RES, 'claude-multi/macos/claude_multi.py')
const HOME = join(homedir(), '.claude-multi')
const ACTIVITY = join(HOME, 'app-activity.json')
const ENV = { ...process.env, CLAUDE_MULTI_CONFIG: join(HOME, 'instances.json'), PYTHONIOENCODING: 'utf-8' }
const OFFICIAL_APP = '/Applications/Claude.app'

type Run = { ok: boolean; out: string }
type Activity = { t: number; id: string; name: string; ok: boolean; msg: string; detail?: string }

function run(cmd: string, args: string[], input?: string, timeout = 240000): Promise<Run> {
  return new Promise((resolve) => {
    const p = execFile(cmd, args, { env: ENV, timeout, maxBuffer: 8 << 20 }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: `${stdout}${stderr}`.trim() })
    )
    if (input !== undefined) p.stdin?.end(input)
  })
}

async function bridge(args: string[], input?: unknown): Promise<unknown> {
  const r = await run(PY, [BRIDGE, ...args], input === undefined ? undefined : JSON.stringify(input))
  let data: unknown
  try {
    data = JSON.parse(r.out.split('\n').pop() || '')
  } catch {
    throw new Error(r.out || 'O script Python não respondeu.')
  }
  if (data && typeof data === 'object' && 'error' in data) throw new Error(String((data as { error: string }).error))
  return data
}

let activity: Activity[] = []
const loadActivity = fs.readFile(ACTIVITY, 'utf8').then((t) => (activity = JSON.parse(t))).catch(() => (activity = []))

async function log(e: Omit<Activity, 't'>): Promise<void> {
  await loadActivity
  activity = [{ ...e, t: Date.now() }, ...activity].slice(0, 300)
  await fs.mkdir(HOME, { recursive: true })
  await fs.writeFile(ACTIVITY, JSON.stringify(activity), { mode: 0o600 })
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('activity', activity))
}

type Inst = { id: string; name: string; primary: boolean; running: boolean; clonePath: string | null; dataDir: string }
async function inst(id: string): Promise<Inst> {
  const s = (await bridge(['state'])) as { instances: Inst[] }
  const i = s.instances.find((x) => x.id === id)
  if (!i) throw new Error('Perfil não encontrado.')
  return i
}

const VERBS = {
  launch: ['Janela aberta', 'Não abriu'],
  stop: ['Janela fechada', 'Não fechou'],
  restart: ['Janela reiniciada', 'Não reiniciou'],
  remove: ['Perfil removido', 'Não foi removido'],
  init: ['Cópia do Claude atualizada', 'Não atualizou a cópia']
} as const

async function cli(verb: keyof typeof VERBS, i: Inst): Promise<void> {
  const args = verb === 'init' ? ['init', '--id', i.id, '--force'] : [verb, '--id', i.id]
  const r = await run(PY, [CLI, ...args])
  const [okMsg, badMsg] = VERBS[verb]
  const firstErr = r.out.split('\n').find((l) => l.startsWith('error:'))?.replace('error: ', '')
  await log({ id: i.id, name: i.name, ok: r.ok, msg: r.ok ? okMsg : `${badMsg}${firstErr ? ': ' + firstErr : ''}`, detail: r.out })
  if (!r.ok) throw new Error(firstErr || badMsg)
}

function handle(channel: string, fn: (...a: never[]) => Promise<unknown>): void {
  ipcMain.handle(channel, async (_e, ...a) => {
    try {
      return { ok: true, data: await fn(...(a as never[])) }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })
}

handle('state', () => bridge(['state']))
handle('activity', async () => (await loadActivity, activity))
handle('save', async (data: { instance: { name: string } }) => {
  const r = await bridge(['save'], data)
  refreshFrames()
  await log({ id: (r as { id: string }).id, name: data.instance.name, ok: true, msg: 'Perfil salvo' })
  return r
})
handle('duplicate', async (id: string) => {
  const r = (await bridge(['duplicate', id])) as { id: string }
  await log({ id: r.id, name: id, ok: true, msg: 'Perfil duplicado' })
  return r
})
handle('doctor', async () => ({ checks: await bridge(['doctor']), outdated: await bridge(['outdated']) }))
handle('open', async (id: string) => {
  const i = await inst(id)
  if (i.primary) {
    // the user's normal Claude: plain `open`, no flags, so its login and keychain stay untouched
    const r = await run('/usr/bin/open', ['-a', OFFICIAL_APP])
    if (!r.ok) throw new Error(r.out)
    if (!i.running) await log({ id, name: i.name, ok: true, msg: 'Janela aberta' })
    return
  }
  if (i.running && i.clonePath) {
    const r = await run('/usr/bin/open', ['-a', i.clonePath])
    if (r.ok) return
  }
  await cli('launch', i)
  // upstream only waits 1.5 s; catch windows that die right after starting
  setTimeout(async () => {
    const now = await inst(id).catch(() => null)
    if (now && !now.running)
      await log({ id, name: i.name, ok: false, msg: 'A janela fechou logo depois de abrir', detail: 'Veja ~/.claude-multi/logs/claude-multi.log ou rode o Diagnóstico.' })
  }, 8000)
})
handle('stop', async (id: string) => cli('stop', await inst(id)))
handle('restart', async (id: string) => cli('restart', await inst(id)))
handle('remove', async (id: string) => cli('remove', await inst(id)))
handle('rebuild', async (id: string) => cli('init', await inst(id)))
handle('reveal', async (path: string) => {
  if (!path.startsWith(HOME)) throw new Error('Pasta fora de ~/.claude-multi')
  await fs.mkdir(path, { recursive: true })
  await shell.openPath(path)
})
handle('setTheme', async (t: 'system' | 'light' | 'dark') => {
  nativeTheme.themeSource = t
})
handle('openHome', async () => {
  await fs.mkdir(HOME, { recursive: true })
  await shell.openPath(HOME)
})
handle('testModels', async ({ url, key, models }: { url: string; key: string; models: string[] }) => {
  const base = url.trim().replace(/\/+$/, '').replace(/\/v1$/, '')
  if (!/^https?:\/\/\S+$/.test(base)) throw new Error('Endereço da API inválido.')
  if (!key.trim()) throw new Error('Informe a chave da API.')
  // raw fetch, not the SDK: these are arbitrary Anthropic-compatible gateways with their own auth header habits
  const probe = async (model: string): Promise<{ ok: boolean; msg: string }> => {
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}`, 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'oi' }] }),
      signal: AbortSignal.timeout(30000)
    }).catch((e) => {
      throw new Error(`Não conectou em ${new URL(base).host}: ${e.cause?.code || e.message}`)
    })
    if (res.ok) return { ok: true, msg: 'Respondeu' }
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    const detail = body.error?.message ? `: ${body.error.message.slice(0, 140)}` : ''
    if (res.status === 401 || res.status === 403) return { ok: false, msg: `Chave recusada (${res.status})${detail}` }
    if (res.status === 404) return { ok: false, msg: `Modelo não disponível nesta API${detail}` }
    if (res.status === 429) return { ok: false, msg: `Limite de uso atingido, tente de novo${detail}` }
    return { ok: false, msg: `Erro ${res.status}${detail}` }
  }
  const out: Record<string, { ok: boolean; msg: string }> = {}
  // first call alone: if the address or key is wrong, fail once instead of N times
  const first = await probe(models[0])
  out[models[0]] = first
  if (/^Chave recusada/.test(first.msg)) throw new Error(first.msg)
  const rest = await Promise.all(models.slice(1).map((m) => probe(m).catch((e) => ({ ok: false, msg: (e as Error).message }))))
  models.slice(1).forEach((m, n) => (out[m] = rest[n]))
  return out
})
handle('testApi', async ({ url, key }: { url: string; key: string }) => {
  const base = url.trim().replace(/\/+$/, '').replace(/\/v1$/, '')
  if (!/^https?:\/\/\S+$/.test(base)) throw new Error('Endereço inválido.')
  const res = await fetch(`${base}/v1/models`, {
    headers: { Authorization: `Bearer ${key}`, 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    signal: AbortSignal.timeout(10000)
  }).catch((e) => {
    throw new Error(`Não conectou: ${e.cause?.code || e.message}`)
  })
  if (res.status === 401 || res.status === 403) throw new Error('A API respondeu, mas recusou a chave.')
  if (!res.ok) throw new Error(`A API respondeu com erro ${res.status}.`)
  const body = (await res.json().catch(() => ({}))) as { data?: { id: string }[] }
  return { models: (body.data || []).map((m) => m.id).slice(0, 200) }
})

// ---- coloured border around the profile window that is in front -------------------------------
type FrameInfo = { name: string; color: string; shape: string }

// the same flat shapes as the profile picker (Critter.tsx), as white SVG for the name badge
const SHAPE_SVG: Record<string, string> = {
  bolha: '<circle cx="50" cy="52" r="36"/>',
  nuvem: '<circle cx="30" cy="58" r="20"/><circle cx="47" cy="40" r="23"/><circle cx="68" cy="50" r="21"/><circle cx="54" cy="64" r="20"/><rect x="22" y="50" width="56" height="30" rx="15"/>',
  quadrado: '<rect x="15" y="15" width="70" height="70" rx="22"/>',
  losango: '<rect x="23" y="23" width="54" height="54" rx="16" transform="rotate(45 50 50)"/>',
  ovo: '<ellipse cx="50" cy="53" rx="31" ry="37"/>',
  gota: '<path d="M50 12 C 64 30, 84 46, 84 62 A 34 30 0 0 1 16 62 C 16 46, 36 30, 50 12 Z"/>'
}
let frames = new Map<number, FrameInfo>()            // main-process pid -> how to frame it
let overlay: BrowserWindow | null = null
let shown = ''

function colorOf(palette: string, palettes: Record<string, { hue: number }>): string {
  if (/^#?[0-9a-f]{6}$/i.test(palette)) return palette.startsWith('#') ? palette : `#${palette}`
  const h = palette === 'official' ? 18 : (palettes[palette]?.hue ?? 272)
  return `hsl(${h} 78% 60%)`
}

async function refreshFrames(): Promise<void> {
  try {
    const s = (await bridge(['state'])) as { instances: (Inst & { pids: number[]; palette: string; frame?: boolean; avatar?: string })[]; palettes: Record<string, { hue: number }> }
    const next = new Map<number, FrameInfo>()
    for (const i of s.instances) if (i.frame !== false) for (const pid of i.pids) next.set(pid, { name: i.name, color: colorOf(i.palette, s.palettes), shape: i.avatar || (i.primary ? 'losango' : 'bolha') })
    frames = next
  } catch {
    /* keep the last known map */
  }
}

const RADIUS = 12 // macOS window corner
const OVERLAY_HTML = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden;font:600 11px/1 -apple-system,BlinkMacSystemFont,sans-serif}
body{opacity:0;transition:opacity .14s ease}
body.on{opacity:1}
#b{position:fixed;border:2px solid var(--c);border-radius:${RADIUS + 2}px;
box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 22%,transparent),0 6px 24px color-mix(in srgb,var(--c) 30%,transparent)}
#t{position:fixed;left:50%;transform:translateX(-50%);height:26px;box-sizing:border-box;display:flex;align-items:center;gap:7px;
background:var(--c);color:#fff;padding:0 14px 0 10px;border-radius:999px;white-space:nowrap;max-width:50%;
font:600 13px/1 ui-rounded,"SF Pro Rounded",-apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.005em;
box-shadow:inset 0 0 0 1px rgba(255,255,255,.22),0 4px 14px color-mix(in srgb,var(--c) 45%,transparent),0 1px 2px rgba(0,0,0,.12)}
#t svg{width:14px;height:14px;flex:none;fill:#fff}
#t span{overflow:hidden;text-overflow:ellipsis;padding-bottom:1px}
</style><div id="b"></div><div id="t"><svg viewBox="0 0 100 100"></svg><span></span></div><script>
window.set=(c,n,L,g)=>{const s=document.documentElement.style;s.setProperty('--c',c);document.querySelector('#t span').textContent=n;document.querySelector('#t svg').innerHTML=g;
const b=document.getElementById('b').style;b.top=L.box.top+'px';b.left=L.box.left+'px';b.right=L.box.right+'px';b.bottom=L.box.bottom+'px';
document.getElementById('t').style.top=L.pillTop+'px';document.body.classList.add('on')}
</script>`

function getOverlay(): BrowserWindow {
  if (overlay && !overlay.isDestroyed()) return overlay
  overlay = new BrowserWindow({
    show: false, frame: false, transparent: true, hasShadow: false, focusable: false, resizable: false, movable: false,
    skipTaskbar: true, roundedCorners: false, alwaysOnTop: true, webPreferences: { sandbox: true }
  })
  overlay.setIgnoreMouseEvents(true)
  overlay.setAlwaysOnTop(true, 'floating')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(OVERLAY_HTML))
  return overlay
}

function onFront(line: string): void {
  let w: { pid?: number; x: number; y: number; w: number; h: number }
  try {
    w = JSON.parse(line)
  } catch {
    return
  }
  const f = w.pid ? frames.get(w.pid) : undefined
  if (!f) {
    if (overlay && !overlay.isDestroyed()) overlay.hide()
    shown = ''
    return
  }
  const o = getOverlay()
  const win = { x: w.x, y: w.y, width: w.w, height: w.h }
  const L = overlayLayout(win, screen.getDisplayMatching(win).workArea)
  o.setBounds(L.bounds)
  const key = f.color + f.name + f.shape + JSON.stringify(L.box) + L.pillTop
  const apply = (): void => {
    if (shown !== key) o.webContents.executeJavaScript(`set(${JSON.stringify(f.color)},${JSON.stringify(f.name)},${JSON.stringify(L)},${JSON.stringify(SHAPE_SVG[f.shape] ?? SHAPE_SVG.bolha)})`).catch(() => {})
    shown = key
    o.showInactive()
  }
  if (o.webContents.isLoading()) o.webContents.once('did-finish-load', apply)
  else apply()
}

function startWatcher(): void {
  const p = spawn(join(RES, 'windowwatch'), [], { stdio: ['ignore', 'pipe', 'ignore'] })
  createInterface({ input: p.stdout }).on('line', onFront)
  p.on('error', () => {})
  app.on('will-quit', () => p.kill())
  refreshFrames()
  setInterval(refreshFrames, 2500)
}

let mainWin: BrowserWindow | null = null
function createWindow(): void {
  const win = (mainWin = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 760,
    minHeight: 540,
    show: false,
    title: 'Claude Multi',
    titleBarStyle: 'hiddenInset',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  }))
  win.on('closed', () => (mainWin = null))
  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((d) => {
    if (/^https?:/.test(d.url)) shell.openExternal(d.url)
    return { action: 'deny' }
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.setName('Claude Multi')
app.whenReady().then(() => {
  electronApp.setAppUserModelId('local.claude-multi')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))
  createWindow()
  startWatcher()
  app.on('activate', () => {
    if (!mainWin) createWindow()
  })
})
// keep running after the manager window closes, so the window borders keep working (quit with ⌘Q)
app.on('window-all-closed', () => {})
