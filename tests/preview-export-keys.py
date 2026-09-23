"""Run after export-previews.cjs. Requires pdfplumber in the review environment."""
from pathlib import Path
import io
import json
import re
import zipfile
import pdfplumber

root = Path(__file__).resolve().parents[1] / 'public' / 'previews' / 'v1'
def normalize(text):
    return re.sub(r'[^a-z0-9]', '', text.lower())

for file in root.glob('*.json'):
    lesson = json.loads(file.read_text(encoding='utf8'))['lesson']
    with zipfile.ZipFile(file.with_suffix('.zip')) as package:
        for version, field in [('A', 'assessment'), ('B', 'versionB')]:
            with pdfplumber.open(io.BytesIO(package.read(f'Teacher_Answer_Key_{version}.pdf'))) as pdf:
                text = '\n'.join(page.extract_text() or '' for page in pdf.pages)
                assessment = normalize(text.split('Assessment answers')[-1])
                for question in lesson[field]['questions']:
                    assert normalize(question['prompt']) in assessment, (file.stem, version, question['prompt'])
                    assert normalize(question['answer']) in assessment, (file.stem, version, question['answer'])
                other = 'versionB' if version == 'A' else 'assessment'
                assert normalize(lesson[other]['questions'][0]['prompt']) not in assessment
    print(file.stem + ': assessment A/B export keys match their respective questions.')
