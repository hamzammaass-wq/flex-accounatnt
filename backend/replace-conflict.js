import fs from 'fs';
import path from 'path';

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  // Skip deleted_companies because its PK is just id
  if (content.includes('deleted_companies (id)')) {
    // We will do a targeted replace for this file or just let it be if it doesn't match 'deleted_companies (id)'
  }

  // Replace all ON CONFLICT (id) with ON CONFLICT (company_id, id)
  const regex = /ON CONFLICT\s*\(\s*id\s*\)/g;
  
  let newContent = content.replace(regex, (match, offset, string) => {
    // Check if it's near deleted_companies
    const context = string.substring(Math.max(0, offset - 50), offset);
    if (context.includes('deleted_companies')) {
      return match; // Don't replace
    }
    // Also skip users, companies, etc.
    if (context.includes('users (')) return match;
    if (context.includes('companies (')) return match;
    return 'ON CONFLICT (company_id, id)';
  });

  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.ts')) {
      replaceInFile(fullPath);
    }
  }
}

walkDir('d:/smart account/backend/src');
