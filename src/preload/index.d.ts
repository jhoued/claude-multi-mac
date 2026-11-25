type Res<T = unknown> = Promise<{ ok: true; data: T } | { ok: false; error: string }>

declare global {
  interface Window {
    api: {
      state(): Res
      activity(): Res
      save(data: unknown): Res<{ id: string }>
      duplicate(id: string): Res<{ id: string }>
      doctor(): Res
      open(id: string): Res
      stop(id: string): Res
      restart(id: string): Res
      remove(id: string): Res
      rebuild(id: string): Res
      reveal(path: string): Res
      openHome(): Res
      setTheme(t: 'system' | 'light' | 'dark'): Res
      testApi(a: { url: string; key: string }): Res<{ models: string[] }>
      testModels(a: { url: string; key: string; models: string[] }): Res<Record<string, { ok: boolean; msg: string }>>
      onActivity(fn: (a: unknown) => void): () => void
    }
  }
}

export {}
