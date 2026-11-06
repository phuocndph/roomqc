"""Install RoomQC's pinned Compose CLI without replacing the system plugin.

Only /opt/RoomQC/.ops/compose-v5.0.2 changes. No containers or routing start.
Use DOCKER_CONFIG from the receipt for subsequent RoomQC deployment commands.
"""
import hashlib
import json
import os
import pathlib
import shutil
import stat
import subprocess
import tempfile
import time
import urllib.request

VERSION = '5.0.2'
SHA256 = '2d880f723d3da7c779c54fdaea91a842fca8af55d1397f1ed8d7cbab3dd7af67'
SIZE = 31327024
URL = 'https://github.com/docker/compose/releases/download/v5.0.2/docker-compose-linux-x86_64'
ROOT = pathlib.Path('/opt/RoomQC/.ops/compose-v5.0.2')


def run(args, env=None):
    return subprocess.run(args, capture_output=True, text=True, timeout=30, check=True, env=env)


def digest(file):
    value = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def containers():
    ids = run(['docker', 'ps', '-aq']).stdout.split()
    if not ids:
        return []
    return sorted([{'id': item['Id'], 'image': item['Image'], 'state': item['State']['Status'],
                    'startedAt': item['State']['StartedAt']}
                   for item in json.loads(run(['docker', 'inspect', *ids]).stdout)], key=lambda item: item['id'])


def main():
    assert os.geteuid() == 0 and run(['uname', '-m']).stdout.strip() == 'x86_64', 'Verified x86_64 root target required'
    before_containers = containers()
    site = pathlib.Path('/etc/nginx/sites-available/roomqc.com')
    before_site = digest(site)
    global_version = run(['docker', 'compose', 'version', '--short']).stdout.strip()
    for folder in (pathlib.Path('/opt/RoomQC'), ROOT.parent, ROOT, ROOT / 'cli-plugins', ROOT / 'docker-config'):
        if folder != pathlib.Path('/opt/RoomQC'):
            folder.mkdir(mode=0o700, exist_ok=True)
        info = folder.lstat()
        assert stat.S_ISDIR(info.st_mode) and info.st_uid == 0, 'Expected root-owned regular directory'
    assert shutil.disk_usage(ROOT).free >= 10 * 1024 ** 3 + SIZE * 2, 'Insufficient CLI staging headroom'
    binary = ROOT / 'cli-plugins/docker-compose'
    downloaded = not binary.exists()
    if downloaded:
        fd, name = tempfile.mkstemp(prefix='compose-download-', dir=ROOT)
        try:
            request = urllib.request.Request(URL, headers={'User-Agent': 'RoomQC-pinned-deployment-CLI'})
            with os.fdopen(fd, 'wb') as target, urllib.request.urlopen(request, timeout=30) as response:
                count = 0
                while block := response.read(1024 * 1024):
                    count += len(block)
                    assert count <= SIZE, 'CLI download exceeded pinned size'
                    target.write(block)
                target.flush()
                os.fsync(target.fileno())
            temporary = pathlib.Path(name)
            assert count == SIZE and digest(temporary) == SHA256, 'CLI checksum mismatch'
            os.chmod(temporary, 0o755)
            os.replace(temporary, binary)
        finally:
            pathlib.Path(name).unlink(missing_ok=True)
    info = binary.lstat()
    assert stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_size == SIZE, 'Unexpected CLI binary'
    assert digest(binary) == SHA256, 'Pinned CLI changed'
    config = ROOT / 'docker-config/config.json'
    expected = {'cliPluginsExtraDirs': [str(ROOT / 'cli-plugins')]}
    if config.exists():
        assert stat.S_ISREG(config.lstat().st_mode) and config.stat().st_uid == 0, 'Unexpected CLI configuration'
        assert json.loads(config.read_text()) == expected, 'Existing CLI configuration changed'
    else:
        with config.open('x', encoding='utf-8') as stream:
            json.dump(expected, stream)
        os.chmod(config, 0o600)
    env = {key: value for key, value in os.environ.items() if not key.startswith(('DOCKER_', 'COMPOSE_'))}
    env['DOCKER_CONFIG'] = str(config.parent)
    env['DOCKER_HOST'] = 'unix:///var/run/docker.sock'
    pinned_version = run(['docker', 'compose', 'version', '--short'], env=env).stdout.strip()
    assert pinned_version == VERSION, 'Pinned plugin discovery failed'
    assert run(['docker', 'compose', 'version', '--short']).stdout.strip() == global_version, 'System Compose changed'
    assert containers() == before_containers and digest(site) == before_site, 'Serving application changed'
    assert shutil.disk_usage(ROOT).free >= 10 * 1024 ** 3, 'Disk reserve not retained'
    receipt = {'kind': 'roomqc-pinned-compose-cli', 'verifiedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
               'version': VERSION, 'source': URL, 'sha256': SHA256, 'bytes': SIZE, 'downloaded': downloaded,
               'binary': str(binary), 'dockerConfig': str(config.parent), 'dockerHost': env['DOCKER_HOST'],
               'systemComposeVersion': global_version, 'systemComposeUnchanged': True,
               'existingContainersUnchanged': True, 'nginxSiteUnchanged': True,
               'serviceStarted': False, 'signupOpened': False}
    output = ROOT / 'receipt.json'
    output.write_text(json.dumps(receipt, indent=2) + '\n')
    os.chmod(output, 0o600)
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
