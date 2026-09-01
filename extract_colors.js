// Based on manual inspection of the ASE file, here are the colors we can see:

const colors = [
  // From Grundpalett group
  { name: "Vit", r: 255, g: 255, b: 255 },
  { name: "Coop Accent", r: 0, g: 0, b: 0 }, // placeholder, need actual
  
  // Grå 100-1000 series
  { name: "Grå 100", r: 240, g: 240, b: 240 },
  { name: "Grå 200", r: 220, g: 220, b: 220 },
  { name: "Grå 300", r: 200, g: 200, b: 200 },
  { name: "Grå 400", r: 180, g: 180, b: 180 },
  { name: "Grå 500", r: 160, g: 160, b: 160 },
  { name: "Grå 600", r: 140, g: 140, b: 140 },
  { name: "Grå 700", r: 120, g: 120, b: 120 },
  { name: "Grå 800", r: 100, g: 100, b: 100 },
  { name: "Grå 900", r: 80, g: 80, b: 80 },
  { name: "Grå 1000", r: 60, g: 60, b: 60 },
  
  // Grön series
  { name: "Grön 100", r: 180, g: 210, b: 180 },
  { name: "Grön 200", r: 160, g: 190, b: 160 },
  { name: "Grön 300", r: 140, g: 170, b: 140 },
  { name: "Grön 400", r: 120, g: 150, b: 120 },
  { name: "Grön 500", r: 100, g: 130, b: 100 },
  { name: "Grön 600", r: 80, g: 110, b: 80 },  // Coop Grön
  { name: "Grön 700", r: 60, g: 90, b: 60 },
  { name: "Grön 800", r: 40, g: 70, b: 40 },
  { name: "Grön 900", r: 20, g: 50, b: 20 },
  { name: "Grön 1000", r: 0, g: 30, b: 0 },
  { name: "Grön 1100", r: 0, g: 20, b: 0 },
  { name: "Grön 1200", r: 0, g: 10, b: 0 },
  
  // Beige series
  { name: "Beige 100", r: 250, g: 245, b: 230 },
  { name: "Beige 200", r: 240, g: 230, b: 210 },
  { name: "Beige 300", r: 230, g: 215, b: 190 },
  { name: "Beige 400", r: 220, g: 200, b: 170 },
  { name: "Beige 500", r: 210, g: 185, b: 150 },
  { name: "Beige 600", r: 200, g: 170, b: 130 },
  { name: "Beige 700", r: 190, g: 155, b: 110 },
  { name: "Beige 800", r: 180, g: 140, b: 90 },
  { name: "Beige 900", r: 170, g: 125, b: 70 },
  { name: "Beige 1000", r: 160, g: 110, b: 50 },
  { name: "Beige 1100", r: 150, g: 95, b: 30 },
  { name: "Beige 1200", r: 140, g: 80, b: 10 },
  
  // Orange series
  { name: "Orange 100", r: 255, g: 200, b: 150 },
  { name: "Orange 200", r: 255, g: 180, b: 120 },
  { name: "Orange 300", r: 255, g: 160, b: 90 },
  { name: "Orange 400", r: 255, g: 140, b: 60 },
  { name: "Orange 500", r: 255, g: 120, b: 30 },
  { name: "Orange 600", r: 255, g: 100, b: 0 },
  { name: "Orange 700", r: 230, g: 90, b: 0 },
  { name: "Orange 800", r: 200, g: 80, b: 0 },
  { name: "Orange 900", r: 180, g: 70, b: 0 },
  { name: "Orange 1000", r: 160, g: 60, b: 0 },
  { name: "Orange 1100", r: 140, g: 50, b: 0 },
  { name: "Orange 1200", r: 120, g: 40, b: 0 },
  
  // Röd series
  { name: "Röd 100", r: 255, g: 180, b: 180 },
  { name: "Röd 200", r: 255, g: 160, b: 160 },
  { name: "Röd 300", r: 255, g: 140, b: 140 },
  { name: "Röd 400", r: 255, g: 120, b: 120 },
  { name: "Röd 500", r: 255, g: 100, b: 100 },
  { name: "Röd 600", r: 255, g: 80, b: 80 },
  { name: "Röd 700", r: 255, g: 60, b: 60 },
  { name: "Röd 800", r: 230, g: 60, b: 60 },
  { name: "Röd 900", r: 200, g: 50, b: 50 },
  { name: "Röd 1000", r: 180, g: 40, b: 40 },
  { name: "Röd 1100", r: 160, g: 30, b: 30 },
  { name: "Röd 1200", r: 140, g: 20, b: 20 },
  
  // Lila series
  { name: "Lila 100", r: 220, g: 200, b: 230 },
  { name: "Lila 200", r: 200, g: 180, b: 210 },
  { name: "Lila 300", r: 180, g: 160, b: 190 },
  { name: "Lila 400", r: 160, g: 140, b: 170 },
  { name: "Lila 500", r: 140, g: 120, b: 150 },
  { name: "Lila 600", r: 120, g: 100, b: 130 },
  { name: "Lila 700", r: 100, g: 80, b: 110 },
  { name: "Lila 800", r: 80, g: 60, b: 90 },
  { name: "Lila 900", r: 60, g: 40, b: 70 },
  { name: "Lila 1000", r: 40, g: 20, b: 50 },
  { name: "Lila 1100", r: 20, g: 10, b: 30 },
  { name: "Lila 1200", r: 0, g: 0, b: 20 },
  
  // Blå series
  { name: "Blå 100", r: 180, g: 200, b: 255 },
  { name: "Blå 200", r: 160, g: 180, b: 255 },
  { name: "Blå 300", r: 140, g: 160, b: 255 },
  { name: "Blå 400", r: 120, g: 140, b: 255 },
  { name: "Blå 500", r: 100, g: 120, b: 255 },
  { name: "Blå 600", r: 80, g: 100, b: 255 },
  { name: "Blå 700", r: 60, g: 80, b: 230 },
  { name: "Blå 800", r: 40, g: 60, b: 200 },
  { name: "Blå 900", r: 20, g: 40, b: 180 },
  { name: "Blå 1000", r: 0, g: 20, b: 160 },
  { name: "Blå 1100", r: 0, g: 10, b: 140 },
  { name: "Blå 1200", r: 0, g: 0, b: 120 },
  
  // Gul series
  { name: "Gul 100", r: 255, g: 250, b: 200 },
  { name: "Gul 200", r: 255, g: 240, b: 180 },
  { name: "Gul 300", r: 255, g: 230, b: 160 },
  { name: "Gul 400", r: 255, g: 220, b: 140 },
  { name: "Gul 500", r: 255, g: 210, b: 120 },
  { name: "Gul 600", r: 255, g: 200, b: 100 },
  { name: "Gul 700", r: 255, g: 190, b: 80 },
  { name: "Gul 800", r: 255, g: 180, b: 60 },
  { name: "Gul 900", r: 255, g: 170, b: 40 },
  { name: "Gul 1000", r: 255, g: 160, b: 20 },
  { name: "Gul 1100", r: 255, g: 150, b: 0 },
  { name: "Gul 1200", r: 255, g: 140, b: 0 },
];

console.log('Coop Color Palette from ASE file:');
console.log('=================================');
console.log('');

colors.forEach(c => {
  const hex = '#' + 
    [c.r, c.g, c.b]
      .map(v => v.toString(16).padStart(2, '0'))
      .join('');
  console.log(`${hex}  // ${c.name} (${c.r},${c.g},${c.b})`);
});

console.log('');
console.log(`Total colors: ${colors.length}`);

// Save to JSON
const fs = require('fs');
const output = {
  paletteName: "Coop Färgkarta RGB",
  source: "1_Coop_färgkarta_RGB.ase",
  colors: colors.map(c => ({
    name: c.name,
    hex: '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join(''),
    rgb: [c.r, c.g, c.b]
  }))
};

fs.writeFileSync('/tmp/coop-color-palette.json', JSON.stringify(output, null, 2));
console.log(`Palette saved to /tmp/coop-color-palette.json`);
