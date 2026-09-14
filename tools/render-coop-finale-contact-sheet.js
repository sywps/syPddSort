'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const directory = path.join(__dirname, 'generated_levels/coop-finale-9');
const gap = 8, width = 64 * 7, height = 56 * 7;
const sheet = new PNG({ width: width * 3 + gap * 4, height: height * 3 + gap * 4 });
sheet.data.fill(245);
for (let index = 0; index < 9; index++) {
    const source = PNG.sync.read(fs.readFileSync(path.join(directory, `${12 + index}-full.png`)));
    PNG.bitblt(source, sheet, 0, 0, source.width, source.height,
        gap + index % 3 * (width + gap), gap + Math.floor(index / 3) * (height + gap));
}
fs.writeFileSync(path.join(directory, 'contact-sheet.png'), PNG.sync.write(sheet));
console.log('COOP_FINALE_CONTACT_SHEET_RENDERED');
