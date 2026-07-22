const fs = require('fs');
const path = require('path');

function searchDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (!fullPath.includes('node_modules') && !fullPath.includes('.git')) {
                searchDir(fullPath);
            }
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            let match;
            const regex = /useEffect\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\)/g;
            while ((match = regex.exec(content)) !== null) {
                const body = match[1];
                if (body.includes('set')) {
                    const line = content.substring(0, match.index).split('\n').length;
                    console.log(`Potential loop in ${fullPath}:${line}`);
                }
            }
        }
    }
}

searchDir('d:/smart account/components');
searchDir('d:/smart account/contexts');
searchDir('d:/smart account/hooks');
searchDir('d:/smart account/src');
