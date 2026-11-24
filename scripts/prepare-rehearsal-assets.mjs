import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=join(root,'assets/rehearsal-font');
const manifest=JSON.parse(await readFile(join(source,'manifest.json'),'utf8'));
const font=Buffer.concat(await Promise.all(manifest.parts.map(part=>readFile(join(source,part)))));
if(font.length!==manifest.bytes||createHash('sha256').update(font).digest('hex')!==manifest.sha256)throw new Error('Rehearsal font integrity check failed');
await mkdir(join(root,'public/fonts'),{recursive:true});
await writeFile(join(root,'public/fonts/NotoSansSC-Reading.ttf.gz'),font);
const pdfPackage=JSON.parse(await readFile(join(root,'node_modules/pdfjs-dist/package.json'),'utf8'));
if(pdfPackage.version!=='5.4.624')throw new Error('Unexpected PDF.js version');
await mkdir(join(root,'public/vendor'),{recursive:true});
await copyFile(join(root,'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),join(root,'public/vendor/pdf.worker-5.4.624.min.mjs'));
console.log('Prepared verified rehearsal font and PDF.js worker');
