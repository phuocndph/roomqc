import gzip
import hashlib
import importlib.util
import io
import json
import pathlib
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('packet', pathlib.Path(__file__).with_name('verify-roomqc-backend-image-packet.py'))
packet_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packet_module)
sha = lambda value: hashlib.sha256(value).hexdigest()
encode = lambda value: json.dumps(value, separators=(',', ':')).encode()


def fixture(architecture='amd64', unsupported=False, nested=False, duplicate_platform=False, services=None):
    expanded = b'synthetic layer bytes\n'
    layer = bytes.fromhex('28b52ffd') + b'unsupported' if unsupported else gzip.compress(expanded, mtime=0)
    layer_digest = 'sha256:' + sha(layer)
    blobs = {'blobs/sha256/' + sha(layer): layer, 'oci-layout': encode({'imageLayoutVersion': '1.0.0'})}
    images, descriptors, docker = [], [], []
    for service in services or packet_module.SERVICES:
        config = encode({'architecture': architecture, 'os': 'linux', 'rootfs': {'type': 'layers', 'diff_ids': ['sha256:' + sha(expanded)]}, 'config': {'Labels': {'service': service}}})
        config_digest = 'sha256:' + sha(config)
        config_path = 'blobs/sha256/' + sha(config)
        blobs[config_path] = config
        manifest = encode({'schemaVersion': 2, 'config': {'digest': config_digest, 'size': len(config)},
                           'layers': [{'digest': layer_digest, 'size': len(layer)}]})
        identity = 'sha256:' + sha(manifest)
        blobs['blobs/sha256/' + sha(manifest)] = manifest
        if nested:
            child = {'digest': identity, 'size': len(manifest), 'platform': {'architecture': architecture, 'os': 'linux'}}
            children = [child, child] if duplicate_platform else [child, {'digest': 'sha256:' + '0' * 64, 'size': 1, 'platform': {'architecture': 'arm64', 'os': 'linux'}}]
            manifest = encode({'schemaVersion': 2, 'manifests': children})
            identity = 'sha256:' + sha(manifest)
            blobs['blobs/sha256/' + sha(manifest)] = manifest
        tag = 'roomqc/test-' + service + ':candidate'
        images.append({'service': service, 'tag': tag, 'reference': tag.split(':')[0] + '@' + identity,
                       'imageId': identity, 'rootFsLayers': ['sha256:' + sha(expanded)]})
        descriptors.append({'digest': identity, 'size': len(manifest), 'annotations': {
            'org.opencontainers.image.ref.name': 'candidate', 'io.containerd.image.name': 'docker.io/' + tag}})
        docker.append({'Config': config_path, 'RepoTags': [tag], 'Layers': ['blobs/sha256/' + sha(layer)]})
    blobs['index.json'] = encode({'schemaVersion': 2, 'manifests': descriptors})
    blobs['manifest.json'] = encode(docker)
    packet = {'kind': 'roomqc-backend-image-packet', 'version': 1, 'backendSourceSha256': 'a' * 64,
              'images': images, 'deploymentReady': False, 'signupOpened': False}
    return packet, blobs


class ImagePacketTests(unittest.TestCase):
    def verify(self, transform=None, architecture='amd64', unsupported=False, duplicate=False, nested=False, duplicate_platform=False, services=None, fresh_install=False):
        packet, blobs = fixture(architecture, unsupported, nested, duplicate_platform, services)
        if transform:
            transform(packet, blobs)
        with tempfile.TemporaryDirectory() as directory:
            directory = pathlib.Path(directory)
            descriptor, archive = directory / 'images.json', directory / 'images.tar'
            descriptor.write_bytes(encode(packet))
            with tarfile.open(archive, 'w') as output:
                for name, content in blobs.items():
                    item = tarfile.TarInfo(name)
                    item.size = len(content)
                    output.addfile(item, io.BytesIO(content))
                if duplicate:
                    item = tarfile.TarInfo('index.json')
                    item.size = len(blobs['index.json'])
                    output.addfile(item, io.BytesIO(blobs['index.json']))
            return packet_module.verify_packet(descriptor, archive, fresh_install=fresh_install)

    def test_closed_fresh_transport_has_its_own_exact_nine_image_contract(self):
        def transform(packet, blobs):
            packet['kind'] = 'roomqc-fresh-backend-image-transport'
        result = self.verify(transform, services=packet_module.SERVICES + ['control'], fresh_install=True)
        self.assertEqual(len(result['images']), 9)
        self.assertEqual(result['uniqueLayers'], 1)
        self.assertGreater(result['layers'][0]['encodedBytes'], 0)
        self.assertGreater(result['layers'][0]['expandedBytes'], 0)

    def test_fresh_transport_does_not_satisfy_default_full_packet_contract(self):
        def transform(packet, blobs):
            packet['kind'] = 'roomqc-fresh-backend-image-transport'
        with self.assertRaisesRegex(AssertionError, 'Invalid packet version'):
            self.verify(transform, services=packet_module.SERVICES + ['control'])

    def test_fresh_transport_requires_control_image(self):
        def transform(packet, blobs):
            packet['kind'] = 'roomqc-fresh-backend-image-transport'
        with self.assertRaisesRegex(AssertionError, 'Exact backend services'):
            self.verify(transform, fresh_install=True)

    def test_named_multi_image_packet(self):
        result = self.verify()
        self.assertEqual(len(result['images']), 8)
        self.assertEqual(result['uniqueLayers'], 1)
        self.assertTrue(result['namedRepositoryBindingsVerified'])

    def test_official_multi_platform_index_selects_exact_amd64_child(self):
        result = self.verify(nested=True)
        self.assertEqual(len(result['images']), 8)
        self.assertTrue(all(image['imageId'] != image['platformManifestDigest'] for image in result['images']))

    def test_ambiguous_platform_index(self):
        with self.assertRaisesRegex(AssertionError, 'One exact linux/amd64'):
            self.verify(nested=True, duplicate_platform=True)

    def test_bare_id_archive_is_not_a_named_packet(self):
        def transform(packet, blobs):
            manifest = json.loads(blobs['manifest.json'])
            manifest[0]['RepoTags'] = None
            blobs['manifest.json'] = encode(manifest)
        with self.assertRaisesRegex(AssertionError, 'Named Docker tag'):
            self.verify(transform)

    def test_repository_annotation_is_required(self):
        def transform(packet, blobs):
            index = json.loads(blobs['index.json'])
            index['manifests'][0]['annotations']['io.containerd.image.name'] = 'docker.io/roomqc/wrong:candidate'
            blobs['index.json'] = encode(index)
        with self.assertRaisesRegex(AssertionError, 'repository binding'):
            self.verify(transform)

    def test_corrupt_config(self):
        def transform(packet, blobs):
            path = json.loads(blobs['manifest.json'])[0]['Config']
            blobs[path] = bytes([blobs[path][0] ^ 1]) + blobs[path][1:]
        with self.assertRaisesRegex(AssertionError, 'Config digest'):
            self.verify(transform)

    def test_corrupt_layer(self):
        def transform(packet, blobs):
            path = json.loads(blobs['manifest.json'])[0]['Layers'][0]
            blobs[path] = blobs[path][:-1] + bytes([blobs[path][-1] ^ 1])
        with self.assertRaisesRegex(AssertionError, 'Layer digest'):
            self.verify(transform)

    def test_expanded_filesystem_identity(self):
        def transform(packet, blobs):
            packet['images'][0]['rootFsLayers'] = ['sha256:' + '0' * 64]
        with self.assertRaisesRegex(AssertionError, 'Filesystem identity'):
            self.verify(transform)

    def test_wrong_platform(self):
        with self.assertRaisesRegex(AssertionError, 'Platform'):
            self.verify(architecture='arm64')

    def test_unsupported_layer_codec(self):
        with self.assertRaisesRegex(AssertionError, 'Unsupported layer compression'):
            self.verify(unsupported=True)

    def test_duplicate_archive_path(self):
        with self.assertRaisesRegex(AssertionError, 'Duplicate'):
            self.verify(duplicate=True)


if __name__ == '__main__':
    unittest.main()
