const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {webcrypto}=require('node:crypto');
const api=require('../schedule-source.js');
const {execFileSync}=require('node:child_process');
const group=api.GROUPS[0];
function lesson(overrides={}) {return {date:'21.09.2026',startTime:'08:45',endTime:'10:05',discipline:'Алгебра',group,classroom:'АльфаАльфа',teachers:{one:{fio:'Иванов'}},...overrides};}
test('device and Python collectors generate identical event IDs',async()=>{
  const event=lesson();
  const [row]=await api.normalize({slot:[event]},group,'2026-09-21','2026-09-27');
  const script="import importlib.util,json,sys; s=importlib.util.spec_from_file_location('s','scripts/update-schedule.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.normalize({'a':[json.loads(sys.argv[1])]},m.GROUPS[0])[0]))";
  const expected=JSON.parse(execFileSync('python3',['-B','-c',script,JSON.stringify(event)],{encoding:'utf8'}));
  assert.deepEqual(row,expected);
});
test('import rejects invalid dates, times, missing groups and future timestamps',async()=>{
  const rows=await api.normalize({slot:[lesson()]},group,'2026-09-21','2026-09-27');
  const referenceNow=Date.parse('2026-09-21T12:00:00Z');
  const base={version:1,source:api.SOURCE,updatedAt:'2026-09-21T00:00:00Z',fromDate:'2026-09-21',toDate:'2026-10-11',groups:Object.fromEntries(api.GROUPS.map(g=>[g,rows]))};
  assert.equal(api.valid(base,true,referenceNow),true);
  for(const change of [d=>d.groups[group][0].start='29:99',d=>d.groups[group][0].date='2026-02-30',d=>delete d.groups[api.GROUPS[3]],d=>d.updatedAt='2099-01-01T00:00:00Z']) {
    const data=structuredClone(base);change(data);assert.equal(api.valid(data,true,referenceNow),false);
  }
});
test('Livewire partial state preserves fields and replaces complete event arrays',()=>{
  const state={serverMemo:{data:{group,events:{one:[1]},date:'21.09.2026'},checksum:'old'}};
  api.mergeMemo(state,{serverMemo:{data:{events:[]},checksum:'new'}});
  assert.equal(state.serverMemo.data.group,group);assert.deepEqual(state.serverMemo.data.events,[]);assert.equal(state.serverMemo.checksum,'new');
  assert.throws(()=>api.mergeMemo(state,{serverMemo:{errors:{group:['invalid']},checksum:'x'}}));
});
test('collector reads three weeks for each group and keeps cookie credentials',async()=>{
  let requests=0;let activeGroup;let week=0;
  const initial={fingerprint:{name:'main-grid'},serverMemo:{data:{group:'',events:[]},checksum:'initial'}};
  class Parser {parseFromString(){return{querySelector:selector=>selector==='[wire\\:initial-data]'?{getAttribute:()=>JSON.stringify(initial)}:null};}}
  const sandbox={window:{},location:{origin:'https://schedule.siriusuniversity.ru'},DOMParser:Parser,Date,Intl,TextEncoder,Uint8Array,crypto:webcrypto,AbortSignal,console};
  vm.runInNewContext(fs.readFileSync('schedule-source.js','utf8'),sandbox);
  const request=async(url,options)=>{
    requests++;assert.equal(options.credentials,'include');
    if(url.endsWith('/'))return{ok:true,text:async()=>"window.livewire_token = 'public-session-token'"};
    const body=JSON.parse(options.body);const command=body.updates[0].payload;
    if(command.method==='set'){activeGroup=command.params[0];week=0;}else{assert.equal(command.method,'addWeek');week++;assert.equal(body.serverMemo.data.group,activeGroup);}
    const date=['21.09.2026','28.09.2026','05.10.2026'][week];
    return{ok:true,json:async()=>({serverMemo:{data:{group:activeGroup,events:{slot:[lesson({group:activeGroup,date})]}},checksum:'week'+week}})};
  };
  const data=await sandbox.window.SiriusSource.collect({request,now:new Date('2026-09-21T12:00:00Z')});
  assert.equal(requests,16);assert.equal(data.fromDate,'2026-09-21');assert.equal(data.toDate,'2026-10-11');
  for(const g of api.GROUPS)assert.equal(data.groups[g].length,3);
});
test('export bookmark returns the snapshot to the wiki',()=>{
  const url=api.bookmarklet();assert.ok(url.startsWith('javascript:'));
  const script=decodeURIComponent(url.slice('javascript:'.length));
  assert.match(script,/location.origin !== 'https:\/\/schedule.siriusuniversity.ru'/);
  assert.match(script,/sirius-schedule:/);
  assert.match(script,/arduradiokot.github.io\/sirius-it-wiki/);
  assert.doesNotMatch(script,/createElement\(['"]script/);
  assert.doesNotThrow(()=>new vm.Script(script));
});
test('GitHub Pages collector talks to the university without cross-site cookies',async()=>{
  const sandbox={window:{},document:{currentScript:{src:'https://arduradiokot.github.io/sirius-it-wiki/schedule-source.js'}},location:{origin:'https://arduradiokot.github.io'},Date,Intl,TextEncoder,Uint8Array,crypto:webcrypto,AbortSignal,console,URL,
    DOMParser:class{parseFromString(){return{querySelector:()=>null};}}};
  vm.runInNewContext(fs.readFileSync('schedule-source.js','utf8'),sandbox);
  let url='';let credentials='';
  await assert.rejects(()=>sandbox.window.SiriusSource.collect({request:async(href,options)=>{url=href;credentials=options.credentials;return{ok:false};}}));
  assert.equal(url,'https://schedule.siriusuniversity.ru/');
  assert.equal(credentials,'omit');
});
test('local preview talks to the same-origin schedule proxy without cross-site cookies',async()=>{
  const sandbox={window:{},document:{currentScript:{src:'http://192.168.1.8:8765/schedule-source.js'}},Date,Intl,TextEncoder,Uint8Array,crypto:webcrypto,AbortSignal,console,URL,
    DOMParser:class{parseFromString(){return{querySelector:()=>null};}}};
  vm.runInNewContext(fs.readFileSync('schedule-source.js','utf8'),sandbox);
  let url='';let credentials='';
  await assert.rejects(()=>sandbox.window.SiriusSource.collect({request:async(href,options)=>{url=href;credentials=options.credentials;return{ok:false};}}));
  assert.equal(url,'http://192.168.1.8:8765/__schedule/');
  assert.equal(credentials,'omit');
  assert.equal(sandbox.window.SiriusSource.isLocalHost('10.0.0.12'),true);
  assert.equal(sandbox.window.SiriusSource.isLocalHost('siriusuniversity.ru'),false);
});
