"""Verify and stage a public source packet. Never executes its contents.

Via verified SSH: python3 - --prepare|--verify SOURCE ARCHIVE MANIFEST BYTES
Only /opt/RoomQC/.ops/source-packets/SOURCE/ARCHIVE may change.
"""
import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import tarfile
import tempfile
import time

ROOT = pathlib.Path('/opt/RoomQC/.ops/source-packets')
MAX_TOTAL = 64 * 1024 * 1024
MAX_FILE = 4 * 1024 * 1024


def sha(data):
    return hashlib.sha256(data).hexdigest()


def owned_directory(path):
    info = path.lstat()
    assert stat.S_ISDIR(info.st_mode) and info.st_uid == 0, 'Owned directory required'
    assert not info.st_mode & 0o022, 'Writable directory forbidden'


def regular(path, limit):
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1, 'Owned regular file required'
    assert not info.st_mode & 0o022 and info.st_size <= limit, 'Invalid file mode or size'
    return path.read_bytes()


def valid_source_path(path):
    assert isinstance(path, str) and re.fullmatch(r'[A-Za-z0-9_/-]+(?:\.[A-Za-z0-9_-]+)*', path), 'Invalid source path'
    assert all(part and part not in ('.', '..', 'node_modules') for part in path.split('/')), 'Invalid source segment'
    assert path.startswith(('server/control/', 'scripts/', 'deploy/', 'supabase/migrations/', 'supabase/functions/')) or path in ('package.json', 'package-lock.json', 'docker-compose.control.yml'), 'Path outside public source roots'
    assert not re.search(r'(^|/)(?:\.env|\.local|\.secrets|backups)(?:/|$)', path), 'Private path forbidden'


def check_archive(path, manifest_hash, source_hash):
    with tarfile.open(path, 'r:gz') as archive:
        files = {}
        total = 0
        directories = set()
        for index, item in enumerate(archive):
            assert index < 8192, 'Archive member limit'
            name = item.name
            if name == '.':
                assert item.isdir(), 'Archive root must be a directory'
                continue
            if name.startswith('./'):
                name = name[2:]
            if item.isdir():
                name = name.rstrip('/')
                assert re.fullmatch(r'[A-Za-z0-9_/-]+', name), 'Invalid directory path'
                assert all(part and part not in ('.', '..', 'node_modules') for part in name.split('/')), 'Invalid directory segment'
                assert name not in directories, 'Duplicate directory'
                directories.add(name)
            else:
                assert item.isfile() and not item.issym() and not item.islnk(), 'Only regular source files allowed'
                if name != 'packet.json':
                    valid_source_path(name)
                assert name not in files and 0 <= item.size <= MAX_FILE, 'Duplicate or oversized file'
                total += item.size
                assert total <= MAX_TOTAL, 'Archive expansion limit'
                data = archive.extractfile(item).read(MAX_FILE + 1)
                assert len(data) == item.size, 'File size mismatch'
                assert not re.search(rb'^-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=]{32,}', data, re.M), 'Private key forbidden'
                files[name] = data
        manifest_bytes = files.get('packet.json')
        assert manifest_bytes is not None and sha(manifest_bytes) == manifest_hash, 'Manifest digest mismatch'
        manifest = json.loads(manifest_bytes)
        assert manifest['kind'] == 'roomqc-candidate-source-packet' and manifest['version'] == 1, 'Invalid packet version'
        assert manifest['backendSourceSha256'] == source_hash, 'Source binding mismatch'
        assert manifest['deploymentReady'] is False and manifest['signupOpened'] is False, 'Packet cannot approve deployment'
        assert isinstance(manifest['files'], list) and len(manifest['files']) <= 4096, 'Source count limit'
        expected = {}
        for item in manifest['files']:
            valid_source_path(item['path'])
            assert item['path'] not in expected, 'Duplicate manifest file'
            assert re.fullmatch(r'[a-f0-9]{64}', item['sha256']), 'Invalid file hash'
            assert type(item['bytes']) is int and 0 <= item['bytes'] <= MAX_FILE, 'Invalid file size'
            expected[item['path']] = item
        assert set(files) == set(expected) | {'packet.json'}, 'Archive file set mismatch'
        assert sum(item['bytes'] for item in expected.values()) == manifest['totalBytes'], 'Total size mismatch'
        for name, item in expected.items():
            assert len(files[name]) == item['bytes'] and sha(files[name]) == item['sha256'], 'Source content mismatch'
        if 'deploymentInputs' in manifest:
            inputs = manifest['deploymentInputs']
            assert isinstance(inputs, list) and len(inputs) <= 128, 'Invalid deployment inputs'
            seen_inputs = set()
            for item in inputs:
                assert isinstance(item, dict) and set(item) == {'path', 'sha256', 'bytes'}, 'Invalid deployment input'
                name = item['path']
                valid_source_path(name)
                assert name not in seen_inputs and item == expected.get(name), 'Deployment input mismatch'
                seen_inputs.add(name)
        expected_directories = set()
        for name in expected:
            expected_directories.update(str(parent) for parent in pathlib.PurePosixPath(name).parents if str(parent) != '.')
        assert directories <= expected_directories, 'Unexpected directory'
        return manifest, files


def verify_tree(root, files):
    owned_directory(root)
    found = set()
    for directory, subdirs, names in os.walk(root, followlinks=False):
        for name in subdirs:
            owned_directory(pathlib.Path(directory) / name)
        for name in names:
            file = pathlib.Path(directory) / name
            relative = file.relative_to(root).as_posix()
            assert relative in files, 'Unexpected staged file'
            assert regular(file, MAX_FILE) == files[relative], 'Staged content mismatch'
            found.add(relative)
    assert found == set(files), 'Staged file missing'


def main():
    import sys
    values = sys.argv[1:]
    assert len(values) == 5 and values[0] in ('--prepare', '--verify'), 'Invalid arguments'
    action, source_hash, archive_hash, manifest_hash, byte_text = values
    assert all(re.fullmatch(r'[a-f0-9]{64}', value) for value in (source_hash, archive_hash, manifest_hash)), 'Invalid digest'
    size = int(byte_text)
    assert 0 < size <= MAX_TOTAL, 'Packet byte limit'
    for parent in (pathlib.Path('/opt'), pathlib.Path('/opt/RoomQC'), pathlib.Path('/opt/RoomQC/.ops')):
        owned_directory(parent)
    for directory in (ROOT, ROOT / source_hash, ROOT / source_hash / archive_hash):
        directory.mkdir(mode=0o700, exist_ok=True)
        owned_directory(directory)
    root = ROOT / source_hash / archive_hash
    assert shutil.disk_usage(root).free >= 10 * 1024 ** 3 + 2 * MAX_TOTAL, 'Disk staging reserve required'
    if action == '--prepare':
        print(json.dumps({'kind': 'roomqc-source-packet-staging-location', 'root': str(root), 'runtimeChanged': False}))
        return
    packet = root / 'sources.tar.gz'
    data = regular(packet, MAX_TOTAL)
    assert len(data) == size and sha(data) == archive_hash, 'Archive digest or size mismatch'
    manifest, files = check_archive(packet, manifest_hash, source_hash)
    destination = root / 'sources'
    if destination.exists() or destination.is_symlink():
        verify_tree(destination, files)
    else:
        temporary = pathlib.Path(tempfile.mkdtemp(prefix='verified-', dir=root))
        try:
            for name, content in files.items():
                target = temporary / name
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                with target.open('xb') as stream:
                    stream.write(content)
                target.chmod(0o444)
            verify_tree(temporary, files)
            temporary.rename(destination)
        finally:
            if temporary.exists():
                shutil.rmtree(temporary)
    result = {'kind': 'roomqc-vps-source-packet-staged', 'verifiedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'root': str(root), 'backendSourceSha256': source_hash, 'archiveSha256': archive_hash,
              'manifestSha256': manifest_hash, 'files': len(manifest['files']), 'totalBytes': manifest['totalBytes'],
              'businessMigrations': manifest['businessMigrations'], 'edgeSourceFiles': manifest['edgeSourceFiles'],
              'deploymentInputs': manifest.get('deploymentInputs', []),
              'fullRun': manifest['fullReference']['run'], 'contentsExecuted': False,
              'runtimeChanged': False, 'deploymentReady': False, 'signupOpened': False}
    receipt = root / 'receipt.json'
    if receipt.exists():
        regular(receipt, MAX_FILE)
    temporary_receipt = root / 'receipt.pending'
    with temporary_receipt.open('x') as stream:
        json.dump(result, stream, indent=2)
        stream.write('\n')
    temporary_receipt.chmod(0o600)
    temporary_receipt.replace(receipt)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
