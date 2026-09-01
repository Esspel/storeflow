const fs = require('fs');
const buf = fs.readFileSync('C:/Users/erics/Downloads/1_Coop_färgkarta_RGB.ase');

// Read as UTF-16LE after byte swap (ASE uses UTF-16BE internally but let's try LE)
const swapped = Buffer.from(buf).swap16();
const text = swapped.toString('utf16le', 0, buf.length);

console.log('=== EXTRACTED TEXTS ===');
// Print first 500 chars readable
console.log(text.substring(0, 500));

// Search for color patterns
console.log('\n=== COLOR NAMES ===');
// These are the patterns we saw in the hex dump text extraction
const colorPatterns = [
  /Coop (Grön|Accent|Grå|Svart|Mörkgrön|Röd|Blå|Gul|Orange|Lila|Beige)[^)]*/g,
  /Grön \d+/g,
  /Grå \d+/g,
  /Beige \d+/g,
  /Orange \d+/g,
  /Lila \d+/g,
  /Blå \d+/g,
  /Gul \d+/g,
  /Vit/g,
  /Svart/g
];

// Actually, let's just find all proper color names from the text
const allStrings = [];
let current = '';
for (let i = 0; i < text.length; i++) {
  const ch = text.charCodeAt(i);
  if (ch >= 32 && ch <= 126) {
    current += text[i];
  } else {
    if (current.length >= 2) {
      allStrings.push(current);
    }
    current = '';
  }
}
if (current.length >= 2) allStrings.push(current);

console.log('\n=== ALL STRINGS (length >= 2) ===');
allStrings.forEach(s => {
  console.log(s);
});