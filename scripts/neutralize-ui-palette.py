from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'web'
mapping = {
    '#101719':'#111315', '#172124':'#1b1d20', '#1d292c':'#272a2e', '#2c393c':'#3a3d41',
    '#e7eeeb':'#f0f0f0', '#8b9a98':'#a1a4a7', '#8ce0bf':'#dedede', '#f4ae7d':'#c8c8c8',
    '#eb887d':'#b0b0b0', '#13211e':'#171819', '#a8b8b4':'#b7b9bb', '#40504f':'#55585b',
    '#435251':'#55585b', '#10201a':'#111315', '#a5ebcf':'#ffffff', '#263436':'#303337',
    '#354547':'#494c50', '#b6c4c0':'#c3c5c7', '#c2cfcb':'#d0d1d2', '#131c1e':'#17191b',
    '#a6b7b2':'#c2c4c6', '#465956':'#696d71', '#a0b3ad':'#b7babd', '#192426':'#292b2e',
    '#d3dfda':'#d9dadd', '#101719':'#111315', '#ffe04a':'#ffffff', '#d8eee6':'#b8bec2',
    '#319cff':'#ffffff', '#ff786c':'#555b60', '#8ce0bf':'#8f969b', '#172522':'#1b1d20',
    '#9aaca6':'#b6b8ba', '#315548':'#55595d', '#40594f':'#55595d', '#d9e9e2':'#dedfe0',
    '#aabbb5':'#bfc1c3', '#547b69':'#797d81', '#86cdb0':'#bfc2c5', '#65b9ff':'#f4f4f4',
    '#ff9685':'#70757a', '#3a5149':'#55595d', '#1d302a':'#292c30', '#d4e7de':'#dedfe0',
    '#d7e2dd':'#d9dadd', '#1b2e2a':'#242629', '#91bca9':'#c1c3c5', '#236953':'#55595d',
    '#9be4c6':'#d7d8da', '#3c4b4c':'#55585b', '#a6b7b2':'#c2c4c6', '#1b2e2a':'#242629',
}
for filename in ('style.css', 'app.js', 'index.html'):
    path = root / filename
    text = path.read_text(encoding='utf-8')
    for old, new in mapping.items():
        text = text.replace(old, new)
    text = text.replace('--mint:', '--accent:').replace('var(--mint)', 'var(--accent)')
    text = text.replace('--orange:', '--highlight:').replace('var(--orange)', 'var(--highlight)')
    text = text.replace('--red:', '--danger:').replace('var(--red)', 'var(--danger)')
    path.write_text(text, encoding='utf-8')
