const fs = require('fs');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = dir + '/' + file;
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory() && !file.includes('node_modules') && !file.includes('.git') && !file.includes('dist')) { 
            results = results.concat(walk(file));
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('d:/smart account/components').concat(walk('d:/smart account/contexts'));

for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    let inEffect = false;
    let effectLines = [];
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('useEffect(() => {') || lines[i].match(/useEffect\s*\(\s*\(\s*\)\s*=>/)) {
            inEffect = true;
            effectLines = [];
        }
        
        if (inEffect) {
            effectLines.push(lines[i]);
            
            // Check for end of useEffect
            if (lines[i].match(/^\s*\}\s*,\s*\[(.*?)\]\s*\)/)) {
                inEffect = false;
                const match = lines[i].match(/^\s*\}\s*,\s*\[(.*?)\]\s*\)/);
                if (match && match[1]) {
                    const deps = match[1].split(',').map(d => d.trim()).filter(d => d);
                    
                    // Look back up to 20 lines before the effect to see how deps are defined
                    const startIdx = Math.max(0, i - effectLines.length - 20);
                    const beforeText = lines.slice(startIdx, i - effectLines.length).join('\n');
                    
                    for (const dep of deps) {
                        try {
                            const regexStr = 'const\\s+' + dep + '\\s*=\\s*.*?(?:\\.map|\\.filter|\\[|\\]|\\{|\\})';
                            const regex = new RegExp(regexStr);
                            if (regex.test(beforeText)) {
                                console.log('UNSTABLE DEP: ' + dep + ' in ' + file + ':' + (i+1));
                            }
                        } catch(e) {}
                    }
                }
            } else if (lines[i].match(/^\s*\}\s*\)/)) {
                inEffect = false;
            }
        }
    }
}
