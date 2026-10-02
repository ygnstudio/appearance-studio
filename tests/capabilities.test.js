'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {capabilities,runtimeConfig,importConfig,requirement,supports}=require('../src/capabilities');
const {defaults,normalize,cssText,BuiltinStyleEngine}=require('../src/builtin');
const {CONTROLS}=require('../src/control-model');
const {makePreset,applyPreset}=require('../src/presets');
const {BuiltinManager}=require('../src/builtin');
const mac={isDesktopApp:true,isMacOS:true},win={isDesktopApp:true,isWin:true},ios={isMobileApp:true,isIosApp:true},android={isMobileApp:true,isAndroidApp:true};
function doc({mobile=false,native=true,fullscreen=false,reduced=false}={}){return {body:{classList:{contains:k=>k==='is-mobile'&&mobile}},defaultView:{matchMedia:()=>({matches:reduced}),electronWindow:native?{setVibrancy(){},setBackgroundColor(){},getBackgroundColor(){},isFullScreen:()=>fullscreen}:undefined}};}
function configured(){const c=normalize(defaults());c.modules.translucency=true;c.modules.hideStatus=true;c.controls.tabSize=18;c.controls.tabWidth=250;c.controls.h3Size=1.7;return c;}
test('capability matrix separates OS, mobile layout and actual native APIs',()=>{
 const d=doc();assert.equal(capabilities({platform:mac,doc:d}).materialEnabled,true);
 for(const platform of [win,{isDesktopApp:true,isLinux:true},ios,android])assert.equal(capabilities({platform,doc:d}).windowMaterial,false);
 for(const platform of [ios,android]){const c=capabilities({platform,doc:d});assert.equal(c.desktopTabs,false);assert.equal(c.statusBar,false);}
 assert.equal(capabilities({platform:win,doc:d}).desktopTabs,true);
 const missing=capabilities({platform:mac,doc:doc({native:false})});assert.equal(missing.windowMaterial,true);assert.equal(missing.materialEnabled,false);assert.match(missing.materialReason,/不支持/);
 for(const options of [{fullscreen:true},{reduced:true}]){const c=capabilities({platform:mac,doc:doc(options)});assert.equal(c.windowMaterial,true);assert.equal(c.materialEnabled,false);assert.ok(c.materialReason);}
 assert.equal(capabilities({platform:mac,doc:d,state:'unavailable'}).materialEnabled,false);
 assert.equal(capabilities({platform:mac,app:{isMobile:true},doc:d}).desktopTabs,false);
 assert.equal(capabilities({platform:mac,doc:doc({mobile:true})}).nativeMaterial,false);
});
test('every control shares the UI and runtime requirement; narrow settings remain cross-platform',()=>{
 for(const f of CONTROLS)assert.equal(f.capability,requirement('controls.'+f.id));
 const c=capabilities({platform:ios});for(const id of ['bodySize','h6Color','treeSize','narrowMargin'])assert.equal(supports(c,requirement('controls.'+id)),true);
 assert.equal(supports(c,requirement('controls.tabColor.mode')),false);
});
test('runtime projection suppresses unsupported CSS without mutating saved desktop settings',()=>{
 const saved=configured(),before=structuredClone(saved),d=doc();
 for(const platform of [ios,android,win,mac]){
  const caps=capabilities({platform,doc:d}),css=cssText(saved,()=>false,caps);
  assert.match(css,/--h3-size: 1.7em/);assert.match(css,/--nav-item-size|nav-files-container/);
  assert.equal(css.includes('--yn-window-scrim'),platform===mac);
  assert.equal(css.includes('--tab-font-size: 18px'),platform===mac||platform===win);
  assert.equal(css.includes('.status-bar'),platform===mac||platform===win);
 }
 assert.deepEqual(saved,before);assert.equal(runtimeConfig(saved,capabilities({platform:ios})).controls.tabRadius,null);
 assert.ok(cssText(saved,()=>false,capabilities({platform:mac,doc:d})).includes('border-radius: 999px'));
});
test('each window gets its own capabilities and dispose removes generated CSS',()=>{
 function fake(caps){return {caps,defaultView:{closed:false},head:{appendChild(){}},createElement:()=>({dataset:{},textContent:'',remove(){this.removed=true;}})};}
 const c=configured(),engine=new BuiltinStyleEngine({config:c},()=>false,()=>[],d=>d.caps),a=fake(capabilities({platform:mac,doc:doc()})),b=fake(capabilities({platform:ios}));
 engine.attach(a);engine.attach(b);assert.match(engine.nodes.get(a).textContent,/--yn-window-scrim/);assert.ok(!engine.nodes.get(b).textContent.includes('--yn-window-scrim'));
 engine.previewControl('tabWidth',300);assert.match(engine.nodes.get(a).textContent,/--tab-max-width: 300px/);assert.ok(!engine.nodes.get(b).textContent.includes('--tab-max-width'));
 const nodes=[...engine.nodes.values()];engine.dispose();assert.ok(nodes.every(n=>n.removed));
});
test('import applies common changes, preserves unsupported values and export retains them',async()=>{
 const before=configured(),incoming=configured();incoming.controls.h3Size=2;incoming.controls.tabWidth=400;incoming.glassMaterial='sidebar';incoming.values['--yn-深色窗口不透明度']=88;incoming.modules.hideStatus=false;
 const original=structuredClone(incoming),caps=capabilities({platform:ios}),projection=importConfig(before,incoming,caps);
 assert.equal(projection.config.controls.h3Size,2);assert.equal(projection.config.controls.tabWidth,250);assert.equal(projection.config.modules.hideStatus,true);assert.equal(projection.config.values['--yn-深色窗口不透明度'],45);assert.equal(projection.skipped.length,4);assert.deepEqual(incoming,original);
 const data={builtin:before};const plugin={data,app:{vault:{getConfig:()=>''}},capabilities:()=>caps,builtinStyles:{},persist:async()=>{}};
 plugin.builtin=new BuiltinManager({data,persist:plugin.persist,configDir:'.obsidian'});
 await applyPreset(plugin,makePreset(incoming,'Mac'),false);assert.deepEqual(data.builtin,projection.config);assert.deepEqual(data.appearanceUndo.config,before);
 assert.equal(makePreset(data.builtin,'phone').config.controls.tabWidth,250);
 await applyPreset(plugin,makePreset(data.appearanceUndo.config,'undo'),false);assert.deepEqual(data.builtin,before);
});
test('Windows imports desktop tab settings while retaining Mac-only settings',()=>{
 const before=configured(),incoming=configured();incoming.controls.tabWidth=350;incoming.glassMaterial='sidebar';
 const next=importConfig(before,incoming,capabilities({platform:win}));assert.equal(next.config.controls.tabWidth,350);assert.equal(next.config.glassMaterial,before.glassMaterial);assert.equal(next.skipped.length,1);
});
