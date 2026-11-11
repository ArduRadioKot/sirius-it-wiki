// Pack every supplied course page, including its exercises, for the wiki router.
import {readFile,writeFile,readdir} from 'node:fs/promises';
const root='courses/matan';const paths=['index.html','textbook.html'];
for(const dir of ['lessons','reference']) for(const name of await readdir(`${root}/${dir}`)) if(name.endsWith('.html')) paths.push(`${dir}/${name}`);
const pages={};const initializers=[];
for(const path of paths){const html=await readFile(`${root}/${path}`,'utf8');const key=path.replace(/\.html$/,'');
 const body=html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1]||'';
 const styles=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]);
 const scripts=[...html.matchAll(/<script\s*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
 pages[key]={html:body,title:html.match(/<title>(.*?)<\/title>/)?.[1]||key,styles};
 if(scripts.length) initializers.push(`${JSON.stringify(key)}:function(Course){\n${scripts.join('\n')}\n}`);
}
await writeFile(`${root}/assets/pages-data.js`,`window.MatanPages=${JSON.stringify(pages)};\nwindow.MatanInitializers={${initializers.join(',\n')}};\n`);
console.log(`Packed ${paths.length} course pages.`);
