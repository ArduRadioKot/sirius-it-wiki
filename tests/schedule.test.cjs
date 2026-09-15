const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('schedule.js','utf8');
const group='ИОП-ИТ-26/1';
const realDate=Date;
async function setup({offline=false,stale=false,denied=false}={}) {
  const now=Date.parse('2026-09-15T05:36:00Z');
  const data={version:1,updatedAt:new Date(now-(stale?2*86400000:0)).toISOString(),fromDate:'2026-09-14',toDate:'2026-10-04',groups:{[group]:[{id:'1',date:'2026-09-15',start:'08:45',end:'10:05',title:'Математика, логика; проверка'.repeat(6),room:'Альфа 5.8',teachers:'Преподаватель',kind:'Лекция',comment:''}], 'ИОП-ИТ-26/2':[]}};
  const store=new Map([['sirius-schedule',JSON.stringify(data)],['sirius-reminders','true']]);
  const nodes=new Map();const sent=[];let blob;
  class Clock extends realDate {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const document={currentScript:{src:'https://wiki.test/repo/schedule.js'},hidden:false,addEventListener(){},querySelectorAll(){return[];},getElementById(id){if(!nodes.has(id)) nodes.set(id,{innerHTML:'',textContent:''});return nodes.get(id);},createElement(){return {click(){}};}};
  class TestURL extends URL {static createObjectURL(b){blob=b;return 'blob:test';}static revokeObjectURL(){}}
  const context={URL:TestURL,Blob,TextEncoder,Intl,Date:Clock,AbortSignal,console,document,location:{hash:'#/schedule'},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},navigator:{onLine:!offline,serviceWorker:{getRegistration:async()=>({active:true,showNotification:async(...v)=>sent.push(v)})}},Notification:{permission:denied?'denied':'granted',requestPermission:async()=>denied?'denied':'granted'},fetch:async()=>{if(offline)throw Error('offline');return{ok:true,json:async()=>data};},setTimeout(){},setInterval(){},addEventListener(){}};
  context.window=context;vm.runInNewContext(source,context);await new Promise(resolve=>setImmediate(resolve));
  return {context,nodes,sent,store,blob:()=>blob};
}
test('saved offline schedule and Moscow countdown work under a repository subpath',async()=>{const h=await setup({offline:true});assert.match(h.nodes.get('app').innerHTML,/08:45/);assert.match(h.nodes.get('nextHeadline').textContent,/9 мин/);assert.match(h.nodes.get('app').innerHTML,/Без интернета/);assert.equal(h.sent.length,1);assert.match(h.sent[0][1].data.url,/\/repo\/#\/schedule$/);await h.context.SiriusSchedule.refresh();assert.equal(h.sent.length,1);});
test('stale schedule and denied permission never trigger reminders',async()=>{assert.equal((await setup({stale:true})).sent.length,0);assert.equal((await setup({denied:true})).sent.length,0);});
test('calendar contains UTC dates, alarms and byte-folded Russian text',async()=>{const h=await setup();h.nodes.get('exportCalendar').onclick();const text=await h.blob().text();assert.match(text,/DTSTART:20260915T054500Z/);assert.match(text,/TRIGGER:-PT10M/);assert.match(text,/Математика\\, логика\\;/);for(const line of text.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);});
test('group selection persists, unknown period is distinct from a free day',async()=>{const h=await setup();h.nodes.get('scheduleGroup').onchange({target:{value:'ИОП-ИТ-26/2'}});assert.equal(h.store.get('sirius-group'),'ИОП-ИТ-26/2');assert.match(h.nodes.get('app').innerHTML,/занятий нет/);h.nodes.get('scheduleDate').onchange({target:{value:'2027-01-01'}});assert.match(h.nodes.get('app').innerHTML,/нет сохранённых данных/);});
