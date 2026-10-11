"""Stage existing tracked static assets and CardWise build; no user data or sources."""
import shutil
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
destination = Path(sys.argv[1]).resolve()
if destination == root or destination in root.parents:
    raise SystemExit('Output directory must not be the repository or its parent.')
if destination.exists() and any(destination.iterdir()):
    raise SystemExit('Use a new or empty output directory; existing files are preserved.')
build = root / 'cardwise' / 'dist'
if not (build / 'index.html').is_file():
    raise SystemExit('Run npm run build from cardwise first.')
destination.mkdir(parents=True, exist_ok=True)
paths = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z']).decode().split('\0')
static_extensions = {'.html','.css','.js','.png','.jpg','.jpeg','.svg','.webp','.ico','.webmanifest','.woff','.woff2'}
for name in paths:
    path = Path(name)
    if not name or path.parts[0] in {'cardwise','.github'}:
        continue
    if path.suffix not in static_extensions and name != '.nojekyll':
        continue
    source = root / path
    if source.is_symlink() or not source.is_file():
        raise SystemExit(f'Unsupported static asset: {name}')
    target = destination / path
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
shutil.copytree(build, destination / 'cardwise')
print('Prepared existing static apps and CardWise production build.')
