const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (!['node_modules', 'dist', '.git', '.github', '.vite'].includes(file)) {
        getAllFiles(filePath, fileList);
      }
    } else {
      const ext = path.extname(file).toLowerCase();
      const base = path.basename(file);
      if (
        !['.png', '.ico', '.svg', '.jpeg', '.jpg', '.pdf', '.lock'].includes(ext) &&
        file !== 'bun.lock' &&
        file !== 'package-lock.json' &&
        !base.includes('entire-codebase') &&
        !base.startsWith('.') &&
        !dir.includes('.aistudio')
      ) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

const allFilePaths = getAllFiles(rootDir);

const priority = (f) => {
  const rel = './' + path.relative(rootDir, f).replace(/\\/g, '/');
  if (rel === './metadata.json') return 1;
  if (rel === './package.json') return 2;
  if (rel === './tsconfig.json') return 3;
  if (rel === './vite.config.ts') return 4;
  if (rel === './index.html') return 5;
  if (rel === './server.ts') return 6;
  if (rel.startsWith('./src/types')) return 7;
  if (rel.startsWith('./src/main.tsx')) return 8;
  if (rel.startsWith('./src/App.tsx')) return 9;
  if (rel.startsWith('./src/index.css')) return 10;
  if (rel.startsWith('./src/lib/')) return 20;
  if (rel.startsWith('./src/hooks/')) return 30;
  if (rel.startsWith('./src/components/')) return 40;
  if (rel.startsWith('./supabase/')) return 50;
  if (rel.startsWith('./scripts/')) return 60;
  if (rel.startsWith('./public/')) return 70;
  return 100;
};

allFilePaths.sort((a, b) => {
  const pa = priority(a);
  const pb = priority(b);
  if (pa !== pb) return pa - pb;
  return a.localeCompare(b);
});

let combinedText = '================================================================================\n';
combinedText += 'PULSE FITNESS - COMPLETE SOURCE CODE REPOSITORY (LINE BY LINE)\n';
combinedText += 'Total Files: ' + allFilePaths.length + '\n';
combinedText += 'Generated at: ' + new Date().toISOString() + '\n';
combinedText += '================================================================================\n\n';

let grandTotalLines = 0;

for (let i = 0; i < allFilePaths.length; i++) {
  const fp = allFilePaths[i];
  const relPath = path.relative(rootDir, fp).replace(/\\/g, '/');
  const content = fs.readFileSync(fp, 'utf8');
  const lines = content.split('\n');
  grandTotalLines += lines.length;
  
  combinedText += '--------------------------------------------------------------------------------\n';
  combinedText += 'FILE [' + (i + 1) + '/' + allFilePaths.length + ']: ' + relPath + ' (' + lines.length + ' lines)\n';
  combinedText += '--------------------------------------------------------------------------------\n';
  
  for (let l = 0; l < lines.length; l++) {
    const lineNum = String(l + 1).padStart(5, ' ');
    combinedText += lineNum + ' | ' + lines[l] + '\n';
  }
  combinedText += '\n\n';
}

fs.writeFileSync(path.join(rootDir, 'public', 'pulse-fitness-entire-codebase.txt'), combinedText, 'utf8');
fs.writeFileSync(path.join(rootDir, 'pulse-fitness-entire-codebase.txt'), combinedText, 'utf8');
console.log('Successfully written pulse-fitness-entire-codebase.txt!');
console.log('Total files:', allFilePaths.length, 'Total lines:', grandTotalLines, 'Bytes:', Buffer.byteLength(combinedText, 'utf8'));
