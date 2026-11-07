import hashlib, importlib.util, io, json, pathlib, shutil, subprocess, sys, tarfile, tempfile, unittest
spec = importlib.util.spec_from_file_location('recovery_archives', pathlib.Path(__file__).with_name('verify-roomqc-recovery-archives.py'))
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class RecoveryArchives(unittest.TestCase):
    def setUp(self):
        self.root = pathlib.Path(tempfile.mkdtemp(prefix='roomqc-archive-test-'))
        self.addCleanup(self.cleanup)
    def cleanup(self):
        assert self.root.resolve().parent == pathlib.Path(tempfile.gettempdir()).resolve()
        assert self.root.name.startswith('roomqc-archive-test-')
        shutil.rmtree(module.extended_path(self.root))
    def bundle(self, entries, rows=None):
        manifest = []
        with tarfile.open(self.root/'data.tar', 'w') as archive:
            for name, data, kind in entries:
                info = tarfile.TarInfo(name); info.type = kind
                if kind == tarfile.REGTYPE: info.size = len(data)
                else: info.linkname = '../outside'
                archive.addfile(info, io.BytesIO(data) if kind == tarfile.REGTYPE else None)
                manifest.append({'name':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
        (self.root/'files.json').write_text(json.dumps(manifest if rows is None else rows))
    def restore(self): return module.restore(self.root/'data.tar',self.root/'files.json',self.root/'output')
    def test_readback(self):
        self.bundle([('nested/a.txt',b'private synthetic bytes',tarfile.REGTYPE)])
        self.assertEqual(self.restore(),{'files':1,'bytes':23,'readbackVerified':True})
        self.assertEqual((self.root/'output/nested/a.txt').read_bytes(),b'private synthetic bytes')
    def test_traversal_and_absolute_paths(self):
        for name in ['../escape','/escape','C:/escape','a\\escape','a/../escape']:
            with self.subTest(name=name):
                self.bundle([(name,b'x',tarfile.REGTYPE)])
                with self.assertRaises(AssertionError): self.restore()
                self.assertFalse((self.root/'output').exists())
    def test_links_and_devices(self):
        for kind in [tarfile.SYMTYPE,tarfile.LNKTYPE,tarfile.CHRTYPE]:
            with self.subTest(kind=kind):
                self.bundle([('file',b'',kind)])
                with self.assertRaisesRegex(AssertionError,'ARCHIVE_ENTRY_INVALID'): self.restore()
                (self.root/'output').rmdir()
    def test_duplicate_entries(self):
        self.bundle([('file',b'x',tarfile.REGTYPE),('file',b'x',tarfile.REGTYPE)],
            [{'name':'file','bytes':1,'sha256':hashlib.sha256(b'x').hexdigest()}])
        with self.assertRaisesRegex(AssertionError,'ARCHIVE_FILE_SET_INVALID'): self.restore()
    def test_case_collision(self):
        self.bundle([('file',b'x',tarfile.REGTYPE),('FILE',b'x',tarfile.REGTYPE)])
        with self.assertRaisesRegex(AssertionError,'ARCHIVE_CASE_COLLISION'): self.restore()
    def test_hash_and_file_set(self):
        self.bundle([('file',b'x',tarfile.REGTYPE)], [{'name':'file','bytes':1,'sha256':'0'*64}])
        with self.assertRaisesRegex(AssertionError,'ARCHIVE_CONTENT_MISMATCH'): self.restore()
    def test_existing_output_preserved(self):
        self.bundle([('file',b'x',tarfile.REGTYPE)]); (self.root/'output').mkdir()
        (self.root/'output/sentinel').write_text('keep')
        with self.assertRaisesRegex(AssertionError,'ARCHIVE_OUTPUT_EXISTS'): self.restore()
        self.assertEqual((self.root/'output/sentinel').read_text(),'keep')
    def test_deep_paths_without_changing_archive_names(self):
        name = '/'.join(['long-private-directory']*15+['file.txt'])
        self.bundle([(name,b'x',tarfile.REGTYPE)])
        self.assertEqual(self.restore()['files'],1)
        self.assertEqual(module.extended_path(self.root/'output'/name).read_bytes(),b'x')
    def test_optimized_python_cannot_disable_guards(self):
        result = subprocess.run([sys.executable,'-O',str(pathlib.Path(__file__).with_name('verify-roomqc-recovery-archives.py')),
            '--bundle',str(self.root),'--output',str(self.root)],capture_output=True,text=True)
        self.assertEqual(result.returncode,1)
        self.assertEqual(json.loads(result.stdout)['code'],'RECOVERY_ARCHIVE_OPTIMIZATION_FORBIDDEN')

if __name__=='__main__': unittest.main()
