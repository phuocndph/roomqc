"""Stage and check an exact control image on the existing RoomQC VPS.

Run through verified SSH: python3 - --prepare|--verify SOURCE ARCHIVE IMAGE BYTES MANIFEST.
Only /opt/RoomQC/.ops/control-images/SOURCE/ARCHIVE and the Docker image store change.
No database, long-running service, public port or signup switch is modified.
"""
import argparse
import gzip
import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import tarfile
import time


def run(args, timeout=30):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=True)


def digest(file):
    value = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def regular(file):
    info = file.lstat()
    assert stat.S_ISREG(info.st_mode) and info.st_uid == 0, 'Expected root-owned regular file'
    return info


def expanded_layers(archive):
    # Docker's image Size can be compressed metadata. Bound the actual tar
    # streams before loading; this helper only stages the small control image.
    total = 0
    with tarfile.open(archive, 'r:') as source:
        manifest = json.load(source.extractfile('manifest.json'))
        assert len(manifest) == 1, 'One control image per archive required'
        for name in set(manifest[0]['Layers']):
            member = source.getmember(name)
            assert member.isfile(), 'Regular image layer required'
            magic = source.extractfile(member).read(4)
            assert magic != bytes.fromhex('28b52ffd'), 'Unsupported compressed image layer'
            stream = source.extractfile(member)
            if magic[:2] == bytes.fromhex('1f8b'):
                stream = gzip.GzipFile(fileobj=stream)
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                total += len(block)
                assert total + 64 * 1024 * 1024 <= 1024 ** 3, 'Control image expansion budget exceeded'
    return total


def image_descriptor(archive, expected_image, expected_tag):
    with tarfile.open(archive, 'r:') as source:
        names = source.getnames()
        assert len(names) == len(set(names)), 'Duplicate archive members forbidden'
        index = json.load(source.extractfile('index.json'))
        assert len(index['manifests']) == 1, 'One control image index required'
        descriptor = index['manifests'][0]
        assert descriptor['digest'] == expected_image, 'Archive image digest differs'
        annotations = descriptor.get('annotations', {})
        assert annotations.get('org.opencontainers.image.ref.name') == expected_tag.rsplit(':', 1)[1], 'Archive tag binding missing'
        assert annotations.get('io.containerd.image.name') == 'docker.io/' + expected_tag, 'Archive repository binding missing'
        member = source.getmember('blobs/sha256/' + expected_image.split(':')[1])
        body = source.extractfile(member).read()
        assert len(body) == descriptor['size'] and hashlib.sha256(body).hexdigest() == expected_image.split(':')[1], 'Archive manifest bytes differ'
        manifest = json.load(source.extractfile('manifest.json'))
        assert len(manifest) == 1 and manifest[0]['RepoTags'] == [expected_tag], 'Docker image tag binding differs'


def containers():
    ids = run(['docker', 'ps', '-aq']).stdout.split()
    if not ids:
        return []
    values = json.loads(run(['docker', 'inspect', *ids]).stdout)
    return sorted([{'id': value['Id'], 'name': value['Name'], 'image': value['Image'],
                    'state': value['State']['Status'], 'startedAt': value['State']['StartedAt']}
                   for value in values], key=lambda value: value['id'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['--prepare', '--verify'])
    parser.add_argument('source')
    parser.add_argument('archive')
    parser.add_argument('image')
    parser.add_argument('bytes', type=int)
    parser.add_argument('manifest')
    # These operation names are positional tokens, not optional flags.
    import sys
    raw = sys.argv[1:]
    assert raw and raw[0] in ('--prepare', '--verify'), 'Explicit stage operation required'
    args = parser.parse_args(['--', *raw])
    assert os.geteuid() == 0, 'Root required for this exact staging directory'
    assert all(re.fullmatch('[a-f0-9]{64}', value) for value in
               (args.source, args.archive, args.manifest)), 'Invalid SHA256'
    assert re.fullmatch('sha256:[a-f0-9]{64}', args.image), 'Immutable image ID required'
    assert 0 < args.bytes < 512 * 1024 * 1024, 'Unexpected archive size'
    assert run(['uname', '-m']).stdout.strip() == 'x86_64', 'Wrong target architecture'
    base = pathlib.Path('/opt/RoomQC')
    source_root = base / '.ops/control-images' / args.source
    for folder in (base, base / '.ops', base / '.ops/control-images', source_root, source_root / args.archive):
        if folder != base:
            folder.mkdir(mode=0o700, exist_ok=True)
        info = folder.lstat()
        assert stat.S_ISDIR(info.st_mode) and info.st_uid == 0, 'Unexpected staging path owner/type'
    root = source_root / args.archive
    os.chmod(root, 0o700)
    expected = {'sourceHash': args.source, 'archiveSha256': args.archive, 'imageId': args.image,
                'archiveBytes': args.bytes, 'manifestSha256': args.manifest}
    metadata = root / 'upload.json'
    if metadata.exists():
        regular(metadata)
        assert json.loads(metadata.read_text()) == expected, 'Existing staging binding differs'
    else:
        with metadata.open('x', encoding='utf-8') as stream:
            json.dump(expected, stream)
        os.chmod(metadata, 0o600)
    # Include a bounded expansion allowance, not only compressed image Size.
    # Verification below checks that allowance before any Docker image load.
    available = shutil.disk_usage(root).free
    reserve = 10 * 1024 * 1024 * 1024
    present = subprocess.run(['docker', 'image', 'inspect', args.image], capture_output=True, text=True)
    expansion_allowance = 1024 ** 3 if present.returncode != 0 else 0
    assert available >= reserve + args.bytes * 2 + expansion_allowance, 'Insufficient staging disk headroom'
    if args.mode == '--prepare':
        print(json.dumps({'prepared': True, 'path': str(root), 'availableBytes': available,
                          'reserveBytes': reserve, 'expansionAllowanceBytes': expansion_allowance,
                          'runtimeChanged': False}))
        return
    archive, manifest = root / 'image.tar', root / 'image.json'
    assert regular(archive).st_size == args.bytes, 'Archive length differs'
    assert regular(manifest).st_size < 1024 * 1024, 'Manifest too large'
    assert digest(archive) == args.archive and digest(manifest) == args.manifest, 'Transferred bytes differ'
    expanded = expanded_layers(archive)
    os.chmod(archive, 0o600)
    os.chmod(manifest, 0o600)
    receipt = json.loads(manifest.read_text())
    assert receipt['kind'] == 'roomqc-control-deployment-image' and receipt['version'] == 1
    assert receipt['imageId'] == args.image and receipt['sourceHash'] == args.source
    assert receipt['buildVerified'] is True and receipt['sourceUnchanged'] is True
    assert receipt['platform'] == 'linux/amd64'
    image_reference = 'roomqc/control@' + args.image
    assert receipt['imageReference'] == image_reference, 'Manifest named digest binding missing'
    assert receipt['tag'] == 'roomqc/control:source-' + args.source[:20], 'Control build tag differs'
    image_descriptor(archive, args.image, receipt['tag'])
    packaged = []
    for file in receipt['sources']:
        assert re.fullmatch('server/control/(?:[a-zA-Z0-9_.-]+/)*[a-zA-Z0-9_.-]+', file['path'])
        assert '..' not in file['path'].split('/') and re.fullmatch('[a-f0-9]{64}', file['sha256'])
        if file['path'] != 'server/control/Dockerfile':
            packaged.append({'path': file['path'][len('server/control/'):], 'sha256': file['sha256']})
    assert packaged and len(packaged) < 1024
    verification = root / 'verification.json'
    verification.write_text(json.dumps(packaged), encoding='utf-8')
    os.chmod(verification, 0o644)
    before = containers()
    loaded = present.returncode != 0
    reference_present = subprocess.run(['docker', 'image', 'inspect', image_reference], capture_output=True, text=True)
    reference_loaded = reference_present.returncode != 0
    if loaded or reference_loaded:
        run(['docker', 'image', 'load', '--input', str(archive)], timeout=120)
    image = json.loads(run(['docker', 'image', 'inspect', args.image]).stdout)[0]
    assert image['Id'] == args.image and image['Os'] == 'linux' and image['Architecture'] == 'amd64'
    assert image['Size'] == receipt['imageBytes'] and image['Config']['User'] == 'node'
    assert image['Config']['Labels']['roomqc.control.inputs'] == args.source
    assert image['Config']['Labels']['roomqc.control.backend'] == receipt['backendSourceSha256']
    referenced = json.loads(run(['docker', 'image', 'inspect', image_reference]).stdout)[0]
    assert referenced['Id'] == args.image and image_reference in image['RepoDigests'], 'Named immutable image not retained after load'
    source = """
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
assert.notEqual(process.getuid(),0);
const files=JSON.parse(await readFile('/verification.json','utf8'));
for(const file of files)assert.equal(createHash('sha256').update(await readFile('/app/'+file.path)).digest('hex'),file.sha256);
assert.deepEqual((await readdir('/app')).sort(),[...new Set(files.map(f=>f.path.split('/')[0])),'node_modules'].sort());
await import('/app/server.mjs');await import('/app/workers/setup-worker.mjs');
for(const dependency of ['pg','jose','web-push','ws'])await import(dependency);
console.log(JSON.stringify({files:files.length,importsVerified:true,unprivileged:true}));
"""
    check = json.loads(run(['docker', 'run', '--rm', '--read-only', '--network', 'none',
                           '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                           '--memory', '128m', '--cpus', '0.5', '--pids-limit', '64',
                           '--label', 'roomqc.control-image-stage=' + args.source,
                           '--mount', 'type=bind,source=' + str(verification) + ',target=/verification.json,readonly',
                           args.image, 'node', '--input-type=module', '-e', source], timeout=30).stdout)
    assert check == {'files': len(packaged), 'importsVerified': True, 'unprivileged': True}
    assert containers() == before, 'An existing service changed during staging'
    remaining = run(['docker', 'ps', '-aq', '--filter', 'label=roomqc.control-image-stage=' + args.source]).stdout.strip()
    assert not remaining, 'Verification container cleanup required'
    assert shutil.disk_usage(root).free >= reserve, 'Post-staging disk reserve not retained'
    result = {'kind': 'roomqc-control-image-vps-staging', 'version': 1,
              'verifiedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              **expected, 'imageBytes': image['Size'], 'backendSourceSha256': receipt['backendSourceSha256'],
              'expandedLayerTarBytes': expanded, 'diskReserveBytes': reserve,
              'directory': str(root), 'newlyLoaded': loaded, 'verification': check,
              'imageReference': image_reference, 'namedReferenceLoaded': reference_loaded,
              'verificationNetwork': 'none', 'verificationCleanup': True,
              'existingContainersUnchanged': True, 'diskAvailableBytes': shutil.disk_usage(root).free,
              'serviceStarted': False, 'runtimeVerified': False, 'signupOpened': False}
    output = root / 'staged.json'
    output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    os.chmod(output, 0o600)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
