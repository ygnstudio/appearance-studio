'use strict';
// Run with NODE_PATH pointing at a local Playwright install. No network or vault IO.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const artifacts=process.env.ARTIFACT_DIR||path.join(require('node:os').tmpdir(),'snippet-editor-check');fs.mkdirSync(artifacts,{recursive:true});
const basePath=process.env.OBSIDIAN_BASE_CSS;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width:1000,height:850}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=basePath&&fs.existsSync(basePath)?fs.readFileSync(basePath,'utf8'):'';
 await page.setContent('<html><head><style>'+base+'</style><style>body{margin:0;display:block;}#host{height:100vh;width:100%;}.modal{position:fixed;inset:40px;background:var(--background-primary);padding:24px;overflow:auto;z-index:20;}</style></head><body class="theme-light"><div id="host"></div></body></html>');
 await page.addStyleTag({content:fs.readFileSync(path.join(root,'styles.css'),'utf8')});
 // This suite exercises the macOS material sliders; other platforms have a dedicated matrix.
 await page.evaluate(()=>{window.testPlatform={isDesktopApp:true,isMacOS:true};window.electronWindow={setVibrancy(){},setBackgroundColor(){},getBackgroundColor:()=>'#ffffff',isFullScreen:()=>false,isDestroyed:()=>false,on(){},removeListener(){}};});
 await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'browser-harness.js'),'utf8')});
 await page.addScriptTag({content:fs.readFileSync(path.join(root,'main.js'),'utf8')});
 // Fresh install leaves every user snippet intact, including historical filenames.
 const initial={'.obsidian/snippets/99-外观设置.css':'body { --user-owned: 1; }','.obsidian/snippets/custom.css':'body { --custom: 1; }'};
 await page.evaluate(async initial=>startHarness(initial),initial);
 assert.deepEqual(await page.evaluate(()=>Object.fromEntries(disk)),initial);
 assert.deepEqual(await page.evaluate(()=>[...plugin.app.customCss.enabledSnippets].sort()),['99-外观设置','custom']);
 assert.equal(await page.evaluate(()=>plugin.data.builtinMigration),undefined);
 assert.equal(await page.locator('style[data-snippet-editor-builtin]').textContent(),'');
 // Explicitly enable the macOS material before exercising its dependent controls.
 await page.evaluate(async()=>{await plugin.builtin.update({modules:{translucency:true},glassMaterial:'glass'});await view.render();});
 await page.getByRole('button',{name:'全部展开',exact:true}).click();
 assert.ok(await page.getByRole('combobox').count()>20);
 assert.equal(await page.getByRole('spinbutton').count(),2);
 assert.equal(await page.locator('input:invalid').count(),0);
 assert.equal(await page.getByRole('combobox',{name:'标题颜色来源',exact:true}).count(),0);
 assert.equal(await page.getByRole('group',{name:'进阶细节',exact:true}).count(),0);
 assert.ok(!(await page.locator('.se-appearance').textContent()).includes('跟随当前外观'));
 await page.evaluate(()=>plugin.builtin.update({controls:{bodyLineHeight:1.8}}));
 assert.match(await page.locator('style[data-snippet-editor-builtin]').textContent(),/--line-height-normal: 1.8;/);
 await page.evaluate(()=>{const host=document.createElement('div');host.id='heading-fixture';host.className='workspace-leaf-content';host.dataset.type='markdown';host.innerHTML='<div class="markdown-rendered markdown-preview-view" style="font-size:16px">'+[1,2,3,4,5,6].map(n=>'<h'+n+' id="r'+n+'">Heading</h'+n+'>').join('')+'</div><div class="markdown-source-view is-live-preview cm-s-obsidian" style="font-size:16px">'+[1,2,3,4,5,6].map(n=>'<div class="cm-line HyperMD-header HyperMD-header-'+n+'"><span class="cm-header cm-header-'+n+'" id="e'+n+'">Heading</span></div>').join('')+'</div>';document.body.append(host);});
 const native=await page.evaluate(()=>{const style=document.querySelector('style[data-snippet-editor-builtin]');style.sheet.disabled=true;const result=getComputedStyle(document.getElementById('r3')).color;style.sheet.disabled=false;return result;});
 const palette=['#112233','#223344','#334455','#445566','#556677','#667788'];
 for(let n=1;n<=6;n++){
  await page.getByRole('combobox',{name:n+' 级标题颜色来源',exact:true}).selectOption('custom');
  await page.getByRole('textbox',{name:n+' 级标题颜色色号',exact:true}).fill(palette[n-1]);
  await page.getByRole('spinbutton',{name:n+' 级标题颜色浓度',exact:true}).fill('100');
  await page.getByRole('searchbox',{name:'查找外观设置'}).focus();
  await page.waitForFunction(({n,color})=>persisted.builtin.controls['h'+n+'Color'].value===color&&persisted.builtin.controls['h'+n+'Color'].strength===100,{n,color:palette[n-1]});
  const colors=await page.evaluate(n=>['r','e'].map(prefix=>getComputedStyle(document.getElementById(prefix+n)).color),n);
  assert.deepEqual(colors,Array(2).fill('rgb('+[n*17,n*17+17,n*17+34].join(', ')+')'));
 }
 await page.getByRole('combobox',{name:'3 级标题颜色来源',exact:true}).selectOption('default');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('r3')).color),native);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('e3')).color),native);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('r4')).color),'rgb(68, 85, 102)');
 await page.getByRole('combobox',{name:'3 级标题颜色来源',exact:true}).selectOption('custom');
 assert.equal(await page.getByRole('textbox',{name:'3 级标题颜色色号',exact:true}).inputValue(),'#334455');
 await page.getByRole('textbox',{name:'3 级标题颜色色号',exact:true}).fill('#xyz');
 await page.getByRole('searchbox',{name:'查找外观设置'}).focus();assert.equal(await page.evaluate(()=>persisted.builtin.controls.h3Color.value),'#334455');
 await page.getByRole('textbox',{name:'3 级标题颜色色号',exact:true}).fill('#345');await page.getByRole('searchbox',{name:'查找外观设置'}).focus();
 await page.waitForFunction(()=>persisted.builtin.controls.h3Color.value==='#334455');
 await page.evaluate(()=>document.getElementById('heading-fixture').remove());
 // UI transparency is the inverse of stored opacity, for both color schemes.
 for(const [label,key]of [['深色背景透明度','--yn-深色窗口不透明度'],['浅色背景透明度','--yn-浅色窗口不透明度']]){
  const number=page.getByRole('spinbutton',{name:label,exact:true}),range=page.getByRole('slider',{name:label+'滑块',exact:true});
  const opacity=await page.evaluate(key=>plugin.builtin.config.values[key],key);assert.equal(Number(await number.inputValue()),100-opacity);
  for(const transparency of [0,37,100]){
   await number.fill(String(transparency));assert.equal(Number(await range.inputValue()),transparency);
   assert.ok((await page.locator('style[data-snippet-editor-builtin]').textContent()).includes(key+': '+(100-transparency)+'%;'));
   await page.getByRole('searchbox',{name:'查找外观设置'}).focus();await page.waitForFunction(({key,transparency})=>persisted.builtin.values[key]===100-transparency,{key,transparency});
  }
  await page.evaluate(()=>view.render());await page.getByRole('button',{name:'全部展开',exact:true}).click();assert.equal(await page.getByRole('spinbutton',{name:label,exact:true}).inputValue(),'100');
 }
 const slider=page.getByRole('slider',{name:'深色背景透明度滑块',exact:true});await slider.evaluate(e=>{e.value='20';e.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.match(await page.locator('style[data-snippet-editor-builtin]').textContent(),/--yn-深色窗口不透明度: 80%;/);
 await slider.evaluate(e=>e.dispatchEvent(new Event('change',{bubbles:true})));await page.waitForFunction(()=>persisted.builtin.values['--yn-深色窗口不透明度']===80);
 // Check actual container overflow, not only viewport breakpoints.
 const layout=[];
 for(const theme of ['theme-light','theme-dark'])for(const width of [260,320,390,540,768,1440]){
  await page.setViewportSize({width:Math.max(width,1000),height:850});
  await page.evaluate(({theme,width})=>{document.body.className=theme;document.getElementById('host').style.width=width+'px';},{theme,width});
  const result=await page.evaluate(()=>{const root=document.querySelector('.se-root'),form=document.querySelector('.se-appearance');return {root:root.scrollWidth-root.clientWidth,form:form.scrollWidth-form.clientWidth,visible:form.clientHeight};});
  assert.ok(result.root<=1,JSON.stringify({theme,width,result}));assert.ok(result.form<=1,JSON.stringify({theme,width,result}));assert.ok(result.visible>100);assert.ok(await page.locator('.se-range').first().evaluate(e=>e.getBoundingClientRect().width/e.parentElement.getBoundingClientRect().width)>.9);
  const geometry=()=>page.evaluate(()=>{
   const box=s=>{const e=document.querySelector(s),b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};};
   const button=document.querySelector('.se-nav-switcher button'),style=getComputedStyle(button);
   return {nav:box('.se-nav-switcher'),header:box('.se-header'),search:box('.se-appearance-search,.se-search'),font:style.fontSize,radius:style.borderRadius};
  });
  const builtin=await geometry();
  await page.getByRole('button',{name:'自定义 CSS',exact:true}).click();
  const custom=await geometry();
  // Navigation stays fixed; the appearance header is shorter now that note presets are scoped below.
  for(const [key,axes]of [['nav',['x','y','width','height']],['header',['x','width']],['search',['x','width','height']]])for(const axis of axes)assert.ok(Math.abs(builtin[key][axis]-custom[key][axis])<1,JSON.stringify({theme,width,key,axis,builtin,custom}));
  assert.equal(builtin.font,custom.font);assert.equal(builtin.radius,custom.radius);
  await page.getByRole('button',{name:'custom',exact:true}).click();
  const editorNav=await page.locator('.se-nav-switcher').boundingBox();
  for(const axis of ['x','y','width','height'])assert.ok(Math.abs(builtin.nav[axis]-editorNav[axis])<1);
  assert.ok(await page.getByRole('textbox',{name:'CSS 源码',exact:true}).evaluate(e=>e.clientHeight)>100);
  await page.getByRole('button',{name:'外观设置',exact:true}).click();
  layout.push({theme,width,...result,navigationStable:true});
 }
 await page.evaluate(()=>{document.body.className='theme-light';document.getElementById('host').style.width='390px';});
 await page.locator('.se-appearance').evaluate(e=>e.scrollTop=0);
 await page.screenshot({path:path.join(artifacts,'appearance-390.png'),fullPage:true});
 await page.getByRole('button',{name:'自定义 CSS',exact:true}).click();
 assert.equal(await page.locator('.se-card').count(),2);
 await page.getByRole('button',{name:'custom',exact:true}).click();
 const ta=page.getByRole('textbox',{name:'CSS 源码',exact:true});
 await ta.fill('body {\n  --yn-正文行高: 1.7;\n}');
 await ta.press('ControlOrMeta+s');
 assert.match(await page.evaluate(()=>disk.get('.obsidian/snippets/custom.css')),/1.7/);
 await page.evaluate(()=>disk.set('.obsidian/snippets/custom.css','body { color: blue; }'));
 await ta.fill('body { color: green; }');await page.evaluate(()=>plugin.refresh());
 assert.equal(await page.getByRole('button',{name:'保存',exact:true}).isDisabled(),true);
 assert.equal(await ta.inputValue(),'body { color: green; }');
 await page.getByRole('button',{name:'另存副本',exact:true}).click();await page.getByRole('textbox',{name:'片段名称',exact:true}).fill('恢复副本');await page.getByRole('button',{name:'创建副本',exact:true}).click();
 await page.getByRole('button',{name:'返回',exact:true}).click();
 await page.getByRole('searchbox',{name:'搜索片段',exact:true}).fill('恢复副本');
 assert.equal(await page.locator('.se-card').count(),1);
 await page.getByRole('button',{name:'重命名',exact:true}).click();await page.getByRole('textbox',{name:'片段名称',exact:true}).fill('重命名副本');await page.getByRole('button',{name:'重命名',exact:true}).last().click();
 await page.getByRole('searchbox',{name:'搜索片段',exact:true}).fill('重命名副本');
 await page.getByRole('button',{name:/重命名副本：已停用/}).click();
 assert.equal(await page.evaluate(()=>plugin.store.enabled('.obsidian/snippets/重命名副本.css')),true);
 await page.getByRole('button',{name:'移入回收站',exact:true}).click();await page.getByRole('button',{name:'移入回收站',exact:true}).last().click();
 assert.equal(await page.evaluate(()=>disk.has('.obsidian/snippets/重命名副本.css')),false);
 await page.getByRole('searchbox',{name:'搜索片段',exact:true}).fill('');
 await page.screenshot({path:path.join(artifacts,'list-390.png'),fullPage:true});
 await page.getByRole('button',{name:'外观设置',exact:true}).click();
 await page.getByRole('searchbox',{name:'查找外观设置',exact:true}).fill('圆角');
 assert.ok(await page.locator('.se-object-control:visible').count()>=3);
 await page.evaluate(()=>plugin.builtin.update({enabled:false}));
 assert.equal(await page.locator('style[data-snippet-editor-builtin]').textContent(),'');
 await page.evaluate(()=>plugin.builtin.update({enabled:true}));
 assert.ok((await page.locator('style[data-snippet-editor-builtin]').textContent()).length>1000);

 // Capture the complete dependent hierarchy in a narrow sidebar.
 await page.getByRole('searchbox',{name:'查找外观设置',exact:true}).fill('3 级标题');
 await page.evaluate(()=>{document.body.className='theme-dark';document.getElementById('host').style.width='390px';});
 await page.locator('.se-appearance').evaluate(e=>e.scrollTop=0);
 await page.screenshot({path:path.join(artifacts,'hierarchy-notes.png'),fullPage:true});
 await page.getByRole('searchbox',{name:'查找外观设置',exact:true}).fill('文件树与标签页');
 await page.locator('.se-appearance').evaluate(e=>e.scrollTop=0);
 await page.screenshot({path:path.join(artifacts,'hierarchy-navigation.png'),fullPage:true});
 // Paired screenshots share the same viewport, column and navigation coordinates.
 await page.getByRole('searchbox',{name:'查找外观设置',exact:true}).fill('');
 await page.evaluate(()=>{document.body.className='theme-dark';document.getElementById('host').style.width='1200px';});
 await page.locator('.se-appearance').evaluate(e=>e.scrollTop=0);
 await page.screenshot({path:path.join(artifacts,'unified-appearance.png'),fullPage:true});
 await page.getByRole('button',{name:'自定义 CSS',exact:true}).click();
 await page.screenshot({path:path.join(artifacts,'unified-custom.png'),fullPage:true});
 await page.getByRole('searchbox',{name:'搜索片段',exact:true}).fill('no-match');
 await page.screenshot({path:path.join(artifacts,'unified-empty.png'),fullPage:true});
 await page.evaluate(()=>plugin.onunload());
 assert.equal(await page.locator('style[data-snippet-editor-builtin]').count(),0);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({layout,checks:'fresh install preserves snippets and enabled states; built-in save/reset/search; main toggle; unload cleanup; source save; conflict; copy; search; rename; toggle; trash',pageErrors:errors,notices:await page.evaluate(()=>notices)},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
