"""Self-check for bridge.py profile files: python3 resources/bridge_test.py (uses a throwaway home folder)."""
import json, os, subprocess, sys, tempfile
from pathlib import Path

home = Path(tempfile.mkdtemp())
env = dict(os.environ, CLAUDE_MULTI_HOME=str(home), CLAUDE_MULTI_CONFIG=str(home / '.claude-multi' / 'instances.json'))
bridge = Path(__file__).resolve().parent / 'bridge.py'


def run(*args, data=None):
    r = subprocess.run([sys.executable, str(bridge), *args], input=json.dumps(data) if data else None, capture_output=True, text=True, env=env)
    return json.loads(r.stdout.strip().splitlines()[-1])


models = [dict(name='claude-opus-5-5', label='Opus 5.5', supports1m=True)]

# Anthropic key: written the way Claude Desktop writes its own key sign-in, no gateway fields
r = run('save', data=dict(instance=dict(name='Direto', kind='api'), api=dict(provider='anthropic', key='sk-ant-api03-abc_DEF-1', models=models)))
prof = json.loads((home / '.claude-multi' / r['id'] / 'profile.json').read_text())
assert prof['inferenceProvider'] == 'anthropic' and prof['inferenceAnthropicApiKey'] == 'sk-ant-api03-abc_DEF-1', prof
assert 'inferenceGatewayBaseUrl' not in prof and 'inferenceGatewayApiKey' not in prof, prof

# a non-Anthropic key is refused in Anthropic mode, with a message pointing to "Outro endpoint"
bad = run('save', data=dict(instance=dict(name='Errado', kind='api'), api=dict(provider='anthropic', key='sk-or-123', models=models)))
assert 'sk-ant-' in bad['error'] and 'Outro endpoint' in bad['error'], bad

# gateway keeps the old format
g = run('save', data=dict(instance=dict(name='Gateway', kind='api'), api=dict(provider='gateway', url='https://x.example/v1', key='k', models=models)))
gp = json.loads((home / '.claude-multi' / g['id'] / 'profile.json').read_text())
assert gp['inferenceProvider'] == 'gateway' and gp['inferenceGatewayBaseUrl'] == 'https://x.example' and gp['inferenceGatewayApiKey'] == 'k', gp

# reading back tells the editor which mode each profile uses
apis = {i['id']: i['api'] for i in run('state')['instances'] if i.get('api')}
assert apis[r['id']]['provider'] == 'anthropic' and apis[r['id']]['url'] == '' and apis[r['id']]['key'].startswith('sk-ant-'), apis
assert apis[g['id']]['provider'] == 'gateway' and apis[g['id']]['url'] == 'https://x.example', apis
# OpenCode profiles: own folder, own server port, OpenCode config written next to it
oc = run('save', data=dict(instance=dict(name='OC Um', kind='api', app='opencode', proxy='http://ignorado:1'), api=dict(provider='anthropic', key='sk-ant-oc-1', models=models)))
cfg = home / '.claude-multi' / oc['id'] / 'opencode' / 'config' / 'opencode'
conf = json.loads((cfg / 'opencode.json').read_text())
assert conf['model'] == 'anthropic/claude-opus-5-5' and conf['providers']['anthropic']['settings'] == {'apiKey': 'sk-ant-oc-1'}, conf
assert json.loads((cfg / 'service.json').read_text()) == {'port': 49400}
assert oct((cfg / 'opencode.json').stat().st_mode & 0o777) == '0o600'
oc2 = run('save', data=dict(instance=dict(name='OC Dois', kind='api', app='opencode'), api=dict(provider='gateway', url='https://gw.example/v1', key='k2', models=models)))
cfg2 = home / '.claude-multi' / oc2['id'] / 'opencode' / 'config' / 'opencode'
assert json.loads((cfg2 / 'service.json').read_text()) == {'port': 49401}
assert json.loads((cfg2 / 'opencode.json').read_text())['providers']['anthropic']['settings']['baseURL'] == 'https://gw.example/v1'
# editing keeps the port; a duplicate gets a new one
run('save', data=dict(instance=dict(id=oc['id'], name='OC Um', kind='api', app='opencode'), api=dict(provider='anthropic', key='sk-ant-oc-1', models=models)))
dup = run('duplicate', oc['id'])
st = {i['id']: i for i in run('state')['instances']}
assert st[oc['id']]['ocPort'] == 49400 and st[dup['id']]['ocPort'] == 49402, st
assert 'proxy' not in st[oc['id']] and st[oc['id']]['running'] is False and st[oc['id']]['clonePath'] is None
# a Claude account can't be an OpenCode profile; forget removes only the entry
assert 'API própria' in run('save', data=dict(instance=dict(name='X', kind='official', app='opencode')))['error']
run('forget', dup['id'])
assert dup['id'] not in {i['id'] for i in run('state')['instances']}
print('bridge ok')
