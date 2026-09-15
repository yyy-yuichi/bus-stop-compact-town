"""Current review entry point. v16's fixed HOLD classification is superseded."""
from pathlib import Path
import argparse, subprocess, sys
p=argparse.ArgumentParser()
p.add_argument('--pilot',action='store_true')
p.add_argument('--apply',action='store_true')
a=p.parse_args()
if a.pilot and a.apply:p.error('--apply requires the complete ledger')
r=Path(__file__).resolve().parent
subprocess.run([sys.executable,str(r/'audit-hikari-directed.py')]+(['--pilot'] if a.pilot else []),check=True)
if a.apply:subprocess.run([sys.executable,str(r/'apply-hikari-directed.py')],check=True)
