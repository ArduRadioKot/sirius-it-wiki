// Each deployment gets an atomic shell cache version, including vendored assets.
import {readFile, writeFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const files = ['index.html','styles.css','theme.js','schedule.js','app.js','pwa.js','manifest.webmanifest'];
async function walk(path) {for(const item of await readdir(path,{withFileTypes:true})) {const name=path+'/'+item.name;if(item.isDirectory()) await walk(name);else files.push(name);}}
await walk('assets');await walk('vendor');
const source=await readFile('sw.js','utf8');
const hash=createHash('sha256').update(source.replace(/const CACHE = PREFIX \+ '[^']+';/,"const CACHE = PREFIX + 'VERSION';"));
for(const file of files.sort()) hash.update(file).update(await readFile(file));
await writeFile('sw.js',source.replace(/const CACHE = PREFIX \+ '[^']+';/,`const CACHE = PREFIX + '${hash.digest('hex').slice(0,16)}';`));
