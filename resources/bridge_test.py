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
print('bridge ok')
