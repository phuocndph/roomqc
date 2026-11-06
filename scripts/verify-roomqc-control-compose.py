"""Check public control Compose inputs with RoomQC's pinned CLI on its VPS.

stdin: JSON {base, override, imageReference, syntheticBudget}. No live secrets.
Only temporary public fixture files and a network-none verifier are created.
"""
import hashlib
import json
import os
import pathlib
import shutil
import stat
import subprocess
import sys
import tempfile
import time

CLI = pathlib.Path('/opt/RoomQC/.ops/compose-v5.0.2')
ROOT = pathlib.Path('/opt/RoomQC/.ops/control-images')


def run(args, env=None, check=True):
    return subprocess.run(args, capture_output=True, text=True, timeout=45, check=check, env=env)


def main():
    data = json.load(sys.stdin)
    assert set(data) == {'base', 'override', 'imageReference', 'syntheticBudget'}, 'Only public fixture inputs allowed'
    reference = data['imageReference']
    assert reference.startswith('roomqc/control@sha256:') and len(reference) == len('roomqc/control@sha256:') + 64
    receipt = json.loads((CLI / 'receipt.json').read_text())
    assert receipt['version'] == '5.0.2' and receipt['sha256'] == hashlib.sha256((CLI / 'cli-plugins/docker-compose').read_bytes()).hexdigest()
    assert stat.S_ISDIR(ROOT.lstat().st_mode) and ROOT.stat().st_uid == 0, 'Owned staging directory required'
    assert data['syntheticBudget']['environment'] == 'production', 'Explicit synthetic production shape required'
    assert shutil.disk_usage(ROOT).free >= 10 * 1024 ** 3, 'Disk reserve required'
    before_containers = run(['docker', 'ps', '-aq']).stdout
    with tempfile.TemporaryDirectory(prefix='compose-shape-', dir=ROOT) as directory:
        root = pathlib.Path(directory)
        os.chmod(root, 0o755)  # Public fixture readable by the image's node user.
        (root / 'base.yml').write_text(data['base'])
        (root / 'override.yml').write_text(data['override'])
        (root / '.env.control').write_text('NODE_ENV=production\nROOMQC_RESOURCE_ENVIRONMENT=production\nROOMQC_CONTROL_POOL_MAX=5\nROOMQC_CONTROL_POOL_BUDGET=20\nROOMQC_CONTROL_API_INSTANCES=1\n')
        budget = json.dumps(data['syntheticBudget'])
        (root / 'synthetic-budget.json').write_text(budget)
        env = {key: value for key, value in os.environ.items() if not key.startswith(('ROOMQC_', 'DOCKER_', 'COMPOSE_', 'SUPABASE_', 'GOTRUE_', 'SMTP_', 'RESEND_'))}
        env.update(ROOMQC_CONTROL_IMAGE=reference, ROOMQC_RESOURCE_BUDGET_FILE=str(root / 'synthetic-budget.json'),
                   DOCKER_CONFIG=receipt['dockerConfig'], DOCKER_HOST=receipt['dockerHost'])
        command = ['docker', 'compose', '-p', 'roomqc-packaging-check', '-f', str(root / 'base.yml'), '-f', str(root / 'override.yml'), 'config', '--format', 'json']
        config = json.loads(run(command, env=env).stdout)
        service = config['services']['roomqc-control']
        assert service['image'] == reference and 'build' not in service and service['pull_policy'] == 'never'
        assert service['working_dir'] == '/app' and service['command'] == ['node', 'server.mjs']
        assert service['ports'][0]['host_ip'] == '127.0.0.1'
        assert service['environment']['ROOMQC_CONTROL_MIGRATION_DATABASE_URL'] == ''
        assert service['volumes'][0]['read_only'] is True and service['volumes'][0]['bind']['create_host_path'] is False
        assert run(command, env=dict(env, ROOMQC_CONTROL_IMAGE=''), check=False).returncode != 0
        system_env = {key: value for key, value in env.items() if key not in ('DOCKER_CONFIG', 'DOCKER_HOST')}
        system_config = json.loads(run(command, env=system_env).stdout)
        system_create_path = system_config['services']['roomqc-control']['volumes'][0].get('bind', {}).get('create_host_path')
        manifest = {'schemaVersion': 1, 'environment': 'production', 'budgetFile': str(root / 'synthetic-budget.json'),
                    'budgetSha256': hashlib.sha256(budget.encode()).hexdigest(), 'projects': [
                        {'id': 'roomqc-packaging-check', 'files': [str(root / 'base.yml'), str(root / 'override.yml')],
                         'envFiles': [], 'profiles': [], 'services': [
                             {'name': 'roomqc-control', 'adapter': 'control-api', 'databaseId': 'directory-example', 'image': reference}]}]}
        (root / 'manifest.json').write_text(json.dumps(manifest))
        (root / 'resolved.json').write_text(json.dumps(config))
        verifier = """
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {resourceDeploymentManifest,preflightResourceDeployment} from '/app/resource-deployment.mjs';
const root=process.argv[1],manifest=JSON.parse(await readFile(root+'/manifest.json','utf8'));
const compose=JSON.parse(await readFile(root+'/resolved.json','utf8'));
const result=await preflightResourceDeployment(manifest,{resolveProject:async()=>compose});
assert.equal(result.nativePlanVerified,true);assert.equal(result.fullyCovered,false);assert.equal(result.deploymentReady,false);
const bad=structuredClone(manifest);bad.projects[0].services[0].image=bad.projects[0].services[0].image.split('@')[1];
assert.throws(()=>resourceDeploymentManifest(bad),{code:'RESOURCE_DEPLOYMENT_MANIFEST_INVALID'});
console.log(JSON.stringify({nativePlanVerified:true,fullyCovered:false,deploymentReady:false,bareImageIdDenied:true}));
"""
        tag = hashlib.sha256((data['base'] + data['override']).encode()).hexdigest()
        proof = json.loads(run(['docker', 'run', '--rm', '--read-only', '--network', 'none', '--cap-drop', 'ALL',
                                '--security-opt', 'no-new-privileges', '--memory', '128m', '--cpus', '0.5', '--pids-limit', '64',
                                '--label', 'roomqc.control-compose-check=' + tag,
                                '--mount', 'type=bind,source=' + directory + ',target=' + directory + ',readonly',
                                reference, 'node', '--input-type=module', '-e', verifier, directory]).stdout)
        assert proof['nativePlanVerified'] is True and proof['deploymentReady'] is False
        assert not run(['docker', 'ps', '-aq', '--filter', 'label=roomqc.control-compose-check=' + tag]).stdout.strip()
    assert not pathlib.Path(directory).exists(), 'Public temporary files cleanup required'
    assert run(['docker', 'ps', '-aq']).stdout == before_containers, 'Existing container inventory changed'
    result = {'kind': 'roomqc-control-vps-compose-compatibility', 'verifiedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'composeVersion': receipt['version'], 'systemComposeVersion': receipt['systemComposeVersion'],
              'systemCreateHostPathProjection': system_create_path, 'pinnedCreateHostPathProjection': False,
              'baseSha256': hashlib.sha256(data['base'].encode()).hexdigest(),
              'overrideSha256': hashlib.sha256(data['override'].encode()).hexdigest(), 'imageReference': reference,
              'checks': {'targetComposeResolved': True, 'noBuildOrPull': True, 'loopbackOnly': True, 'processExplicit': True,
                         'migrationCredentialCleared': True, 'readonlyResourceMount': True, 'missingImageDenied': True,
                         'temporaryFilesCleaned': True, 'verificationContainerCleaned': True, 'existingContainersUnchanged': True},
              'actualVpsNativePlan': proof, 'syntheticConfiguration': True, 'serviceStarted': False, 'capacityAccepted': False}
    print(json.dumps(result))


if __name__ == '__main__':
    main()
