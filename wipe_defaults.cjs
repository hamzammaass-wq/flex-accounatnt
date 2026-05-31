const fs = require('fs');
const path = require('path');

const file = 'd:/smart account/contexts/AccountingContext.tsx';
let content = fs.readFileSync(file, 'utf-8');

const arraysToWipe = [
  'initialProducts',
  'initialContacts',
  'initialEmployees',
  'initialAssetGroups',
  'seededContacts',
  'initialInvoices',
  'initialTransactions',
  'initialTickets',
  'initialFixedAssets',
  'initialChecks',
  'initialUsers',
  'initialBoms',
  'initialProductionOrders'
];

for (const arrName of arraysToWipe) {
  const startRegex = new RegExp(`const\\s+${arrName}\\s*(?:\\:[^=]+)?\\s*=\\s*\\[`);
  const match = content.match(startRegex);
  if (match) {
    const startIndex = match.index;
    let bracketCount = 0;
    // Start exactly at the '[' of the array literal
    let i = startIndex + match[0].length - 1;
    for (; i < content.length; i++) {
      if (content[i] === '[') bracketCount++;
      if (content[i] === ']') {
        bracketCount--;
        if (bracketCount === 0) {
          break;
        }
      }
    }
    if (bracketCount === 0) {
      // Find the exact type declaration part (e.g. `: Product[]`)
      const typeStart = match[0].indexOf(':');
      const typeEnd = match[0].indexOf('=');
      const typePart = typeStart !== -1 ? match[0].substring(typeStart, typeEnd).trim() : '';
      
      content = content.substring(0, startIndex) + `const ${arrName}${typePart} = [];` + content.substring(i + 1);
    }
  }
}

// Special case for seededProducts
const seededProductsRegex = /const\s+seededProducts\s*:\s*Product\[\]\s*=\s*initialProducts\.map\([\s\S]*?\)\s*;/;
content = content.replace(seededProductsRegex, 'const seededProducts: Product[] = [];');

fs.writeFileSync(file, content, 'utf-8');
console.log('Done wiping default data.');
