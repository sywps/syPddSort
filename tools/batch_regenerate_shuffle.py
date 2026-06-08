#!/usr/bin/env python3
"""Batch regenerate initRandomColorArr for all levels >= 245."""

import subprocess
import time
from pathlib import Path

guanka = Path('guanka')
files = sorted(
    [f for f in guanka.glob('level_*.json') if not f.name.endswith('.meta')],
    key=lambda p: int(p.stem.split('_')[1])
)
files = [f for f in files if int(f.stem.split('_')[1]) >= 245]

print(f'Total files to process: {len(files)}', flush=True)

success = 0
failures = []
start = time.time()

for i, fp in enumerate(files):
    result = subprocess.run(
        ['python3', 'tools/generate_initial_shuffle.py', str(fp)],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        success += 1
    else:
        failures.append((str(fp), result.stderr.strip()))
    if (i + 1) % 100 == 0 or i + 1 == len(files):
        elapsed = time.time() - start
        print(f'Processed {i+1}/{len(files)} ({success} ok) - {elapsed:.0f}s', flush=True)

elapsed = time.time() - start
print(f'\nDone: {success}/{len(files)} succeeded, {len(failures)} failed in {elapsed:.1f}s', flush=True)

if failures:
    print('Failures:', flush=True)
    for path, err in failures[:20]:
        print(f'  {path}: {err[:150]}', flush=True)
