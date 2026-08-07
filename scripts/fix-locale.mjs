import fs from 'fs';
import path from 'path';

const dirs = ['components', 'contexts', 'utils'];

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const p = path.join(dir, file);
        if (fs.statSync(p).isDirectory()) {
            walk(p);
        } else if (p.endsWith('.tsx') || p.endsWith('.ts')) {
            let content = fs.readFileSync(p, 'utf-8');
            let newContent = content
                .replace(/\.toLocaleString\(\)/g, ".toLocaleString('en-US')")
                .replace(/\.toLocaleString\(undefined,/g, ".toLocaleString('en-US',");
            if (content !== newContent) {
                fs.writeFileSync(p, newContent);
                console.log(`Updated ${p}`);
            }
        }
    }
}

dirs.forEach(walk);
