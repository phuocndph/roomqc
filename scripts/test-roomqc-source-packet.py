"""No network: exercise hostile source archives before using the VPS stager."""
import hashlib
import importlib.util
import io
import json
import pathlib
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('stager', pathlib.Path(__file__).with_name('stage-roomqc-source-packet.py'))
stager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stager)


class SourcePacketTests(unittest.TestCase):
    def check(self, changes=None, extra=None, manifest_override=None, source_name=None, source_content=None):
        content = b'export const candidate = true;\n'
        name = 'server/control/source.mjs'
        if source_name is not None:
            name = source_name
        if source_content is not None:
            content = source_content
        manifest = {'kind': 'roomqc-candidate-source-packet', 'version': 1,
                    'backendSourceSha256': 'a' * 64, 'deploymentReady': False, 'signupOpened': False,
                    'totalBytes': len(content), 'files': [{'path': name, 'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content)}]}
        manifest.update(manifest_override or {})
        encoded = json.dumps(manifest).encode()
        entries = [('packet.json', encoded), (name, content)]
        if changes:
            entries = changes(entries)
        if extra:
            entries.extend(extra)
        with tempfile.TemporaryDirectory() as directory:
            packet = pathlib.Path(directory) / 'packet.tar.gz'
            with tarfile.open(packet, 'w:gz') as archive:
                for path, data in entries:
                    info = tarfile.TarInfo(path)
                    if data is None:
                        info.type = tarfile.SYMTYPE
                        info.linkname = '/etc/passwd'
                        archive.addfile(info)
                    else:
                        info.size = len(data)
                        archive.addfile(info, io.BytesIO(data))
            return stager.check_archive(packet, hashlib.sha256(encoded).hexdigest(), 'a' * 64)

    def test_valid_public_sources(self):
        manifest, files = self.check()
        self.assertEqual(len(files), 2)
        self.assertFalse(manifest['deploymentReady'])

    def test_content_tampering(self):
        with self.assertRaisesRegex(AssertionError, 'content mismatch'):
            self.check(changes=lambda entries: [entries[0], (entries[1][0], b'x' * len(entries[1][1]))])

    def test_path_traversal(self):
        with self.assertRaises(AssertionError):
            self.check(extra=[('../escape.mjs', b'bad')])

    def test_symbolic_link(self):
        with self.assertRaisesRegex(AssertionError, 'regular source'):
            self.check(extra=[('scripts/evil.mjs', None)])

    def test_unlisted_file(self):
        with self.assertRaisesRegex(AssertionError, 'file set mismatch'):
            self.check(extra=[('scripts/unlisted.mjs', b'bad')])

    def test_duplicate_file(self):
        with self.assertRaisesRegex(AssertionError, 'Duplicate'):
            self.check(changes=lambda entries: entries + [entries[1]])

    def test_environment_file(self):
        with self.assertRaises(AssertionError):
            self.check(extra=[('server/control/.env', b'bad')])

    def test_packet_cannot_approve_runtime(self):
        with self.assertRaisesRegex(AssertionError, 'approve deployment'):
            self.check(manifest_override={'deploymentReady': True})

    def test_private_key(self):
        with self.assertRaisesRegex(AssertionError, 'Private key'):
            self.check(extra=[('scripts/private.mjs', b'-----BEGIN PRIVATE KEY-----\n' + b'A' * 64 + b'\n')])

    def test_directory_deployment_inputs_roundtrip_with_exact_source_bytes(self):
        repository = pathlib.Path(__file__).parent.parent
        paths = ['deploy/control/directory.compose.yml', 'deploy/control/directory-client.compose.yml',
                 'deploy/control/directory/postgresql.conf', 'deploy/control/directory/pg_hba.conf']
        paths += ['deploy/control/directory-clients/' + name + '.compose.yml'
                  for name in ['api-secrets', 'health', 'alert', 'setup', 'summary']]
        for name in paths:
            with self.subTest(path=name):
                content = (repository / name).read_bytes()
                item = {'path': name, 'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content)}
                manifest, files = self.check(source_name=name, source_content=content,
                                             manifest_override={'deploymentInputs': [item]})
                self.assertEqual(files[name], content)
                self.assertEqual(manifest['deploymentInputs'], [item])

    def test_deployment_input_cannot_be_missing_conflicting_or_duplicated(self):
        content = b'export const candidate = true;\n'
        item = {'path': 'server/control/source.mjs', 'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content)}
        for inputs in [[dict(item, path='scripts/missing.mjs')], [dict(item, sha256='b' * 64)],
                       [dict(item, bytes=0)], [item, item], [dict(item, password='not-a-public-input')], None]:
            with self.subTest(inputs=inputs), self.assertRaisesRegex(AssertionError, '[Dd]eployment input'):
                self.check(manifest_override={'deploymentInputs': inputs})


if __name__ == '__main__':
    unittest.main()
