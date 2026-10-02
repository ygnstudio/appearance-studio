'use strict';
// Isolated renderer fixture: native CSS + real plugin, simulated snippet loading.
// Does not change the real vault. OBSIDIAN_BASE_CSS must be the installed default theme CSS.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),dir=path.join(__dirname,'fixtures/compatibility');
const artifact=process.env.ARTIFACT_DIR||path.join(require('node:os').tmpdir(),'snippet-editor-compatibility');fs.mkdirSync(artifact,{recursive:true});
const names=fs.readdirSync(dir).filter(n=>n.endsWith('.css')).sort();
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
 try {
 const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<html><head><style>'+fs.readFileSync(process.env.OBSIDIAN_BASE_CSS,'utf8')+'</style></head><body class="theme-light"><div id="host"></div></body></html>');
 await page.addStyleTag({content:fs.readFileSync(path.join(root,'styles.css'),'utf8')});
 await page.addStyleTag({content:'body{display:block;margin:0;overflow:auto}#host{width:390px;height:850px;position:absolute;right:0;top:0}#samples{width:600px;padding:12px}.workspace-leaf-content{position:relative;width:100%;height:auto}.markdown-preview-view,.markdown-source-view{padding:12px}.cm-line{height:auto}'});
 for(const p of ['tests/browser-harness.js','main.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,p),'utf8')});
 const initial=Object.fromEntries(names.map(n=>['.obsidian/snippets/'+n,fs.readFileSync(path.join(dir,n),'utf8')]));
 await page.evaluate(async initial=>{
  await startHarness(initial);
  // Explicit native-loader simulation: enable/save must update actual style nodes.
  const css=plugin.app.customCss;css.enabledSnippets.clear();
  const sync=()=>{
   document.querySelectorAll('style[data-compat-snippet]').forEach(n=>n.remove());
   css.extraStyleEls=[];
   for(const key of css.enabledSnippets){const node=document.createElement('style');node.dataset.compatSnippet=key;node.textContent=disk.get('.obsidian/snippets/'+key+'.css')||'';document.head.append(node);css.extraStyleEls.push(node);}
   plugin.builtinStyles.apply();
  };
  css.setCssEnabledStatus=async(key,on)=>{on?css.enabledSnippets.add(key):css.enabledSnippets.delete(key);sync();};css.requestLoadSnippets=sync;
  const sample=document.createElement('div');sample.id='samples';
  const content=mode=>'<div class="'+(mode==='r'?'markdown-preview-view markdown-rendered':'markdown-source-view is-live-preview cm-s-obsidian')+' compat-demo">'+[1,2,3,4,5,6].map(n=>mode==='r'?'<h'+n+' id="r'+n+'">Heading '+n+'</h'+n+'>':'<div class="cm-line HyperMD-header HyperMD-header-'+n+'"><span id="e'+n+'" class="cm-header cm-header-'+n+'">Heading '+n+'</span></div>').join('')+'<div class="callout" data-callout="note">A responsive callout</div><p>Click <img class="inline-probe" alt="inline" width="20" height="20" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'20\' height=\'20\'/%3E"> to continue</p><img alt="center" width="80" height="80"><blockquote>Quote</blockquote></div>';
  sample.innerHTML='<div id="note" class="workspace-leaf-content" data-type="markdown">'+content('r')+content('e')+'</div><div class="workspace-leaf-content" data-type="markdown"><div class="markdown-preview-view markdown-rendered"><h3 id="outside">Outside test note</h3></div></div>';document.body.append(sample);
 },initial);
 const color=(mode,value)=>({mode,value,strength:100});
 const pair=n=>page.evaluate(n=>['r','e'].map(p=>getComputedStyle(document.getElementById(p+n)).color),n);
 const toggle=async(i,on)=>{const name=names[i].replace(/\.css$/,'');await page.getByRole('button',{name:'自定义 CSS',exact:true}).click();await page.getByRole('button',{name:name+'：'+(on?'已停用，点击启用':'已启用，点击停用'),exact:true}).click();await page.waitForFunction(({key,on})=>plugin.app.customCss.enabledSnippets.has(key)===on,{key:name,on});};
 const baseline=await pair(3),outside=await page.locator('#outside').evaluate(e=>getComputedStyle(e).color);
 // Every syntax is retained byte-for-byte; edit and save each via the actual editor.
 for(const [i,name]of names.entries()){
  await page.getByRole('button',{name:'自定义 CSS',exact:true}).click();await page.getByRole('button',{name:name.replace(/\.css$/,''),exact:true}).click();
  const text=page.getByRole('textbox',{name:'CSS 源码',exact:true});assert.equal(await text.inputValue(),initial['.obsidian/snippets/'+name]);
  const edited=initial['.obsidian/snippets/'+name]+'\n/* 保存兼容检查 '+i+' */\n';await text.fill(edited);await text.press('ControlOrMeta+s');await page.waitForFunction(({name,edited})=>disk.get('.obsidian/snippets/'+name)===edited,{name,edited});
 }
 await toggle(0,true);assert.deepEqual(await pair(3),['rgb(38, 122, 103)','rgb(38, 122, 103)']);
 await page.evaluate(()=>document.body.className='theme-dark');assert.deepEqual(await pair(3),['rgb(112, 203, 177)','rgb(112, 203, 177)']);
 await page.evaluate(()=>document.body.className='theme-light');
 await page.evaluate(c=>plugin.builtin.update({controls:{h3Color:c}}),color('custom','#123456'));assert.deepEqual(await pair(3),['rgb(38, 122, 103)','rgb(38, 122, 103)']);
 await page.evaluate(c=>plugin.builtin.update({controls:{h3Color:c}}),color('default',null));assert.deepEqual(await pair(3),['rgb(38, 122, 103)','rgb(38, 122, 103)']);
 await toggle(0,false);assert.deepEqual(await pair(3),baseline);
 await toggle(1,true);await page.evaluate(c=>plugin.builtin.update({controls:{h2Color:c}}),color('custom','#123456'));assert.deepEqual(await pair(2),['rgb(179, 92, 186)','rgb(179, 92, 186)']);await toggle(1,false);assert.deepEqual(await pair(2),['rgb(18, 52, 86)','rgb(18, 52, 86)']);
 await toggle(2,true);
 const layout=[];
 for(const theme of ['theme-light','theme-dark'])for(const width of [320,390,540,768]){
  await page.evaluate(({theme,width})=>{document.body.className=theme;document.getElementById('samples').style.width=width+'px';},{theme,width});
  const result=await page.evaluate(()=>{const note=document.getElementById('note');return {width:note.clientWidth,padding:[...note.querySelectorAll('.callout')].map(e=>getComputedStyle(e).paddingTop),images:[...note.querySelectorAll('.inline-probe')].map(e=>getComputedStyle(e).display),overflow:note.scrollWidth-note.clientWidth};});
  assert.deepEqual(result.padding,Array(2).fill(result.width<=540?'10px':'18px'));assert.ok(result.images.every(v=>v!=='block'));assert.ok(result.overflow<=1,JSON.stringify(result));layout.push({theme,...result});
 }
 await toggle(2,false);
 await page.evaluate(()=>document.body.className='theme-light');await toggle(3,true);assert.deepEqual(await pair(4),['rgb(168, 117, 44)','rgb(168, 117, 44)']);await page.evaluate(c=>plugin.builtin.update({controls:{h4Color:c}}),color('custom','#123456'));assert.deepEqual(await pair(4),['rgb(168, 117, 44)','rgb(168, 117, 44)']);await toggle(3,false);
 await page.evaluate(c=>plugin.builtin.update({controls:{h3Color:c}}),color('custom','#123456'));await toggle(4,true);assert.deepEqual(await pair(3),['rgb(208, 90, 104)','rgb(208, 90, 104)']);await toggle(4,false);assert.deepEqual(await pair(3),['rgb(18, 52, 86)','rgb(18, 52, 86)']);
 // All snippets together and both stylesheet orders. Independent properties survive.
 for(let i=0;i<names.length;i++)await toggle(i,true);
 await page.evaluate(()=>document.head.append(document.querySelector('style[data-snippet-editor-builtin]')));
 assert.deepEqual(await pair(3),['rgb(208, 90, 104)','rgb(208, 90, 104)']);assert.deepEqual(await pair(2),['rgb(179, 92, 186)','rgb(179, 92, 186)']);
 await page.evaluate(()=>plugin.app.customCss.requestLoadSnippets());assert.deepEqual(await pair(3),['rgb(208, 90, 104)','rgb(208, 90, 104)']);
 await page.evaluate(()=>plugin.builtin.update({enabled:false}));assert.deepEqual(await pair(3),['rgb(208, 90, 104)','rgb(208, 90, 104)']);assert.equal(await page.locator('#outside').evaluate(e=>getComputedStyle(e).color),outside);
 await page.evaluate(()=>{document.getElementById('samples').style.width='600px';});await page.screenshot({path:path.join(artifact,'compatibility-light.png'),fullPage:true});
 await page.evaluate(()=>document.body.className='theme-dark');await page.screenshot({path:path.join(artifact,'compatibility-dark.png'),fullPage:true});
 await page.evaluate(()=>document.body.className='theme-light');
 // Unloading the manager must not remove native snippets.
 await page.evaluate(()=>plugin.onunload());assert.equal(await page.locator('style[data-snippet-editor-builtin]').count(),0);assert.equal(await page.locator('style[data-compat-snippet]').count(),5);assert.deepEqual(await pair(3),['rgb(208, 90, 104)','rgb(208, 90, 104)']);
 await page.evaluate(async()=>{for(const key of [...plugin.app.customCss.enabledSnippets])await plugin.app.customCss.setCssEnabledStatus(key,false);});assert.deepEqual(await pair(3),baseline);assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(artifact,'results.json'),JSON.stringify({passed:true,files:names,layout,checks:['source roundtrip','enable/disable','light/dark','reading/live preview','native variables vs builtin','direct rules vs variables','important override','layer priority','load order','scope isolation','unload and restore']},null,2));
 console.log('PASS: 5 snippets, source edit/save, toggles, 8 theme/width layouts, reading/live preview, cascade conflicts, load order, isolation and unload restore.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
