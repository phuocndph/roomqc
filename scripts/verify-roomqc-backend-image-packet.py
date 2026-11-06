"""Read-only verification of the eight-image Docker/OCI transfer packet."""
import argparse
import gzip
import hashlib
import json
import pathlib
import re
import tarfile

SERVICES = ['api-gw', 'auth', 'db', 'functions', 'imgproxy', 'realtime', 'rest', 'storage']
MAX_ARCHIVE = 4 * 1024 ** 3
MAX_EXPANDED = 8 * 1024 ** 3


def sha(data):
    return hashlib.sha256(data).hexdigest()


def verify_packet(packet_file, archive_file, *, fresh_install=False):
    packet = json.loads(pathlib.Path(packet_file).read_text(encoding='utf-8'))
    expected_kind = 'roomqc-fresh-backend-image-transport' if fresh_install else 'roomqc-backend-image-packet'
    services = SERVICES + ['control'] if fresh_install else SERVICES
    image_count = len(services)
    assert packet['kind'] == expected_kind and packet['version'] == 1, 'Invalid packet version'
    assert re.fullmatch(r'[a-f0-9]{64}', packet['backendSourceSha256']), 'Invalid backend binding'
    assert packet['deploymentReady'] is False and packet['signupOpened'] is False, 'Image transfer cannot approve deployment'
    images = packet['images']
    assert [entry['service'] for entry in images] == services, 'Exact backend services required'
    assert len({entry['imageId'] for entry in images}) == image_count, 'Distinct image identities required'
    assert pathlib.Path(archive_file).stat().st_size <= MAX_ARCHIVE, 'Archive byte limit'
    archive_hash = hashlib.sha256()
    with pathlib.Path(archive_file).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            archive_hash.update(chunk)
    with tarfile.open(archive_file, 'r:') as archive:
        members = archive.getmembers()
        names = [member.name for member in members]
        assert len(names) < 2048 and len(names) == len(set(names)), 'Duplicate or excessive archive members'
        for member in members:
            assert member.isfile() or member.isdir(), 'Links and devices forbidden'
            assert member.name in ('blobs', 'blobs/sha256', 'index.json', 'manifest.json', 'oci-layout') or re.fullmatch(r'blobs/sha256/[a-f0-9]{64}', member.name), 'Unexpected archive path'
        def small(name):
            member = archive.getmember(name)
            assert member.isfile() and member.size <= 1024 * 1024, 'Metadata size/type limit'
            return archive.extractfile(member).read()
        index = json.loads(small('index.json'))
        docker_manifest = json.loads(small('manifest.json'))
        assert index['schemaVersion'] == 2 and len(index['manifests']) == len(docker_manifest) == image_count, 'Image count mismatch'
        assert json.loads(small('oci-layout'))['imageLayoutVersion'] == '1.0.0', 'OCI version mismatch'
        descriptors = {entry['digest']: entry for entry in index['manifests']}
        assert len(descriptors) == image_count, 'Duplicate image descriptor'
        tags = {}
        for entry in docker_manifest:
            assert isinstance(entry.get('RepoTags'), list) and len(entry['RepoTags']) == 1, 'Named Docker tag required'
            tag = entry['RepoTags'][0]
            assert tag not in tags, 'Duplicate Docker tag'
            tags[tag] = entry
        verified_layers = {}
        expanded_total = 0
        verified = []
        for image in images:
            identity, tag, reference = image['imageId'], image['tag'], image['reference']
            assert re.fullmatch(r'sha256:[a-f0-9]{64}', identity), 'Invalid immutable image ID'
            assert re.fullmatch(r'[a-z0-9][a-z0-9./_-]*:[a-z0-9][a-z0-9._-]*', tag), 'Invalid transport tag'
            assert reference == tag.rsplit(':', 1)[0] + '@' + identity, 'Named image reference mismatch'
            assert tag in tags and identity in descriptors, 'Image/tag missing from archive'
            descriptor = descriptors[identity]
            annotations = descriptor.get('annotations', {})
            assert annotations.get('org.opencontainers.image.ref.name') == tag.rsplit(':', 1)[1], 'OCI tag binding missing'
            assert annotations.get('io.containerd.image.name') == 'docker.io/' + tag, 'OCI repository binding missing'
            body = small('blobs/sha256/' + identity[7:])
            assert len(body) == descriptor['size'] and sha(body) == identity[7:], 'Image manifest digest mismatch'
            manifest = json.loads(body)
            platform_digest = identity
            # Official images retain a multi-platform index even when Docker
            # has downloaded only linux/amd64. Follow that exact child; never
            # treat an arm64 or provenance descriptor as runnable content.
            for depth in range(4):
                if 'config' in manifest and 'layers' in manifest:
                    break
                assert isinstance(manifest.get('manifests'), list), 'Unsupported image descriptor'
                selected = [entry for entry in manifest['manifests']
                            if entry.get('platform', {}).get('os') == 'linux'
                            and entry.get('platform', {}).get('architecture') == 'amd64']
                assert len(selected) == 1, 'One exact linux/amd64 image required'
                child = selected[0]
                assert re.fullmatch(r'sha256:[a-f0-9]{64}', child['digest']), 'Invalid platform digest'
                body = small('blobs/sha256/' + child['digest'][7:])
                assert len(body) == child['size'] and sha(body) == child['digest'][7:], 'Platform manifest digest mismatch'
                platform_digest = child['digest']
                manifest = json.loads(body)
            assert 'config' in manifest and 'layers' in manifest, 'Image index nesting limit'
            config_descriptor = manifest['config']
            config_path = 'blobs/sha256/' + config_descriptor['digest'][7:]
            config = small(config_path)
            assert len(config) == config_descriptor['size'] and sha(config) == config_descriptor['digest'][7:], 'Config digest mismatch'
            config_json = json.loads(config)
            assert config_json['architecture'] == 'amd64' and config_json['os'] == 'linux', 'Platform mismatch'
            diff_ids = config_json['rootfs']['diff_ids']
            assert diff_ids == image['rootFsLayers'] and 1 <= len(diff_ids) <= 128, 'Filesystem identity mismatch'
            layers = manifest['layers']
            assert len(layers) == len(diff_ids), 'Layer count mismatch'
            expected_paths = ['blobs/sha256/' + layer['digest'][7:] for layer in layers]
            assert tags[tag]['Config'] == config_path and tags[tag]['Layers'] == expected_paths, 'Docker/OCI manifest disagreement'
            for layer, diff_id, path in zip(layers, diff_ids, expected_paths):
                assert re.fullmatch(r'sha256:[a-f0-9]{64}', layer['digest']) and re.fullmatch(r'sha256:[a-f0-9]{64}', diff_id), 'Invalid layer digest'
                member = archive.getmember(path)
                assert member.isfile() and member.size == layer['size'], 'Layer size mismatch'
                if layer['digest'] in verified_layers:
                    assert verified_layers[layer['digest']]['diffId'] == diff_id, 'Shared layer identity differs'
                    continue
                encoded_hash = hashlib.sha256()
                with archive.extractfile(member) as stream:
                    magic = stream.read(4)
                    assert magic != bytes.fromhex('28b52ffd'), 'Unsupported layer compression'
                    encoded_hash.update(magic)
                    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                        encoded_hash.update(chunk)
                assert encoded_hash.hexdigest() == layer['digest'][7:], 'Layer digest mismatch'
                expanded_hash = hashlib.sha256()
                expanded = 0
                with archive.extractfile(member) as raw:
                    stream = gzip.GzipFile(fileobj=raw) if magic[:2] == bytes.fromhex('1f8b') else raw
                    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                        expanded += len(chunk)
                        expanded_total += len(chunk)
                        assert expanded_total <= MAX_EXPANDED, 'Image expansion limit'
                        expanded_hash.update(chunk)
                assert expanded_hash.hexdigest() == diff_id[7:], 'Expanded filesystem digest mismatch'
                verified_layers[layer['digest']] = {'diffId': diff_id, 'expandedBytes': expanded, 'encodedBytes': member.size}
            verified.append({'service': image['service'], 'imageId': identity, 'platformManifestDigest': platform_digest,
                             'reference': reference, 'layers': len(layers)})
    return {'kind': 'roomqc-backend-image-packet-verification', 'archiveSha256': archive_hash.hexdigest(),
            'archiveBytes': pathlib.Path(archive_file).stat().st_size, 'images': verified,
            'uniqueLayers': len(verified_layers), 'expandedLayerTarBytes': expanded_total,
            'layers': [{'digest': digest, **value} for digest, value in verified_layers.items()],
            'namedRepositoryBindingsVerified': True, 'allImageConfigAndLayerDigestsVerified': True,
            'platform': 'linux/amd64', 'uploadedToVps': False, 'deploymentReady': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--packet', required=True)
    parser.add_argument('--archive', required=True)
    parser.add_argument('--fresh-install', action='store_true', help='Verify the distinct closed fresh-install transport, including control; does not approve a production release')
    arguments = parser.parse_args()
    print(json.dumps(verify_packet(arguments.packet, arguments.archive, fresh_install=arguments.fresh_install)))
