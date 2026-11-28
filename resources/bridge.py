"""JSON bridge between the Electron app and the upstream claude_multi.py (kept unmodified next to this file).

Usage: python3 bridge.py <command> [arg]   (JSON in on stdin for 'save', JSON out on stdout; errors -> {"error": "..."}, exit 1)
"""
import json, os, pwd, re, shutil, sqlite3, subprocess, sys, unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / 'claude-multi' / 'macos'))
import claude_multi as m  # noqa: E402

PRIMARY = dict(id='official', name='Claude', kind='official', palette='official')
OPENCODE_APP = Path('/Applications/OpenCode.app')
OC_FIRST_PORT = 49400   # OpenCode's own shared service uses 49374; each profile gets its own server port from here


def is_oc(i):
    return i.get('app') == 'opencode'


def oc_root(iid):
    return m.HOME_ROOT / iid / 'opencode'


def oc_running(i):
    """pids of this profile's OpenCode main process, found by the --claude-multi=<id> marker we launch it with."""
    out = subprocess.run(['ps', '-axo', 'pid=,command='], capture_output=True, text=True).stdout
    mark = re.compile(r'OpenCode\.app/Contents/MacOS/OpenCode .*--claude-multi=' + re.escape(i['id']) + r'(\s|$)')
    return [int(line.split(None, 1)[0]) for line in out.splitlines() if mark.search(line)]


def free_oc_port(c, keep=None):
    used = {x.get('ocPort') for x in c['instances']}
    if keep and keep not in used - {keep}:
        return keep
    port = OC_FIRST_PORT
    while port in used:
        port += 1
    return port


# OpenCode Desktop keeps its UI settings as JSON in <userData>/drafts.sqlite, table state, row (default.dat, settings.v3).
# On a fresh profile that database doesn't exist yet; the app imports a legacy <userData>/default.dat file on start instead.
OC_SETTINGS = ('default.dat', 'settings.v3')
OC_DEFAULTS = {   # OpenCode 2.4 defaultSettings (the parts we touch); the app fills in anything missing
    'notifications': {'agent': False, 'permissions': True, 'questions': True, 'errors': False},
    'sounds': {'agentEnabled': True, 'agent': 'staplebops-01', 'permissionsEnabled': True, 'permissions': 'staplebops-02',
               'questionsEnabled': True, 'questions': 'staplebops-05', 'errorsEnabled': True, 'errors': 'nope-03', 'interfaceEnabled': True},
}


def oc_patch(settings, prefs):
    """Profile preferences -> OpenCode settings. Only the keys we own change; everything else the user set in OpenCode stays."""
    s = json.loads(json.dumps(settings))
    if 'sounds' in prefs:
        snd = s.setdefault('sounds', dict(OC_DEFAULTS['sounds']))
        for k in ('agentEnabled', 'permissionsEnabled', 'questionsEnabled', 'errorsEnabled', 'interfaceEnabled'):
            snd[k] = bool(prefs['sounds'])
    if 'notifications' in prefs:
        note = s.setdefault('notifications', dict(OC_DEFAULTS['notifications']))
        for k in ('agent', 'permissions', 'questions', 'errors'):
            note[k] = bool(prefs['notifications'])
    return s


def oc_shell(iid):
    """Shell OpenCode runs tools in: a tiny wrapper named like the user's login shell (OpenCode picks flags by that name)."""
    real = pwd.getpwuid(os.getuid()).pw_shell or '/bin/zsh'
    return oc_root(iid) / 'bin' / Path(real).name, real


def write_oc_shell(iid):
    # OpenCode needs XDG_* pointed at the profile, but gh, git credential helpers, wrangler… must find the user's own logins.
    # shortcut: assumes the user doesn't set XDG_* themselves (macOS default); if they do, save and restore the originals here.
    path, real = oc_shell(iid)
    path.parent.mkdir(parents=True, exist_ok=True)
    # OpenCode Desktop reads its environment with `<shell> -il -c "env -0"` (then `-l`) and *deletes* XDG_STATE_HOME when
    # that probe doesn't report it, which would send the profile's server registration to the shared ~/.local/state.
    # So the probe sees the profile's folders untouched; every other command (the agent's tools) gets the user's back.
    path.write_text('#!/bin/sh\n'
                    '# MultiCode: OpenCode profile shell. Keep XDG_* for OpenCode\'s env probe, drop them for tool commands.\n'
                    'case "$*" in\n'
                    f'  "-il -c env -0"|"-l -c env -0") exec "{real}" "$@" ;;\n'
                    'esac\n'
                    'unset XDG_CONFIG_HOME XDG_DATA_HOME XDG_STATE_HOME XDG_CACHE_HOME\n'
                    f'exec "{real}" "$@"\n', encoding='utf-8')
    path.chmod(0o755)
    return str(path)


def oc_prepare(iid):
    """Run right before launching an OpenCode profile."""
    shell = write_oc_shell(iid)
    return dict(apply_oc_prefs(iid), shell=shell)


# Window layout (sidebar, panels) lives in row (opencode.global.dat, layout). OpenCode 2.4 starts with the sidebar closed;
# this is its default layout with the sidebar open, written whole so it decodes without falling back to the default.
OC_LAYOUT = ('opencode.global.dat', 'layout')
OC_LAYOUT_DEFAULT = {
    'sidebar': {'opened': True, 'width': 344, 'workspaces': {}, 'workspacesDefault': False},
    'terminal': {'height': 280, 'opened': False}, 'review': {'panelOpened': False},
    'fileTree': {'opened': False, 'width': 200, 'tab': 'changes'}, 'session': {'width': 600},
    'mobileSidebar': {'opened': False}, 'sessionTabs': {}, 'sessionView': {}, 'home': {'selection': {}},
}
# Preferences a profile has even if never set in the editor: the good defaults every OpenCode profile should start with.
# compactAt: OpenCode auto-compacts only near the model's context limit (1M tokens on Opus/Sonnet 5.5), so a long chat
# re-sends hundreds of thousands of tokens per message first. We set each model's limit.context to this instead.
OC_PREF_DEFAULTS = dict(sidebar=True, autoCompact=True, compactAt=200000)
OC_PREF_KEYS = ('sounds', 'notifications', 'sidebar', 'autoCompact', 'compactAt')
OC_COMPACT_CHOICES = (0, 100000, 200000, 400000)   # 0 = only at the model's own limit


def oc_compact_limits(conf, models, compact_at):
    """Point each enabled model's context limit at compact_at (or drop our override when 0), keeping everything else."""
    mods = conf.setdefault('providers', {}).setdefault('anthropic', {}).setdefault('models', {})
    for name in (models if compact_at else set(models) | set(mods)):
        entry = mods.setdefault(name, {})
        limit = entry.setdefault('limit', {})
        if compact_at:
            limit['context'] = compact_at
        else:
            limit.pop('context', None)
            if not limit:
                entry.pop('limit')
            if not entry:
                mods.pop(name)
    return conf


def oc_state(iid, name, key, change, default):
    """Change one value of OpenCode Desktop's UI state: in drafts.sqlite, or as a legacy <name> file it imports on first start."""
    desktop = oc_root(iid) / 'desktop'
    db = desktop / 'drafts.sqlite'
    if db.exists():
        con = sqlite3.connect(str(db), timeout=5)
        try:
            row = con.execute('select value from state where name=? and key=?', (name, key)).fetchone()
            value = change(json.loads(row[0]) if row else json.loads(json.dumps(default)))
            con.execute('insert into state(name, key, value, updated_at) values (?, ?, ?, strftime(\'%s\',\'now\')*1000) '
                        'on conflict(name, key) do update set value=excluded.value, updated_at=excluded.updated_at',
                        (name, key, json.dumps(value)))
            con.commit()
        finally:
            con.close()
    else:
        desktop.mkdir(parents=True, exist_ok=True)
        data = read_json(desktop / name)
        old = data.get(key)
        if isinstance(old, str):   # the app's own legacy files hold values as JSON strings
            old = json.loads(old)
        data[key] = change(old if isinstance(old, dict) else json.loads(json.dumps(default)))
        (desktop / name).write_text(json.dumps(data), encoding='utf-8')


def oc_sidebar(layout, opened):
    layout.setdefault('sidebar', dict(OC_LAYOUT_DEFAULT['sidebar']))['opened'] = bool(opened)
    return layout


def apply_oc_prefs(iid):
    """Write the profile's OpenCode preferences that changed since the last time. Only while that OpenCode is closed.

    Each preference is written only when its own value changes, so what the user changes inside OpenCode stays."""
    c = config()
    i = m.get_instance(c, iid)
    if not is_oc(i):
        return dict(applied=False)
    prefs = dict(OC_PREF_DEFAULTS, **(i.get('ocPrefs') or {}))
    done = i.get('ocPrefsApplied') or {}
    todo = {k: v for k, v in prefs.items() if done.get(k) != v}
    if not todo or oc_running(i):
        return dict(applied=False)
    ui = {k: v for k, v in todo.items() if k in ('sounds', 'notifications')}
    if ui:
        oc_state(iid, *OC_SETTINGS, lambda s: oc_patch(s, ui), OC_DEFAULTS)
    if 'sidebar' in todo:
        oc_state(iid, *OC_LAYOUT, lambda layout: oc_sidebar(layout, todo['sidebar']), OC_LAYOUT_DEFAULT)
    if 'autoCompact' in todo or 'compactAt' in todo:
        cfg = oc_root(iid) / 'config' / 'opencode' / 'opencode.json'
        conf = read_json(cfg)
        conf.setdefault('$schema', 'https://opencode.ai/config.json')
        if 'autoCompact' in todo:
            conf['compaction'] = dict(conf.get('compaction') or {}, auto=bool(todo['autoCompact']))
        if 'compactAt' in todo:
            api = read_api(dict(profile=str(profile_path(iid)))) or {}
            oc_compact_limits(conf, [x['name'] for x in api.get('models', [])], todo['compactAt'])
        cfg.parent.mkdir(parents=True, exist_ok=True)
        m._atomic_write_json(cfg, conf, mode=0o600)   # holds the API key: owner-only
    i['ocPrefsApplied'] = prefs
    m.save_config(c)
    return dict(applied=True)


def write_opencode(iid, port, compact_at=OC_PREF_DEFAULTS['compactAt']):
    """OpenCode reads these from its own XDG folders, which we point at ~/.claude-multi/<id>/opencode."""
    api = read_api(dict(profile=str(profile_path(iid))))
    cfg = oc_root(iid) / 'config' / 'opencode'
    cfg.mkdir(parents=True, exist_ok=True)
    settings = dict(apiKey=api['key'])
    if api['provider'] == 'gateway':
        settings['baseURL'] = api['url'] + '/v1'   # OpenCode's Anthropic provider wants the /v1 base, like the Anthropic SDK
    # merge, don't replace: OpenCode adds its own keys (e.g. the service password) and the user may add others
    conf = read_json(cfg / 'opencode.json')
    conf.setdefault('$schema', 'https://opencode.ai/config.json')
    conf['model'] = 'anthropic/' + api['models'][0]['name']
    conf.setdefault('providers', {}).setdefault('anthropic', {})['settings'] = settings
    oc_compact_limits(conf, [x['name'] for x in api['models']], compact_at)   # the model list may have changed
    m._atomic_write_json(cfg / 'opencode.json', conf, mode=0o600)   # holds the API key: owner-only
    m._atomic_write_json(cfg / 'service.json', dict(read_json(cfg / 'service.json'), port=port), mode=0o600)


def read_json(path):
    try:
        v = json.loads(path.read_text(encoding='utf-8'))
        return v if isinstance(v, dict) else {}
    except (OSError, ValueError):
        return {}


def config():
    if not m.CONFIG.exists():                      # first run: only the user's normal Claude (upstream default also adds a cc-switch window)
        c = dict(instances=[dict(PRIMARY)], settings={})
        m.save_config(c)
    return m.read_config()


def profile_path(iid):
    return m.HOME_ROOT / iid / 'profile.json'


def read_api(i):
    if not i.get('profile'):
        return None
    try:
        p = json.loads(Path(i['profile']).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None
    anthropic = p.get('inferenceProvider') == 'anthropic'
    return dict(provider='anthropic' if anthropic else 'gateway',
                url='' if anthropic else p.get('inferenceGatewayBaseUrl', ''),
                key=p.get('inferenceAnthropicApiKey' if anthropic else 'inferenceGatewayApiKey', ''),
                models=[dict(name=x.get('name', ''), label=x.get('labelOverride', ''), supports1m=bool(x.get('supports1m')))
                        for x in p.get('inferenceModels', [])])


def view(i):
    pids = oc_running(i) if is_oc(i) else [pid for pid, _ in m.running(i)]
    return dict(i, primary=m.is_primary(i), running=bool(pids), pids=pids, api=read_api(i),
                clonePath=None if m.is_primary(i) or is_oc(i) else str(m.clone_path(i)), dataDir=str(m.HOME_ROOT / i['id']),
                ocRoot=str(oc_root(i['id'])) if is_oc(i) else None)


def slug(name, taken):
    base = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
    base = re.sub(r'[^a-z0-9]+', '-', base).strip('-') or 'perfil'
    if base == 'official':
        base = 'perfil-official'
    s, n = base, 2
    while s in taken:
        s, n = f'{base}-{n}', n + 1
    return s


def write_profile(iid, api):
    anthropic = api.get('provider') == 'anthropic'
    key = (api.get('key') or '').strip()
    if not key:
        raise m.ClaudeMultiError('Informe a chave da API.')
    if anthropic and not re.fullmatch(r'sk-ant-[\w-]+', key):   # same check Claude Desktop applies to its own key sign-in
        raise m.ClaudeMultiError('Chave da Anthropic inválida: ela começa com sk-ant-. Para outra chave, escolha "Outro endpoint".')
    url = re.sub(r'/v1$', '', (api.get('url') or '').strip().rstrip('/'))
    if not anthropic and not re.match(r'https?://[^\s/]+', url):
        raise m.ClaudeMultiError('Endereço da API inválido. Use algo como https://api.exemplo.com')
    models = [dict(name=x['name'].strip(), labelOverride=(x.get('label') or x['name']).strip(), supports1m=bool(x.get('supports1m')))
              for x in api.get('models', []) if (x.get('name') or '').strip()]
    if not models:
        raise m.ClaudeMultiError('Adicione pelo menos um modelo.')
    prof = dict(inferenceStreamIdleTimeoutSec=1800, defaultModelEffort='medium', inferenceModelPricingEnabled=True, coworkEgressAllowedHosts=['*'],
                disableDeploymentModeChooser=True, inferenceCredentialKind='static', inferenceModels=models)
    if anthropic:   # the format Claude Desktop writes itself when you sign in with a Claude API key
        prof.update(inferenceProvider='anthropic', inferenceAnthropicApiKey=key)
    else:
        prof.update(inferenceProvider='gateway', inferenceGatewayApiKey=key, inferenceGatewayAuthScheme='bearer', inferenceGatewayBaseUrl=url)
    path = profile_path(iid)
    path.parent.mkdir(parents=True, exist_ok=True)
    m._atomic_write_json(path, prof, mode=0o600)   # holds the API key: owner-only
    return str(path)


def save(data):
    c = config()
    p = data['instance']
    name = (p.get('name') or '').strip()
    if not name:
        raise m.ClaudeMultiError('Dê um nome ao perfil.')
    if '/' in name or ':' in name:
        raise m.ClaudeMultiError('O nome não pode ter "/" nem ":".')
    old = m.get_instance(c, p['id']) if p.get('id') else None
    if old and m.is_primary(old):
        # the user's normal Claude: only how it looks here (name, colour, shape, border); never its login or connection
        n = dict(old, name=name)
        palette = p.get('palette') or old.get('palette') or 'official'
        if palette != 'official':
            m.resolve_palette(palette, m.palettes())
        n['palette'] = palette
        if p.get('avatar') in ('bolha', 'nuvem', 'quadrado', 'losango', 'ovo', 'gota'):
            n['avatar'] = p['avatar']
        if 'frame' in p:
            n['frame'] = bool(p['frame'])
        c['instances'] = [n if x['id'] == old['id'] else x for x in c['instances']]
        m.save_config(c)
        return dict(id=old['id'])
    iid = old['id'] if old else slug(name, {x['id'] for x in c['instances']})
    kind = 'official' if p.get('kind') == 'official' else 'cc-switch'
    opencode = p.get('app') == 'opencode'
    if opencode and kind == 'official':
        raise m.ClaudeMultiError('O OpenCode usa uma chave de API: escolha "API própria".')
    palette = p.get('palette') or 'violet'
    m.resolve_palette(palette, m.palettes())
    n = dict(id=iid, name=name, kind=kind, palette=palette)
    if p.get('avatar') in ('bolha', 'nuvem', 'quadrado', 'losango', 'ovo', 'gota'):
        n['avatar'] = p['avatar']
    if 'frame' in p:
        n['frame'] = bool(p['frame'])
    try:
        proxy = m.normalize_proxy(p.get('proxy'))
    except m.ClaudeMultiError:
        raise m.ClaudeMultiError('Proxy inválido. Use http://usuario:senha@host:porta (a porta é obrigatória).') from None
    try:
        tz = m.validate_timezone(p.get('timezone'))
    except m.ClaudeMultiError:
        raise m.ClaudeMultiError('Fuso horário desconhecido. Use um nome como America/Sao_Paulo.') from None
    if opencode:   # proxy / timezone / language are Claude Desktop launch options; OpenCode doesn't take them
        n.update(app='opencode', ocPort=free_oc_port(c, old.get('ocPort') if old else None))
        prefs = {k: (int(v) if k == 'compactAt' else bool(v)) for k, v in (p.get('ocPrefs') or {}).items() if k in OC_PREF_KEYS}
        if prefs.get('compactAt', 0) not in OC_COMPACT_CHOICES:
            raise m.ClaudeMultiError('Valor de compactação inválido.')
        if prefs:
            n['ocPrefs'] = prefs
        if old and old.get('ocPrefsApplied'):
            n['ocPrefsApplied'] = old['ocPrefsApplied']
    else:
        if proxy:
            n['proxy'] = proxy
        if tz:
            n['timezone'] = tz
        if p.get('lang'):
            n['lang'] = p['lang']
    if kind == 'cc-switch':
        n['profile'] = write_profile(iid, data.get('api') or {})
        if opencode:
            write_opencode(iid, n['ocPort'], dict(OC_PREF_DEFAULTS, **n.get('ocPrefs', {}))['compactAt'])
    elif profile_path(iid).exists():
        profile_path(iid).unlink()                 # switched to a Claude account: drop the stored API key
    if old:
        if (oc_running(old) if is_oc(old) else False):
            if opencode != is_oc(old):
                raise m.ClaudeMultiError('Feche a janela deste perfil antes de trocar o aplicativo.')
        elif not is_oc(old) and (old.get('name') != name or old.get('palette') != palette or opencode):   # clone name/icon depend on these: drop the stale clone
            if m.running(old):
                raise m.ClaudeMultiError('Feche a janela deste perfil antes de mudar o nome ou a cor.')
            if m.clone_path(old).exists():
                shutil.rmtree(m.clone_path(old), ignore_errors=True)
        c['instances'] = [n if x['id'] == iid else x for x in c['instances']]
    else:
        c['instances'].append(n)
    m.save_config(c)
    if opencode:
        apply_oc_prefs(iid)   # no-op while that OpenCode is open; then it happens on the next launch
    return dict(id=iid)


def duplicate(iid):
    c = config()
    src = m.get_instance(c, iid)
    if m.is_primary(src):
        raise m.ClaudeMultiError('O Claude principal não pode ser duplicado.')
    name = f"{src['name']} (cópia)"
    n = {k: v for k, v in src.items() if k not in ('profile', 'ocPrefsApplied')}
    n.update(id=slug(name, {x['id'] for x in c['instances']}), name=name)
    if src.get('profile') and Path(src['profile']).exists():
        dst = profile_path(n['id'])
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src['profile'], dst)
        os.chmod(dst, 0o600)
        n['profile'] = str(dst)
    if is_oc(n):
        n['ocPort'] = free_oc_port(c)
        write_opencode(n['id'], n['ocPort'], dict(OC_PREF_DEFAULTS, **n.get('ocPrefs', {}))['compactAt'])
    c['instances'].append(n)
    m.save_config(c)
    return dict(id=n['id'])


def forget(iid):
    """Remove an OpenCode profile from the list; its folder in ~/.claude-multi stays, like Claude profiles."""
    c = config()
    i = m.get_instance(c, iid)
    if not is_oc(i):
        raise m.ClaudeMultiError('forget é só para perfis do OpenCode')
    c['instances'] = [x for x in c['instances'] if x['id'] != iid]
    m.save_config(c)
    return dict(id=iid)


def doctor():
    return [dict(name=r['name'], status=r['status'], message=r['message'], remediation=r.get('remediation'))
            for r in m.run_doctor(instances_path=m.CONFIG)]


def main():
    cmd = sys.argv[1]
    arg = sys.argv[2] if len(sys.argv) > 2 else None
    if cmd == 'state':
        c = config()
        out = dict(instances=[view(i) for i in c['instances']], palettes=m.palettes(), home=str(m.HOME_ROOT))
    elif cmd == 'save':
        out = save(json.load(sys.stdin))
    elif cmd == 'duplicate':
        out = duplicate(arg)
    elif cmd == 'forget':
        out = forget(arg)
    elif cmd == 'oc-prefs':
        out = apply_oc_prefs(arg)
    elif cmd == 'oc-prepare':
        out = oc_prepare(arg)
    elif cmd == 'doctor':
        out = doctor()
    elif cmd == 'outdated':
        c = config()
        out = [dict(id=i['id'], name=i['name'], src=s, clone=v) for i in c['instances'] if not m.is_primary(i) and not is_oc(i) and m.clone_path(i).exists()
               for o, s, v in [m.check_clone_update(i)] if o]
    else:
        raise m.ClaudeMultiError(f'comando desconhecido: {cmd}')
    print(json.dumps(out, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except m.ClaudeMultiError as e:
        print(json.dumps(dict(error=m.mask_secrets(str(e))), ensure_ascii=False))
        sys.exit(1)
