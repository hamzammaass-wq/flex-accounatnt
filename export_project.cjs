const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const OUTPUT_FILE = path.join(ROOT_DIR, 'Project_Code_Dump.md');

const INCLUDE_EXTS = ['.ts', '.tsx', '.css', '.html', '.json', '.md'];
const EXCLUDE_DIRS = [
    'node_modules', 'dist', '.git', '.local-tools', '.firebase', 
    'android', 'ios', 'public', 'tests', 'artifacts', 'tmp',
    'backend', 'functions', 'qa-output', '.devcontainer', 'store-assets', 'dist-electron'
];

let outputContent = '# Smart Accountant Project Source Code\n\n';
outputContent += 'This file contains the concatenated source code of the project for AI analysis.\n\n';

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            if (!EXCLUDE_DIRS.includes(file)) {
                walk(fullPath);
            }
        } else {
            const ext = path.extname(file);
            if (INCLUDE_EXTS.includes(ext) && file !== 'Project_Code_Dump.md' && file !== 'package-lock.json') {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const relativePath = path.relative(ROOT_DIR, fullPath);
                    outputContent += `\n\n## File: ${relativePath}\n\n`;
                    outputContent += '```' + ext.replace('.', '') + '\n';
                    outputContent += content;
                    outputContent += '\n```\n';
                } catch (e) {
                    console.error(`Error reading ${fullPath}:`, e.message);
                }
            }
        }
    }
}

console.log('Generating Project_Code_Dump.md...');
walk(ROOT_DIR);
fs.writeFileSync(OUTPUT_FILE, outputContent, 'utf8');
console.log(`Successfully created ${OUTPUT_FILE}`);
