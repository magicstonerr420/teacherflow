"""Inspect browser-generated formatting fixtures with the bundled pdfplumber."""
from pathlib import Path
import re
import pdfplumber

root = Path('.local-runtime/lesson-formatting-review')
mm = 72 / 25.4
for name in ['student', 'teacher', 'long-reading']:
    with pdfplumber.open(root / f'{name}.pdf') as pdf:
        text = '\n'.join(page.extract_text() or '' for page in pdf.pages)
        assert 'Our neighborhood' in text
        if name == 'student':
            assert 'TEACHER-ONLY' not in text
        if name == 'teacher':
            assert 'TEACHER-ONLY' in text
        if name == 'long-reading':
            assert 'Paragraph 1.' in pdf.pages[0].extract_text(), 'Reading starts on its header page'
            assert len(pdf.pages) == 2
            for i in range(1, 16):
                assert text.count(f'Paragraph {i}.') == 1, f'Paragraph {i} missing or duplicated'
        for page in pdf.pages:
            body = [char for char in page.chars if char['size'] > 8.1 and char['text'].strip()]
            assert body, 'No blank body pages'
            assert all(char['x0'] >= 17 * mm and char['x1'] <= page.width - 16 * mm for char in body), 'Text inside horizontal margins'
            assert all(char['top'] >= 8 * mm and char['bottom'] < page.height - 17 * mm for char in body), 'Text stays clear of page footer'
        if name == 'student':
            rows = pdf.pages[0].extract_text_lines()
            starts = [row for row in rows if row['text'].startswith(('Our neighborhood garden brings', 'Last month,', 'Next week,'))]
            assert len(starts) == 3
            for row in starts[1:]:
                previous = rows[rows.index(row)-1]
                assert row['top']-previous['top'] > 8 * mm, 'Paragraph gap exceeds ordinary line gap'
        print(f'{name}: {len(pdf.pages)} pages, content and bounds passed')
