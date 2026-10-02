'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BuiltinManager,BuiltinStyleEngine,defaults,normalize,cssText}=require('../src/builtin');
const {assets}=require('../src/bundled');
// Historical filenames are deliberate fixtures: they are now ordinary user CSS.
const customNames=['00-笔记视觉系统.css','10-界面导航.css','20-半透明窗口.css','90-隐藏状态栏.css','99-外观设置.css'];
function fixture(custom=true){
 const dir='.custom/snippets',files=new Map(custom?customNames.map(name=>[dir+'/'+name,'body { --user-owned: 1; }']):[]),on=new Set(custom?customNames:[]),data={drafts:{},history:[]},saved=[],io=[];
 const adapter=Object.fromEntries(['exists','read','write','mkdir','rename'].map(method=>[method,async(...args)=>{io.push([method,...args]);throw new Error('Unexpected snippet access: '+method);} ]));
 const manager=new BuiltinManager({adapter,configDir:'.custom',data,persist:async()=>saved.push(JSON.parse(JSON.stringify(data))),enabled:p=>{io.push(['enabled',p]);return on.has(p.split('/').pop());},setEnabled:async(p,value)=>{io.push(['setEnabled',p,value]);throw new Error('Unexpected snippet toggle');}});
 return {manager,files,on,data,adapter,saved,dir,io};
}
test('fresh install follows Obsidian without requiring snippets',async()=>{const f=fixture(false);await f.manager.initialize();assert.equal(f.data.builtin.modules.notes,false);assert.equal(f.data.builtin.modules.navigation,false);assert.equal(f.data.builtin.modules.hideStatus,false);assert.equal(f.files.size,0);assert.equal(cssText(f.data.builtin),'');assert.deepEqual(f.io,[]);});
test('initialization never reads, archives or disables old-named user CSS or drafts',async()=>{
 const f=fixture(),beforeFiles=[...f.files],beforeEnabled=[...f.on];
 f.data.drafts[f.dir+'/99-外观设置.css']={text:'unfinished user changes'};
 const beforeDrafts=structuredClone(f.data.drafts);await f.manager.initialize();
 assert.deepEqual([...f.files],beforeFiles);assert.deepEqual([...f.on],beforeEnabled);assert.deepEqual(f.data.drafts,beforeDrafts);assert.deepEqual(f.io,[]);assert.equal(f.data.builtinMigration,undefined);assert.equal(cssText(f.data.builtin),'');
});
test('obsolete pending journals remain opaque and never resume file operations',async()=>{
 const f=fixture(),journal={status:'pending',backup:'.custom/snippet-editor-backups/old',files:[{name:customNames[0],text:'original',enabled:true}],config:defaults()};
 f.data.builtinMigration=journal;await f.manager.initialize();assert.equal(f.data.builtinMigration,journal);assert.equal(f.saved.at(-1).builtinMigration.status,'pending');assert.deepEqual(f.io,[]);assert.equal(cssText(f.data.builtin),'');
});
test('same-named enabled CSS cannot suppress built-in rendering',async()=>{
 const custom=fixture(),fresh=fixture(false);for(const f of [custom,fresh]){await f.manager.initialize();await f.manager.update({modules:{hideStatus:true},controls:{bodyLineHeight:1.9}});}
 const css=cssText(custom.manager.config);assert.equal(css,cssText(fresh.manager.config));assert.match(css,/--line-height-normal: 1.9;/);assert.ok(css.includes(assets['status-bar.css']));assert.deepEqual(custom.io,[]);
});
test('failed initial persistence removes the incomplete configuration without touching user data',async()=>{
 const f=fixture(),before=structuredClone(f.data);f.manager.persist=async()=>{throw new Error('disk full');};await assert.rejects(f.manager.initialize(),/disk full/);assert.deepEqual(f.data,before);assert.deepEqual(f.io,[]);
});
test('current parameters survive repeated initialization alongside old-named snippets',async()=>{
 const f=fixture(),config=normalize(defaults());config.glassMaterial='sidebar';config.controls.bodyLineHeight=1.9;config.controls.h3Color={mode:'custom',value:'#123456',strength:73};config.values['--yn-深色窗口不透明度']=28;config.modules.translucency=true;config.showFileTreeGuides=false;f.data.builtin=config;const before=structuredClone(config);
 await f.manager.initialize();await f.manager.initialize();assert.deepEqual(f.data.builtin,before);assert.equal(f.saved.length,0);assert.deepEqual(f.io,[]);
});
test('module and master toggles independently remove CSS',()=>{const c=defaults();c.modules.hideStatus=true;assert.ok(cssText(c).includes(assets['status-bar.css']));c.modules.hideStatus=false;assert.ok(!cssText(c).includes(assets['status-bar.css']));c.enabled=false;assert.equal(cssText(c),'');});
test('style engine synchronizes main and popout documents and fully cleans up',()=>{
 function doc(){const nodes=[];return {nodes,defaultView:{closed:false},head:{appendChild:n=>nodes.push(n)},createElement:()=>({dataset:{},textContent:'',remove(){this.removed=true;}})};}
 const manager={config:normalize(defaults())},engine=new BuiltinStyleEngine(manager),main=doc(),popout=doc();engine.attach(main);engine.attach(main);engine.attach(popout);assert.equal(main.nodes.length,1);assert.equal(main.nodes[0].textContent,popout.nodes[0].textContent);manager.config.controls.bodyLineHeight=1.8;engine.apply();assert.match(popout.nodes[0].textContent,/--line-height-normal: 1.8;/);engine.dispose();assert.ok(main.nodes[0].removed);assert.ok(popout.nodes[0].removed);assert.equal(engine.nodes.size,0);
});
test('failed setting persistence rolls back in-memory settings',async()=>{const f=fixture(false);await f.manager.initialize();f.manager.persist=async()=>{throw new Error('save failed');};await assert.rejects(f.manager.update({values:{'--yn-正文行高':1.9}}));assert.equal(f.data.builtin.values['--yn-正文行高'],1.65);});
test('value validation prevents injecting raw CSS into generated rules',async()=>{const f=fixture(false);await f.manager.initialize();await assert.rejects(f.manager.update({values:{'--yn-正文行高':'1; color: red'}}));await assert.rejects(f.manager.update({values:{'--yn-正文行高':Infinity}}));await assert.rejects(f.manager.update({values:{'--unknown':1}}));});
test('v3.1 clear glass migrates once and removes independent note opacity',async()=>{const f=fixture(false);f.data.builtin={...defaults(),version:2,glassMaterial:'under-window',values:{...defaults().values,'--yn-深色窗口不透明度':0,'--yn-笔记底色不透明度':75,'--yn-正文行高':1.5}};await f.manager.initialize();assert.equal(f.data.builtin.glassMaterial,'glass');assert.equal(f.data.builtin.values['--yn-深色窗口不透明度'],45);assert.equal(f.data.builtin.values['--yn-正文行高'],1.5);assert.ok(!('--yn-笔记底色不透明度'in f.data.builtin.values));assert.equal(f.saved.at(-1).builtin.version,3);await f.manager.update({glassMaterial:'under-window',values:{'--yn-深色窗口不透明度':0}});await f.manager.initialize();assert.equal(f.data.builtin.glassMaterial,'under-window');assert.equal(f.data.builtin.values['--yn-深色窗口不透明度'],0);});
test('existing nonzero tint and frosted material survive upgrade',async()=>{const f=fixture(false);f.data.builtin={...defaults(),version:2,glassMaterial:'sidebar',values:{...defaults().values,'--yn-深色窗口不透明度':20}};await f.manager.initialize();assert.equal(f.data.builtin.glassMaterial,'sidebar');assert.equal(f.data.builtin.values['--yn-深色窗口不透明度'],20);});
test('failed version upgrade persistence retains the previous configuration',async()=>{const f=fixture(false);const before={...defaults(),version:2};f.data.builtin=before;f.manager.persist=async()=>{throw new Error('disk full');};await assert.rejects(f.manager.initialize(),/disk full/);assert.equal(f.data.builtin,before);});
test('color settings persist and roll back on save failure',async()=>{const f=fixture(false);await f.manager.initialize();await f.manager.update({colors:{heading:{mode:'custom',value:'#123'}}});assert.equal(f.saved.at(-1).builtin.colors.heading.value,'#112233');const before=f.data.builtin;f.manager.persist=async()=>{throw new Error('disk full');};await assert.rejects(f.manager.update({colors:{heading:{mode:'theme'}}}),/disk full/);assert.equal(f.data.builtin,before);});
