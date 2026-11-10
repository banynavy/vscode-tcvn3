"""python -I test/parity_py.py <out.tsv> <thu muc>... -> cung dinh dang voi parity.js, dung docs/tools/tcvn3.py."""
import hashlib
import importlib.util
import os
import sys
from pathlib import Path

TOOL = Path(__file__).resolve().parents[2] / 'tcvn3.py'
spec = importlib.util.spec_from_file_location('tcvn3', TOOL)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

rows = []
for root in sys.argv[2:]:
    for dp, dn, fn in os.walk(root):
        for f in fn:
            if not f.lower().endswith(('.lua', '.ini', '.txt')):
                continue
            p = os.path.join(dp, f)
            b = open(p, 'rb').read()
            if b[:2] in (b'\xff\xfe', b'\xfe\xff'):
                continue
            s = m.decode_bytes(b, True)
            v = m.decode_bytes(b, False)
            try:
                rt = 1 if m.encode_text(s) == b else 0
            except m.EncodeError:
                rt = 0
            h = lambda x: hashlib.md5(x.encode('utf-8')).hexdigest()
            rows.append('\t'.join([p, h(s), h(v), str(rt)]))
open(sys.argv[1], 'w', encoding='utf-8', newline='\n').write('\n'.join(rows) + '\n')
print('files=%d' % len(rows))
