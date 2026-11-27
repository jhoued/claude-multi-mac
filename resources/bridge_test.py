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
# OpenCode's own keys survive our rewrite (it adds a service password after first start)
(cfg / 'service.json').write_text(json.dumps({'port': 49400, 'password': 'segredo'}))
conf['theme'] = 'dracula'; (cfg / 'opencode.json').write_text(json.dumps(conf))
# editing keeps the port; a duplicate gets a new one
run('save', data=dict(instance=dict(id=oc['id'], name='OC Um', kind='api', app='opencode'), api=dict(provider='anthropic', key='sk-ant-oc-1', models=models)))
dup = run('duplicate', oc['id'])
st = {i['id']: i for i in run('state')['instances']}
assert st[oc['id']]['ocPort'] == 49400 and st[dup['id']]['ocPort'] == 49402, st
assert json.loads((cfg / 'service.json').read_text()) == {'port': 49400, 'password': 'segredo'}
assert json.loads((cfg / 'opencode.json').read_text())['theme'] == 'dracula'
assert 'proxy' not in st[oc['id']] and st[oc['id']]['running'] is False and st[oc['id']]['clonePath'] is None
# a Claude account can't be an OpenCode profile; forget removes only the entry
assert 'API própria' in run('save', data=dict(instance=dict(name='X', kind='official', app='opencode')))['error']
run('forget', dup['id'])
assert dup['id'] not in {i['id'] for i in run('state')['instances']}
# OpenCode preferences: fresh profile -> default.dat for OpenCode to import on first start
pr = run('save', data=dict(instance=dict(name='OC Sons', kind='api', app='opencode', ocPrefs=dict(sounds=False, notifications=True)), api=dict(provider='anthropic', key='sk-ant-oc-3', models=models)))
desk = home / '.claude-multi' / pr['id'] / 'opencode' / 'desktop'
dat = json.loads((desk / 'default.dat').read_text())['settings.v3']
assert dat['sounds']['agentEnabled'] is False and dat['sounds']['interfaceEnabled'] is False and dat['notifications']['permissions'] is True, dat
# good defaults even when the editor never sent them: sidebar open, automatic compaction on (keeping the API key)
lay = json.loads((desk / 'opencode.global.dat').read_text())['layout']
assert lay['sidebar']['opened'] is True and lay['sidebar']['width'] == 344 and lay['sessionTabs'] == {}, lay
pconf = json.loads((home / '.claude-multi' / pr['id'] / 'opencode' / 'config' / 'opencode' / 'opencode.json').read_text())
assert pconf['compaction'] == {'auto': True} and pconf['providers']['anthropic']['settings']['apiKey'] == 'sk-ant-oc-3', pconf
# profiles saved before these preferences existed pick them up on their next launch
ipath = home / '.claude-multi' / 'instances.json'
inst = json.loads(ipath.read_text())
for x in inst['instances']:
    if x['id'] == oc['id']:
        x.pop('ocPrefsApplied', None)
ipath.write_text(json.dumps(inst))
(cfg / 'opencode.json').write_text(json.dumps({k: v for k, v in json.loads((cfg / 'opencode.json').read_text()).items() if k != 'compaction'}))
assert run('oc-prefs', oc['id']) == {'applied': True}
assert json.loads((cfg / 'opencode.json').read_text())['compaction'] == {'auto': True}
assert json.loads((home / '.claude-multi' / oc['id'] / 'opencode' / 'desktop' / 'opencode.global.dat').read_text())['layout']['sidebar']['opened'] is True
assert run('oc-prefs', oc['id']) == {'applied': False}
# profile already used: OpenCode's database exists with the user's own changes; ours patch only what changed in the profile
(desk / 'default.dat').unlink()
import sqlite3
con = sqlite3.connect(str(desk / 'drafts.sqlite'))
con.execute('create table state (name text not null, key text not null, value text not null, updated_at integer not null, primary key(name, key))')
con.execute("insert into state values ('default.dat', 'settings.v3', ?, 1)", (json.dumps({'appearance': {'fontSize': 18}, 'sounds': {'agentEnabled': True}}),))
con.commit(); con.close()
run('save', data=dict(instance=dict(id=pr['id'], name='OC Sons', kind='api', app='opencode', ocPrefs=dict(sounds=False, notifications=False)), api=dict(provider='anthropic', key='sk-ant-oc-3', models=models)))
row = json.loads(sqlite3.connect(str(desk / 'drafts.sqlite')).execute("select value from state where key='settings.v3'").fetchone()[0])
assert row['appearance']['fontSize'] == 18 and row['sounds']['agentEnabled'] is True and row['notifications']['agent'] is False, row
# turning the sidebar off patches the existing layout row, keeping the rest
con = sqlite3.connect(str(desk / 'drafts.sqlite'))
con.execute("insert into state values ('opencode.global.dat', 'layout', ?, 1)", (json.dumps({'sidebar': {'opened': True, 'width': 400}, 'terminal': {'height': 300, 'opened': True}}),))
con.commit(); con.close()
run('save', data=dict(instance=dict(id=pr['id'], name='OC Sons', kind='api', app='opencode', ocPrefs=dict(sounds=False, notifications=False, sidebar=False)), api=dict(provider='anthropic', key='sk-ant-oc-3', models=models)))
lay = json.loads(sqlite3.connect(str(desk / 'drafts.sqlite')).execute("select value from state where key='layout'").fetchone()[0])
assert lay == {'sidebar': {'opened': False, 'width': 400}, 'terminal': {'height': 300, 'opened': True}}, lay
con = sqlite3.connect(str(desk / 'drafts.sqlite')); con.execute("delete from state where key='layout'"); con.commit(); con.close()
# same preferences again: nothing rewritten, so changes made inside OpenCode survive
con = sqlite3.connect(str(desk / 'drafts.sqlite')); con.execute("update state set value='{\"sounds\": {\"agentEnabled\": true}}'"); con.commit(); con.close()
assert run('oc-prefs', pr['id']) == {'applied': False}
assert json.loads(sqlite3.connect(str(desk / 'drafts.sqlite')).execute('select value from state').fetchone()[0]) == {'sounds': {'agentEnabled': True}}
print('bridge ok')
