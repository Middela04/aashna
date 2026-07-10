import re
from pathlib import Path

path = Path('khushii.html')
text = path.read_text(encoding='utf-8')
start = text.find('<!-- ════ AUTH / LOGIN ════ -->')
end = text.find('<!-- ════ NAV ════ -->', start)
if start == -1 or end == -1:
    raise SystemExit('Markers not found')

screens_html = text[start:end]
pattern = re.compile(r'(?=<!-- ════ [^\n]+? ════ -->)')
blocks = pattern.split(screens_html)
pages_dir = Path('pages')
pages_dir.mkdir(exist_ok=True)
for block in blocks:
    block = block.strip()
    if not block:
        continue
    m = re.search(r'id="(screen-[^"]+)"', block)
    if not m:
        print('no id found in block:')
        print(block[:120])
        continue
    name = m.group(1)
    fname = pages_dir / f'{name}.html'
    fname.write_text(block + '\n', encoding='utf-8')
    print('wrote', fname)

replacement = '<!-- ════ SCREEN PAGES (loaded from pages/*.html) ════ -->\n<div id="screen-pages"></div>\n\n'
new_text = text[:start] + replacement + text[end:]
path.write_text(new_text, encoding='utf-8')
print('updated khushii.html placeholder')
