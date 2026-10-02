'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {defaults,normalize,cssText}=require('../src/builtin');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
 try{
 const page=await browser.newPage();const config=normalize(defaults());config.modules.translucency=true;
 const base=fs.readFileSync(process.env.OBSIDIAN_BASE_CSS,'utf8');
 await page.setContent(`<style>${base}</style><body class="theme-dark is-translucent"><div class="app-container"><div class="workspace"><div class="workspace-split mod-root"><div class="workspace-tabs"><div class="workspace-leaf"><div class="workspace-leaf-content" data-type="snippet-editor-view"><div class="view-header"></div><div class="view-content"><div class="se-root"><nav class="se-page-nav"></nav><div class="se-builtin-module">模块</div><fieldset class="se-setting-group"><div class="se-setting-row">参数</div></fieldset></div></div></div></div></div></div><div class="workspace-leaf-resize-handle"></div><div class="workspace-ribbon"></div></div></div><div class="modal"><div class="se-dialog"><button class="se-color" style="--se-swatch:#ED3321">樱桃红</button></div></div></body>`);
 await page.addStyleTag({content:fs.readFileSync('styles.css','utf8')});const style=await page.addStyleTag({content:cssText(config)});
 const computed=()=>page.evaluate(()=>{const c=(s,p)=>getComputedStyle(document.querySelector(s)).getPropertyValue(p);return {content:c('.view-content','background-color'),header:c('.view-header','background-color'),divider:c('.workspace-leaf-resize-handle','border-right-color'),card:c('.se-builtin-module','border-width'),row:c('.se-setting-row','border-bottom-width'),nav:c('.se-page-nav','border-bottom-width'),swatch:getComputedStyle(document.querySelector('.se-color'),'::before').backgroundColor,swatchDisplay:getComputedStyle(document.querySelector('.se-color'),'::before').display,buttonDisplay:c('.se-color','display')};});
 for(const theme of ['theme-dark','theme-light']){
 await page.evaluate(theme=>document.body.className=theme+' is-translucent',theme);
 await page.waitForTimeout(250);const s=await computed();assert.equal(s.content,'rgba(0, 0, 0, 0)');assert.equal(s.header,'rgba(0, 0, 0, 0)');assert.equal(s.divider,'rgba(0, 0, 0, 0)');assert.equal(s.card,'0px');assert.equal(s.row,'0px');assert.equal(s.nav,'0px');assert.equal(s.swatch,'rgb(237, 51, 33)');assert.equal(s.swatchDisplay,'block');assert.equal(s.buttonDisplay,'flex');
 }
 // A legacy note opacity must not darken the note differently from the sidebar.
 await page.evaluate(()=>{const note=document.createElement('div');note.className='workspace-leaf-content';note.dataset.type='markdown';note.innerHTML='<div class="view-content"><p>Sharp text</p></div>';document.querySelector('.workspace').appendChild(note);document.body.style.setProperty('--yn-笔记底色不透明度','99%');});
 for(const theme of ['theme-dark','theme-light'])for(const opacity of [0,45,100]){
  await page.evaluate(({theme,opacity})=>{document.body.className=theme+' se-native-glass';document.body.style.setProperty(theme==='theme-dark'?'--yn-深色窗口不透明度':'--yn-浅色窗口不透明度',opacity+'%');},{theme,opacity});
  const tint=await page.evaluate(()=>{const style=e=>getComputedStyle(e),note=document.querySelector('[data-type="markdown"]'),panel=document.querySelector('[data-type="snippet-editor-view"]'),ribbon=document.querySelector('.workspace-ribbon');const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');ctx.fillStyle=style(note).backgroundColor;ctx.fillRect(0,0,1,1);return {note:style(note).backgroundColor,panel:style(panel).backgroundColor,ribbon:style(ribbon).backgroundColor,pixel:[...ctx.getImageData(0,0,1,1).data],opacity:style(note.querySelector('p')).opacity,filter:style(note.querySelector('p')).filter};});
  assert.equal(tint.note,tint.panel);assert.equal(tint.note,tint.ribbon);assert.ok(Math.abs(tint.pixel[3]-255*opacity/100)<=1);assert.equal(tint.opacity,'1');assert.equal(tint.filter,'none');if(opacity===100)assert.deepEqual(tint.pixel,theme==='theme-dark'?[11,13,18,255]:[250,250,250,255]);
 }
 await page.evaluate(()=>{for(const key of ['--yn-深色窗口不透明度','--yn-浅色窗口不透明度','--yn-笔记底色不透明度'])document.body.style.removeProperty(key);});
 await page.emulateMedia({reducedTransparency:'reduce'});assert.ok(!(await page.locator('.workspace-leaf-content').first().evaluate(e=>getComputedStyle(e).backgroundColor)).includes('0.8'));await page.emulateMedia({reducedTransparency:'no-preference'});
 for(const state of ['theme-dark','theme-dark is-translucent is-fullscreen','theme-dark is-translucent is-mobile']){
 await page.evaluate(state=>document.body.className=state,state);assert.notEqual((await computed()).content,'rgba(0, 0, 0, 0)');
 }
 await page.evaluate(()=>document.body.className='theme-dark se-native-glass');assert.equal((await computed()).content,'rgba(0, 0, 0, 0)');
 await page.evaluate(()=>document.body.className='theme-dark is-translucent');await style.evaluate(e=>e.remove());await page.waitForTimeout(250);assert.notEqual((await computed()).content,'rgba(0, 0, 0, 0)');assert.notEqual((await computed()).divider,'rgba(0, 0, 0, 0)');
 assert.equal(require('../src/colors').colors.length,32);
 console.log('PASS: transparency / divider / swatches in both themes; fullscreen/mobile exclusions; reduced transparency; module removal; 32 colors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
