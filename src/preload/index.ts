import { contextBridge, ipcRenderer } from 'electron'

const call = (ch: string) => (...a: unknown[]) => ipcRenderer.invoke(ch, ...a)

const api = {
  state: call('state'),
  activity: call('activity'),
  save: call('save'),
  duplicate: call('duplicate'),
  doctor: call('doctor'),
  open: call('open'),
  stop: call('stop'),
  restart: call('restart'),
  remove: call('remove'),
  rebuild: call('rebuild'),
  reveal: call('reveal'),
  openHome: call('openHome'),
  setTheme: call('setTheme'),
  testModels: call('testModels'),
  onActivity: (fn: (a: unknown) => void) => {
    const h = (_: unknown, a: unknown): void => fn(a)
    ipcRenderer.on('activity', h)
    return () => ipcRenderer.removeListener('activity', h)
  }
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
