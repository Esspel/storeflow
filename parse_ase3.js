const fs = require('fs');

function parseASE(content) {
  let pos = 0;

  // Read magic number
  const magic = content.toString('ascii', pos, pos + 4);
  if (magic !== 'ASEF') {
    throw new Error('Not an ASE file');
  }
  pos += 4;

  // Read version
  const major = content.readUInt16BE(pos); pos += 2;
  const minor = content.readUInt16BE(pos); pos += 2;
  console.log(`ASE version: ${major}.${minor}`);

  // Read number of blocks
  const numBlocks = content.readUInt32BE(pos); pos += 4;
  console.log(`Total blocks: ${numBlocks}`);

  const colors = [];
  const groups = [];
  let currentGroup = null;

  for (let i = 0; i < numBlocks; i++) {
    if (pos + 6 > content.length) break;

    const blockLen = content.readUInt32BE(pos);
    const blockType = content.readUInt16BE(pos);

    console.log(`\nBlock ${i}: type=0x${blockType.toString(16)} length=${blockLen}`);

    if (blockType === 0x0001) {
      // Group header
      const nameLen = content.readUInt16BE(pos);
      pos += 2;
      const name = content.slice(pos, pos + nameLen * 2).toString('utf16be');
      pos += nameLen * 2;
      // Skip null terminator
      const term = content.readUInt16BE(pos);
      pos += 2;

      currentGroup = { name: name.trim(), colors: [] };
      groups.push(currentGroup);
      console.log(`  Group: "${name.trim()}"`);

    } else if (blockType === 0x0003) {
      // Color entry
      const nameLen = content.readUInt16BE(pos);
      pos += 2;
      const name = content.slice(pos, pos + nameLen * 2).toString('utf16be');
      pos += nameLen * 2;
      const term = content.readUInt16BE(pos);
      pos += 2;

      // Color model (usually 'RGB ')
      const model = content.toString('ascii', pos, pos + 4);
      pos += 4;

      // RGB values as 32-bit floats
      const r = content.readFloatBE(pos);
      const g = content.readFloatBE(pos);
      const b = content.readFloatBE(pos);
      pos += 12;

      // Color type
      const colorType = content.readUInt16BE(pos);
      pos += 2;

      const hex = `#${Math.round(r * 255).toString(16).padStart(2, '0')}${Math.round(g * 255).toString(16).padStart(2, '0')}${Math.round(b * 255).toString(16).padStart(2, '0')}`;
      const colorName = name.trim();

      const color = {
        name: colorName,
        hex: hex,
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255),
        model: model
      };

      if (currentGroup) {
        currentGroup.colors.push(color);
        console.log(`  Color: "${colorName}" ${hex} (${color.r},${color.g},${color.b})`);
      } else {
        colors.push(color);
        console.log(`  [Standalone] Color: "${colorName}" ${hex} (${color.r},${color.g},${color.b})`);
      }

    } else {
      // Skip unknown blocks
      pos += blockLen - 6;
    }
  }

  return { colors, groups };
}

function main() {
  try {
    const content = fs.readFileSync('C:/Users/erics/Downloads/1_Coop_färgkarta_RGB.ase');
    const result = parseASE(content);

    console.log('\n' + '='.repeat(60));
    console.log('COLOR PALETTE SUMMARY');
    console.log('='.repeat(60));

    console.log('\nCoop Color Palette:');
    console.log('===================');
    console.log('');

    // Sort colors by name
    const sortedColors = result.colors.sort((a, b) => a.name.localeCompare(b.name, 'sv'))
      .concat(...result.groups.map(g => g.colors).flat().sort((a, b) => a.name.localeCompare(b.name, 'sv')));

    sortedColors.forEach(color => {
      console.log(`${color.hex}  // ${color.name}`);
    });

    console.log('');
    console.log(`Total unique colors: ${sortedColors.length}`);

    // Generate a JSON file with the palette
    const jsonOutput = {
      colors: sortedColors,
      source: '1_Coop_färgkarta_RGB.ase'
    };

    fs.writeFileSync('/tmp/coop-palette.json', JSON.stringify(jsonOutput, null, 2));
    console.log(`\nColor palette exported to /tmp/coop-palette.json`);

  } catch (error) {
    console.error('Error parsing ASE file:', error.message);
  }
}

main();