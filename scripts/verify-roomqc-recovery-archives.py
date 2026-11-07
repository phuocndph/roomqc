"""Restore authenticated RoomQC archives only into fresh private staging folders.

The caller establishes private ACLs on --output before invoking this helper.
No archive path, link, device or duplicate may select a live filesystem target.
"""
import argparse, hashlib, json, os, pathlib, re, tarfile

def extended_path(path):
    path = pathlib.Path(path).resolve()
    if os.name != 'nt' or str(path).startswith('\\\\?\\'): return path
    text = str(path)
    return pathlib.Path('\\\\?\\UNC\\' + text[2:] if text.startswith('\\\\') else '\\\\?\\' + text)

def restore(archive, manifest, destination):
    if not __debug__: raise RuntimeError('RECOVERY_ARCHIVE_OPTIMIZATION_FORBIDDEN')
    # A private staging root can already be long on Windows. Use the extended
    # path namespace without changing OS policy or archive member names.
    archive, manifest, destination = map(extended_path, (archive, manifest, destination))
    expected = json.loads(manifest.read_text(encoding='utf-8'))
    assert isinstance(expected, list), 'ARCHIVE_MANIFEST_INVALID'
    by_name = {}
    for row in expected:
        name = row['name']; path = pathlib.PurePosixPath(name)
        assert isinstance(name, str) and name and name == path.as_posix() and not path.is_absolute(), 'ARCHIVE_PATH_INVALID'
        assert '..' not in path.parts and '\\' not in name and ':' not in name and '\0' not in name, 'ARCHIVE_PATH_INVALID'
        assert name not in by_name and isinstance(row['bytes'], int) and 0 <= row['bytes'] <= 256*1024*1024, 'ARCHIVE_MANIFEST_INVALID'
        assert re.fullmatch('[a-f0-9]{64}', row['sha256']), 'ARCHIVE_MANIFEST_INVALID'
        by_name[name] = row
    assert len({name.casefold() for name in by_name}) == len(by_name), 'ARCHIVE_CASE_COLLISION'
    assert not destination.exists(), 'ARCHIVE_OUTPUT_EXISTS'
    destination.mkdir(mode=0o700)
    seen = set()
    with tarfile.open(archive, 'r:') as source:
        for entry in source:
            assert entry.isfile() and not entry.issym() and not entry.islnk(), 'ARCHIVE_ENTRY_INVALID'
            assert entry.name in by_name and entry.name not in seen, 'ARCHIVE_FILE_SET_INVALID'
            row = by_name[entry.name]
            assert entry.size == row['bytes'], 'ARCHIVE_SIZE_MISMATCH'
            target = destination.joinpath(*pathlib.PurePosixPath(entry.name).parts)
            assert target.resolve().is_relative_to(destination.resolve()), 'ARCHIVE_PATH_INVALID'
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            digest = hashlib.sha256(); count = 0
            with source.extractfile(entry) as original, target.open('xb') as output:
                for chunk in iter(lambda: original.read(1024*1024), b''):
                    count += len(chunk); assert count <= row['bytes'], 'ARCHIVE_SIZE_MISMATCH'
                    digest.update(chunk); output.write(chunk)
            assert count == row['bytes'] and digest.hexdigest() == row['sha256'], 'ARCHIVE_CONTENT_MISMATCH'
            assert hashlib.sha256(target.read_bytes()).hexdigest() == row['sha256'], 'ARCHIVE_READBACK_MISMATCH'
            seen.add(entry.name)
    assert seen == set(by_name), 'ARCHIVE_FILE_SET_INVALID'
    return {'files': len(seen), 'bytes': sum(r['bytes'] for r in expected), 'readbackVerified': True}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bundle', required=True); parser.add_argument('--output', required=True)
    args = parser.parse_args(); root = pathlib.Path(args.bundle).resolve(); output = pathlib.Path(args.output).resolve()
    assert output.is_dir() and not output.is_symlink(), 'ARCHIVE_PRIVATE_OUTPUT_REQUIRED'
    storage = restore(root/'storage.tar', root/'storage-files.json', output/'storage')
    config = restore(root/'service-config.tar', root/'service-files.json', output/'service-config')
    print(json.dumps({'storage': storage, 'serviceConfig': config, 'liveFilesystemTargeted': False}))

if __name__ == '__main__':
    try: main()
    except Exception as e:
        code = str(e) if isinstance(e, (AssertionError, RuntimeError)) and re.fullmatch('[A-Z][A-Z_]+', str(e)) else 'RECOVERY_ARCHIVE_FAILED'
        print(json.dumps({'verified': False, 'code': code, 'errorClass': type(e).__name__,
            'errno': getattr(e, 'errno', None), 'winerror': getattr(e, 'winerror', None),
            'pathLength': len(str(getattr(e, 'filename', '') or ''))})); raise SystemExit(1)
