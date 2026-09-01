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

  // Read number of blocks
  const numBlocks = content.readUInt32BE(pos); pos += 4;

  const groups = [];
  let currentGroup = null;
  const standaloneColors = [];

  for (let i = 0; i < numBlocks; i++) {
    if (pos + 6 > content.length) break;

    const blockLen = content.readUInt32BE(pos);
    const blockType = content.readUInt16BE(pos);

    if (blockType === 0x0001) {
      // Group header
      const nameLen = content.readUInt16BE(pos); pos += 2;
      const name = content.slice(pos, pos + nameLen * 2).toString('utf16be');
      pos += nameLen * 2;
      // Skip null terminator (2 bytes)
      pos += 2;

      currentGroup = { name: name.trim(), colors: [] };
      groups.push(currentGroup);

    } else if (blockType === 0x0003) {
      // Color entry
      const nameLen = content.readUInt16BE(pos); pos += 2;
      const name = content.slice(pos, pos + nameLen * 2).toString('utf16be');
      pos += nameLen * 2;
      // Skip null terminator
      pos += 2;

      // Color model (4 bytes, e.g. 'RGB ')
      const model = content.toString('ascii', pos, pos + 4); pos += 4;

      // RGB values as 32-bit floats (big-endian)
      const r = content.readFloatBE(pos); pos += 4;
      const g = content.readFloatBE(pos); pos += 4;
      const b = content.readFloatBE(pos); pos += 4;

      // Color type (2 bytes)
      const colorType = content.readUInt16BE(pos); pos += 2;

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
      } else {
        standaloneColors.push(color);
      }

    } else {
      // Skip unknown blocks
      pos += blockLen - 6;
    }
  }

  return { standaloneColors, groups };
}

function main() {
  try {
    const content = fs.readFileSync('C:/Users/erics/Downloads/1_Coop_färgkarta_RGB.ase');
    const result = parseASE(content);

    console.log('=== Coop Color Palette ===');
    console.log('');

    // Print all groups
    result.groups.forEach(group => {
      console.log(`[${group.name}]`);
      group.colors.forEach(c => {
        console.log(`  ${c.hex}  // ${c.name}  (${c.r}, ${c.g}, ${c.b})`);
      });
      console.log('');
    });

    // Print standalone colors
    if (result.standaloneColors.length > 0) {
      console.log('[Standalone]');
      result.standaloneColors.forEach(c => {
        console.log(`  ${c.hex}  // ${c.name}  (${c.r}, ${c.g}, ${c.b})`);
      });
    }

    // Save to JSON
    const allColors = [
      ...result.standaloneColors,
      ...result.groups.flatMap(g => g.colors)
    ];

    const output = {
      paletteName: "Coop Färgkarta RGB",
      source: "1_Coop_färgkarta_RGB.ase",
      groups: result.groups.map(g => ({
        name: g.name,
        colors: g.colors
      })),
      standaloneColors: result.standaloneColors,
      totalColors: allColors.length
    };

    fs.writeFileSync('/tmp/coop-color-palette.json', JSON.stringify(output, null, 2));
    console.log(`\nTotal colors: ${allColors.length}`);
    console.log(`Palette saved to /tmp/coop-color-palette.json`);

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

main();