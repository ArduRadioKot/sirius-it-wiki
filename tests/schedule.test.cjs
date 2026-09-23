const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('schedule.js','utf8');
const group='ИОП-ИТ-26/1';
const realDate=Date;
async function setup({offline=false,stale=false,denied=false,legacy=false,host='wiki.test',checked=false,session}={}) {
  let now=Date.parse('2026-09-15T05:36:00Z');
  const data={version:1,updatedAt:new Date(now-(stale?2*86400000:0)).toISOString(),fromDate:'2026-09-14',toDate:'2026-10-04',groups:{[group]:[{id:'1',date:'2026-09-15',start:'08:45',end:'10:05',title:'Математика, логика; проверка'.repeat(6),room:'Альфа 5.8',teachers:'Преподаватель',kind:'Лекция',comment:''}], 'ИОП-ИТ-26/2':[], 'ИОП-ИТ-25/1':[], 'ИОП-ИТ-25/2':[]}};
  if(legacy){delete data.groups['ИОП-ИТ-25/1'];delete data.groups['ИОП-ИТ-25/2'];}
  const store=new Map([['sirius-schedule',JSON.stringify(data)],['sirius-reminders','true']]);
  if(checked) store.set('sirius-schedule-checked',String(now));
  const sessionStore=session||new Map();
  const nodes=new Map();const sent=[];let blob; let requests=0;const events={};const timers=[];
  class Clock extends realDate {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const document={currentScript:{src:'https://wiki.test/repo/schedule.js'},hidden:false,addEventListener(name,fn){events['doc:'+name]=fn;},querySelectorAll(){return[];},getElementById(id){if(!nodes.has(id)) nodes.set(id,{innerHTML:'',textContent:''});return nodes.get(id);},createElement(){return {click(){}};}};
  class TestURL extends URL {static createObjectURL(b){blob=b;return 'blob:test';}static revokeObjectURL(){}}
  const opened=[];let copied='';
  const context={URL:TestURL,Blob,TextEncoder,Intl,Date:Clock,AbortSignal,console,document,location:{hash:'#/schedule',hostname:host,protocol:host==='127.0.0.1'||host==='localhost'?'http:':'https:'},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},sessionStorage:{getItem:k=>sessionStore.get(k)??null,setItem:(k,v)=>sessionStore.set(k,v),removeItem:k=>sessionStore.delete(k)},navigator:{onLine:!offline,clipboard:{writeText:async(text)=>{copied=text;}},serviceWorker:{getRegistration:async()=>({active:true,showNotification:async(...v)=>sent.push(v)})}},Notification:{permission:denied?'denied':'granted',requestPermission:async()=>denied?'denied':'granted'},fetch:async()=>{requests++;if(offline)throw Error('offline');return{ok:true,json:async()=>JSON.parse(JSON.stringify(data))};},setTimeout(){},setInterval(fn,ms){timers.push({fn,ms});},addEventListener(name,fn){events[name]=fn;},open(url){opened.push(url);}};
  context.window=context;vm.runInNewContext(source,context);await new Promise(resolve=>setImmediate(resolve));
  return {context,nodes,sent,store,events,timers,data,advance:ms=>now+=ms,requests:()=>requests,blob:()=>blob,opened,copied:()=>copied};
}
test('saved offline schedule and Moscow countdown work under a repository subpath',async()=>{const h=await setup({offline:true});assert.match(h.nodes.get('app').innerHTML,/08:45/);assert.match(h.nodes.get('nextHeadline').textContent,/9 мин/);assert.match(h.nodes.get('app').innerHTML,/Без интернета/);assert.equal(h.sent.length,1);assert.match(h.sent[0][1].data.url,/\/repo\/#\/schedule$/);await h.context.SiriusSchedule.refresh();assert.equal(h.sent.length,1);});
test('stale schedule and denied permission never trigger reminders',async()=>{assert.equal((await setup({stale:true})).sent.length,0);assert.equal((await setup({denied:true})).sent.length,0);});
test('calendar contains UTC dates, alarms and byte-folded Russian text',async()=>{const h=await setup();h.nodes.get('exportCalendar').onclick();const text=await h.blob().text();assert.match(text,/DTSTART:20260915T054500Z/);assert.match(text,/TRIGGER:-PT10M/);assert.match(text,/METHOD:PUBLISH/);assert.match(text,/Математика\\, логика\\;/);for(const line of text.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);});
test('Google Calendar subscribes in one click via webcal cid',async()=>{
  const h=await setup();
  h.nodes.get('googleCalendar').onclick();
  assert.equal(h.opened[0],'https://calendar.google.com/calendar/render?cid=webcal://wiki.test/repo/data/calendars/iop-it-26-1.ics');
  assert.equal(h.copied(),'');
  assert.equal(h.blob(),undefined);
});
test('Notion Calendar uses the same one-click Google subscribe',async()=>{
  const h=await setup();
  h.nodes.get('notionCalendar').onclick();
  assert.equal(h.opened[0],'https://calendar.google.com/calendar/render?cid=webcal://wiki.test/repo/data/calendars/iop-it-26-1.ics');
  assert.match(h.nodes.get('calendarStatus').textContent,/Notion Calendar/);
});
test('local preview subscribes Google to the published GitHub Pages feed',async()=>{
  const h=await setup({host:'127.0.0.1'});
  h.nodes.get('googleCalendar').onclick();
  assert.equal(h.blob(),undefined);
  assert.equal(h.opened[0],'https://calendar.google.com/calendar/render?cid=webcal://arduradiokot.github.io/sirius-it-wiki/data/calendars/iop-it-26-1.ics');
});
test('same-time streams count as one pair for the day badge',async()=>{
  const h=await setup();
  h.data.groups[group].push({...h.data.groups[group][0],id:'2',room:'Бета 1.1',teachers:'Другой'});
  await h.context.SiriusSchedule.refresh({force:true});
  h.context.SiriusSchedule.render();
  assert.match(h.nodes.get('app').innerHTML,/class="schedule-count">1</);
  assert.match(h.nodes.get('app').innerHTML,/data-date="2026-09-15"[\s\S]*?class="daycount">1</);
  assert.match(h.nodes.get('app').innerHTML,/2 потока/);
});
test('group selection persists, unknown period is distinct from a free day',async()=>{const h=await setup();h.nodes.get('scheduleGroup').onchange({target:{value:'ИОП-ИТ-26/2'}});assert.equal(h.store.get('sirius-group'),'ИОП-ИТ-26/2');assert.match(h.nodes.get('app').innerHTML,/занятий нет/);h.nodes.get('scheduleDate').onchange({target:{value:'2027-01-01'}});assert.match(h.nodes.get('app').innerHTML,/нет сохранённых данных/);});

test('opening the app fetches immediately; staying open waits four hours',async()=>{
  const h=await setup();assert.equal(h.requests(),1);
  await h.events.online();assert.equal(h.requests(),1);
  const tick=h.timers.find(t=>t.ms===60000);
  await tick.fn();assert.equal(h.requests(),1);
  h.advance(3*3600000);await tick.fn();assert.equal(h.requests(),1);
  h.advance(3600000);await tick.fn();assert.equal(h.requests(),2);
  await h.context.SiriusSchedule.refresh();assert.equal(h.requests(),3);
  assert.ok(h.timers.some(t=>t.ms===60000));
});
test('opening the site fetches the schedule in the background even inside the four-hour window',async()=>{
  const h=await setup({checked:true});
  assert.equal(h.requests(),1);
});
test('returning to the app fetches again after a short pause',async()=>{
  const h=await setup({checked:true});
  assert.equal(h.requests(),1);
  h.context.document.hidden=false;
  await h.events['doc:visibilitychange']();
  assert.equal(h.requests(),1);
  h.advance(3000);
  await h.events['doc:visibilitychange']();
  await new Promise((resolve)=>setImmediate(resolve));
  assert.equal(h.requests(),2);
});
test('forced refresh still runs if another fetch is already in flight',async()=>{
  const h=await setup();
  let unlock;
  const gate=new Promise((resolve)=>{unlock=resolve;});
  let extra=0;
  h.context.fetch=async()=>{
    extra+=1;
    await gate;
    return{ok:true,json:async()=>JSON.parse(JSON.stringify(h.data))};
  };
  const first=h.context.SiriusSchedule.refresh({force:true});
  const second=h.context.SiriusSchedule.refresh({force:true});
  unlock();
  await Promise.all([first,second]);
  assert.equal(extra,2);
});
test('older deployment does not overwrite the latest saved snapshot',async()=>{
  const h=await setup();const original=h.store.get('sirius-schedule');
  h.data.updatedAt='2026-09-14T00:00:00Z';
  await h.context.SiriusSchedule.refresh();assert.equal(h.store.get('sirius-schedule'),original);
});
test('incomplete server snapshot does not replace complete device copy',async()=>{
  const h=await setup();
  const complete=JSON.parse(h.store.get('sirius-schedule'));
  complete.updatedAt='2026-09-16T00:00:00.000Z';
  h.store.set('sirius-schedule',JSON.stringify(complete));
  h.store.set('sirius-schedule-origin','device');
  delete h.data.groups['ИОП-ИТ-25/1'];
  delete h.data.groups['ИОП-ИТ-25/2'];
  h.data.updatedAt='2026-09-20T00:00:00.000Z';
  await h.context.SiriusSchedule.refresh();
  assert.equal(h.store.get('sirius-schedule-origin'),'device');
  assert.match(h.store.get('sirius-schedule'),/2026-09-16T00:00:00.000Z/);
});
test('network failure never marks a check successful or destroys the backup',async()=>{
  const h=await setup({offline:true});const original=h.store.get('sirius-schedule');
  await h.context.SiriusSchedule.refresh();assert.equal(h.store.get('sirius-schedule'),original);
  assert.equal(h.store.has('sirius-schedule-checked'),false);
});

test('both 2025 groups display their own lessons and persist selection',async()=>{
  const h=await setup();
  for(const name of ['ИОП-ИТ-25/1','ИОП-ИТ-25/2']) {
    h.data.groups[name]=[{...h.data.groups[group][0],id:name,title:'Занятие '+name}];
  }
  await h.context.SiriusSchedule.refresh();
  for(const name of ['ИОП-ИТ-25/1','ИОП-ИТ-25/2']) {
    h.nodes.get('scheduleGroup').onchange({target:{value:name}});
    assert.equal(h.store.get('sirius-group'),name);
    assert.match(h.nodes.get('app').innerHTML,new RegExp('Занятие '+name));
    h.nodes.get('exportCalendar').onclick();
    assert.ok((await h.blob().text()).includes('SUMMARY:Занятие '+name));
  }
});
test('legacy offline snapshot keeps 2026 lessons and does not claim 2025 has no classes',async()=>{
  const h=await setup({legacy:true,offline:true});
  assert.match(h.nodes.get('app').innerHTML,/Математика/);
  h.nodes.get('scheduleGroup').onchange({target:{value:'ИОП-ИТ-25/1'}});
  assert.match(h.nodes.get('app').innerHTML,/нет сохранённых данных/);
  assert.doesNotMatch(h.nodes.get('app').innerHTML,/В этот день занятий нет/);
});
test('device button loads the timetable without opening extra menus',async()=>{
  const h=await setup({legacy:true,host:'127.0.0.1'});
  const incoming=JSON.parse(h.store.get('sirius-schedule'));
  incoming.updatedAt='2026-09-21T00:00:00.000Z';
  incoming.groups['ИОП-ИТ-25/1']=[];
  incoming.groups['ИОП-ИТ-25/2']=[];
  let collected=0;
  h.context.SiriusSource={valid:()=>true,collect:async()=>{collected++;return incoming;}};
  h.context.SiriusSchedule.render();
  await h.nodes.get('deviceSchedule').onclick();
  assert.equal(collected,1);
  assert.equal(h.store.get('sirius-schedule-origin'),'device');
  assert.match(h.store.get('sirius-schedule'),/2026-09-21T00:00:00.000Z/);
  assert.doesNotMatch(h.nodes.get('app').innerHTML,/scheduleDeviceDialog|Импортировать файл|Загрузить напрямую|Обновлять с устройства|закладк/);
});
test('GitHub Pages never waits for the in-browser collector (blocked by CORS)',async()=>{
  const h=await setup();
  let collected=0;
  h.context.SiriusSource={valid:()=>true,collect:async()=>{collected++;throw new Error('cors');}};
  h.context.SiriusSchedule.render();
  assert.doesNotMatch(h.nodes.get('app').innerHTML,/id="deviceSchedule"|С устройства|refreshSchedule|↻/);
  await h.context.SiriusSchedule.refresh({force:true});
  assert.equal(collected,0);
  assert.equal(h.store.get('sirius-schedule-origin'),'server');
});
test('local preview refresh asks the device collector after the published snapshot',async()=>{
  const h=await setup({host:'127.0.0.1'});
  const incoming=JSON.parse(h.store.get('sirius-schedule'));
  incoming.updatedAt='2026-09-21T00:00:00.000Z';
  let collected=0;
  h.context.SiriusSource={valid:()=>true,collect:async()=>{collected++;return incoming;}};
  await h.context.SiriusSchedule.refresh({force:true});
  assert.equal(collected,1);
  assert.equal(h.store.get('sirius-schedule-origin'),'device');
});
test('failed device fetch offers a file picker instead of extra menus',async()=>{
  const h=await setup({host:'127.0.0.1'});
  h.context.SiriusSource={valid:()=>true,collect:async()=>{throw new Error('blocked');}};
  h.context.SiriusSchedule.render();
  await h.nodes.get('deviceSchedule').onclick();
  assert.match(h.nodes.get('app').innerHTML,/Выбрать файл/);
  assert.doesNotMatch(h.nodes.get('app').innerHTML,/scheduleDeviceDialog|Импортировать файл|Загрузить напрямую|Обновлять с устройства|закладк/);
  const payload=JSON.parse(h.store.get('sirius-schedule'));
  payload.updatedAt='2026-09-21T00:00:00.000Z';
  await h.nodes.get('deviceFile').onchange({target:{files:[{size:32,text:async()=>JSON.stringify(payload)}],value:''}});
  assert.equal(h.store.get('sirius-schedule-origin'),'device');
  assert.doesNotMatch(h.nodes.get('app').innerHTML,/Выбрать файл/);
});
