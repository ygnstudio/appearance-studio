'use strict';
// Run against Obsidian's actual app.css; covers paint outside ordinary elements.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {defaults,normalize,cssText}=require('../src/builtin');
const {normalizeControls}=require('../src/control-model');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
 try{
  const page=await browser.newPage({viewport:{width:900,height:600}});
  const base=fs.readFileSync(process.env.OBSIDIAN_BASE_CSS,'utf8');
  // Obsidian renamed left/right to primary/secondary; check either host generation.
  const ribbonClass=base.includes('.workspace-ribbon.mod-primary')?'mod-primary':'mod-left';
  await page.setContent(`<style>${base}</style><body class="theme-dark mod-macos show-ribbon is-hidden-frameless"><div class="app-container"><div class="workspace-ribbon ${ribbonClass}"></div><div class="workspace"><div class="workspace-split mod-root"><div class="workspace-tabs"><div class="workspace-tab-header-container"><div class="workspace-tab-header-container-inner"><div class="workspace-tab-header is-active"><div class="workspace-tab-header-inner">Active tab</div></div></div></div></div></div><div class="workspace-split mod-right-split mod-secondary-split"><div class="workspace-tab-header-container"><div class="workspace-tab-header is-active">Sidebar</div></div></div></div></div></body>`);
  const style=await page.addStyleTag({content:'/* builtin */'});
  const native=await page.locator('.mod-root .workspace-tab-header').evaluate(e=>getComputedStyle(e,'::before').boxShadow);
  assert.notEqual(native,'none','fixture must reproduce native opaque connecting curves');
  const read=()=>page.evaluate(()=>{
   const tab=document.querySelector('.mod-root .workspace-tab-header');
   const ribbon=getComputedStyle(document.querySelector('.workspace-ribbon'),'::before');
   const header=getComputedStyle(document.querySelector('.mod-root .workspace-tab-header-container'));
   const color=value=>{const c=document.createElement('canvas'),ctx=c.getContext('2d');ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
   return {corner:color(ribbon.backgroundColor),header:color(header.backgroundColor),before:getComputedStyle(tab,'::before').boxShadow,after:getComputedStyle(tab,'::after').boxShadow,sidebar:getComputedStyle(document.querySelector('.mod-secondary-split .workspace-tab-header'),'::before').boxShadow};
  });
  const nativeSidebar=(await read()).sidebar;
  const failures=[];
  const check=(actual,expected,label)=>{try{assert.deepEqual(actual,expected,label);}catch(e){failures.push(e.message);}};
  for(const theme of ['theme-dark','theme-light'])for(const mode of ['se-native-glass','is-translucent'])for(const opacity of [0,45,100]){
   const config=normalize(defaults());config.controls=normalizeControls();config.modules.translucency=true;
   config.values['--yn-深色窗口不透明度']=opacity;config.values['--yn-浅色窗口不透明度']=opacity;
   await style.evaluate((e,css)=>e.textContent=css,cssText(config));
   await page.evaluate(cls=>document.body.className=cls,`${theme} mod-macos show-ribbon is-hidden-frameless ${mode}`);
   const s=await read(),label=`${theme}/${mode}/${opacity}`;
   check(s.corner,s.header,label+' traffic-light background matches adjacent header');
   check(s.corner[3],Math.round(255*opacity/100),label+' corner has exactly one tint layer');
   check(s.before,'none',label+' left tab curve removed');check(s.after,'none',label+' right tab curve removed');
  }
  // Opaque native defaults, fullscreen/mobile and a disabled module retain native curves.
  const config=normalize(defaults());config.controls=normalizeControls();config.modules.translucency=true;
  await style.evaluate((e,css)=>e.textContent=css,cssText(config));
  for(const cls of ['theme-dark','theme-dark se-native-glass is-fullscreen','theme-dark se-native-glass is-mobile','theme-dark se-native-glass se-window-solid']){
   await page.evaluate(cls=>document.body.className=cls,cls);
   await style.evaluate(e=>e.textContent='');const expected=(await read()).before;
   await style.evaluate((e,css)=>e.textContent=css,cssText(config));check((await read()).before,expected,cls+' defaults');
  }
  config.modules.translucency=false;
  await style.evaluate((e,css)=>e.textContent=css,cssText(config));await page.evaluate(()=>document.body.className='theme-dark se-native-glass');check((await read()).before,native,'glass module disabled');
  // Each independently enabled tab control must not bring back opaque feet.
  await page.evaluate(()=>document.body.className='theme-dark');
  for(const controls of [{tabRadius:999},{tabRadius:0},{tabBorder:1},{tabColor:{mode:'custom',value:'#123456',strength:12}}]){
   config.controls=normalizeControls(controls);await style.evaluate((e,css)=>e.textContent=css,cssText(config));const s=await read();check(s.before,'none',JSON.stringify(controls)+' left');check(s.after,'none',JSON.stringify(controls)+' right');check(s.sidebar,nativeSidebar,'sidebar untouched');
  }
  config.controls=normalizeControls();await style.evaluate((e,css)=>e.textContent=css,cssText(config));check((await read()).before,native,'reset all tab controls restores native');
  await style.evaluate(e=>e.remove());check((await read()).before,native,'unload restores native');
  assert.deepEqual(failures,[]);
  console.log('PASS: traffic-light tint and both tab corners, two themes/material paths, 0/45/100%, native defaults, fullscreen/mobile/solid, independent controls and reset/unload.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
