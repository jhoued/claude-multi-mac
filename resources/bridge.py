"""JSON bridge between the Electron app and the upstream claude_multi.py (kept unmodified next to this file).

Usage: python3 bridge.py <command> [arg]   (JSON in on stdin for 'save', JSON out on stdout; errors -> {"error": "..."}, exit 1)
"""
import json, os, re, shutil, sys, unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / 'claude-multi' / 'macos'))
import claude_multi as m  # noqa: E402

PRIMARY = dict(id='official', name='Claude', kind='official', palette='official')


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
    return dict(url=p.get('inferenceGatewayBaseUrl', ''), key=p.get('inferenceGatewayApiKey', ''),
                models=[dict(name=x.get('name', ''), label=x.get('labelOverride', ''), supports1m=bool(x.get('supports1m')))
                        for x in p.get('inferenceModels', [])])


def view(i):
    pids = [pid for pid, _ in m.running(i)]
    return dict(i, primary=m.is_primary(i), running=bool(pids), pids=pids, api=read_api(i),
                clonePath=None if m.is_primary(i) else str(m.clone_path(i)), dataDir=str(m.HOME_ROOT / i['id']))


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
    url = (api.get('url') or '').strip().rstrip('/')
    url = re.sub(r'/v1$', '', url)
    if not re.match(r'https?://[^\s/]+', url):
        raise m.ClaudeMultiError('Endereço da API inválido. Use algo como https://api.exemplo.com')
    key = (api.get('key') or '').strip()
    if not key:
        raise m.ClaudeMultiError('Informe a chave da API.')
    models = [dict(name=x['name'].strip(), labelOverride=(x.get('label') or x['name']).strip(), supports1m=bool(x.get('supports1m')))
              for x in api.get('models', []) if (x.get('name') or '').strip()]
    if not models:
        raise m.ClaudeMultiError('Adicione pelo menos um modelo.')
    prof = dict(inferenceStreamIdleTimeoutSec=1800, defaultModelEffort='medium', inferenceModelPricingEnabled=True, coworkEgressAllowedHosts=['*'],
                disableDeploymentModeChooser=True, inferenceCredentialKind='static', inferenceGatewayApiKey=key, inferenceGatewayAuthScheme='bearer',
                inferenceGatewayBaseUrl=url, inferenceProvider='gateway', inferenceModels=models)
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
    if proxy:
        n['proxy'] = proxy
    if tz:
        n['timezone'] = tz
    if p.get('lang'):
        n['lang'] = p['lang']
    if kind == 'cc-switch':
        n['profile'] = write_profile(iid, data.get('api') or {})
    elif profile_path(iid).exists():
        profile_path(iid).unlink()                 # switched to a Claude account: drop the stored API key
    if old:
        if old.get('name') != name or old.get('palette') != palette:   # clone name/icon depend on these: drop the stale clone
            if m.running(old):
                raise m.ClaudeMultiError('Feche a janela deste perfil antes de mudar o nome ou a cor.')
            if m.clone_path(old).exists():
                shutil.rmtree(m.clone_path(old), ignore_errors=True)
        c['instances'] = [n if x['id'] == iid else x for x in c['instances']]
    else:
        c['instances'].append(n)
    m.save_config(c)
    return dict(id=iid)


def duplicate(iid):
    c = config()
    src = m.get_instance(c, iid)
    if m.is_primary(src):
        raise m.ClaudeMultiError('O Claude principal não pode ser duplicado.')
    name = f"{src['name']} (cópia)"
    n = {k: v for k, v in src.items() if k not in ('profile',)}
    n.update(id=slug(name, {x['id'] for x in c['instances']}), name=name)
    if src.get('profile') and Path(src['profile']).exists():
        dst = profile_path(n['id'])
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src['profile'], dst)
        os.chmod(dst, 0o600)
        n['profile'] = str(dst)
    c['instances'].append(n)
    m.save_config(c)
    return dict(id=n['id'])


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
    elif cmd == 'doctor':
        out = doctor()
    elif cmd == 'outdated':
        c = config()
        out = [dict(id=i['id'], name=i['name'], src=s, clone=v) for i in c['instances'] if not m.is_primary(i) and m.clone_path(i).exists()
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
