from pathlib import Path
import hashlib, json, re, subprocess, sys, zipfile

root = Path(__file__).resolve().parents[1]
label = sys.argv[1] if len(sys.argv) > 1 else 'daily-shopping-20260911'
if not re.fullmatch(r'[a-z0-9-]+', label):
    raise ValueError('Release label must contain only lowercase letters, digits and hyphens')
out = root / 'outputs' / label
out.mkdir(parents=True, exist_ok=True)
source = {root / p for p in subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0') if p}
source.update((root / 'docs').glob('*.md'))
source.add(Path(__file__))
source.update(root / 'work/walking-pilot-20260908' / p for p in ['onoda-walking-source.osm', 'source-manifest.json'])
source.update((root / 'work/daily-shopping-20260911').glob('*'))
source.update((root / 'work' / label).glob('*'))
source.update((out / 'id-index').glob('*'))
source.update((root / 'outputs/national-comparison-20260909').glob('*'))
source.add(root / 'work/transport-inventory-20260908/P11-22_35_SHP.zip')
report = []
prefix = 'daily-shopping' if label == 'daily-shopping-20260911' else label
packages = [(f'{prefix}-source.zip', source, root), (f'{prefix}-site.zip', set((root / 'dist').rglob('*')), root / 'dist')]
if (out / 'id-index').exists():
    packages.append((f'{prefix}-id-index.zip', set((out / 'id-index').glob('*')) | {root/'docs'/f'{label}.md'}, root))
for name, files, base in packages:
    files = sorted(p for p in files if p.is_file())
    manifest = {p.relative_to(base).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    archive = out / name
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in files:
            z.write(p, p.relative_to(base).as_posix())
        z.writestr('manifest-sha256.json', json.dumps(manifest, ensure_ascii=False, indent=2))
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        for p, digest in manifest.items():
            assert hashlib.sha256(z.read(p)).hexdigest() == digest
    report.append(dict(name=name, files=len(files), bytes=archive.stat().st_size, sha256=hashlib.sha256(archive.read_bytes()).hexdigest()))
(out / 'verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
