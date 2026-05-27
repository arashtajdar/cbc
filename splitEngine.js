const fs = require('fs');

const engineCode = fs.readFileSync('js/engine.js', 'utf8');
const lines = engineCode.split('\n');

const engineLines = [];
const uiLines = [];

let inUI = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('// --- 4. STATE MACHINE TRANSITIONS & UI BUILDERS ---')) {
        inUI = true;
    }

    if (inUI) {
        if (line.trim() === 'init();') {
            engineLines.push(line);
        } else {
            uiLines.push(line);
        }
    } else {
        engineLines.push(line);
    }
}

fs.writeFileSync('js/UIManager.js', uiLines.join('\n'));
fs.writeFileSync('js/engine.js', engineLines.join('\n'));
console.log('Split completed.');
