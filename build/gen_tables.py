#!/usr/bin/env python3
"""Sinh tables.js cho extension tu docs/tools/tcvn3.py (cung bang ma, cung bang GBK) -> hai cong cu cho ket qua giong nhau.

Chay: python -I gen_tables.py
"""
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXT = HERE.parent
TOOL = EXT.parent / 'tcvn3.py'

spec = importlib.util.spec_from_file_location('tcvn3', TOOL)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# bang GBK: lead 0x81..0xFE x trail 0x40..0xFE (191 o); '\0' = cap khong dung (giong m._gbk_pair(strict=False))
cells = []
for lead in range(0x81, 0xFF):
    for trail in range(0x40, 0xFF):
        ch = m._gbk_pair(bytes([lead, trail]), strict=False)
        cells.append(ch if ch is not None else '\0')
gbk = ''.join(cells)
assert len(gbk) == 126 * 191
assert all(len(c) == 1 and ord(c) <= 0xFFFF for c in cells)

out = [
    "'use strict';",
    '// TU DONG SINH boi build/gen_tables.py tu docs/tools/tcvn3.py - khong sua tay.',
    'module.exports = {',
    '  VN: ' + json.dumps(m._VN, ensure_ascii=True) + ',',
    '  TC: ' + json.dumps(list(m._TC)) + ',',
    '  WEST_U: ' + json.dumps(m._WEST_U, ensure_ascii=True) + ',',
    '  WEST_B: ' + json.dumps(list(m._WEST_B)) + ',',
    '  GBK: ' + json.dumps(gbk, ensure_ascii=True),
    '};',
    '',
]
(EXT / 'tables.js').write_text('\n'.join(out), encoding='ascii', newline='\n')
print('tables.js:', (EXT / 'tables.js').stat().st_size, 'byte; GBK hop le:', sum(1 for c in cells if c != '\0'))
