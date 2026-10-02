'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.join(__dirname,'..'),dir=process.env.ARTIFACT_DIR||path.join(require('node:os').tmpdir(),'snippet-editor-priority');fs.mkdirSync(dir,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});try{
 const page=await browser.newPage({viewport:{width:1100,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<html><head><style>'+fs.readFileSync(process.env.OBSIDIAN_BASE_CSS,'utf8')+'</style></head><body class="theme-dark"><div id="host" style="width:390px;height:800px"></div><div class="workspace-leaf-content" data-type="markdown"><div class="markdown-preview-view markdown-rendered compat-demo"><h1 id="heading">Heading</h1><div id="box" class="callout" data-callout="note">Box</div></div></div><div id="outside">Outside</div></body></html>');
 for(const p of ['styles.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,p),'utf8')});
 for(const p of ['tests/browser-harness.js','main.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,p),'utf8')});await page.evaluate(()=>startHarness({}));
 const install=async text=>{return page.evaluate(text=>{window.testSnippet?.remove();const s=document.createElement('style');s.textContent=text;document.head.insertBefore(s,document.querySelector('[data-snippet-editor-builtin]'));window.testSnippet=s;plugin.app.customCss.extraStyleEls=[s];plugin.builtinStyles.apply();},text);};
 const color=()=>page.locator('#heading').evaluate(e=>getComputedStyle(e).color);
 const native=await color();
 await page.evaluate(()=>plugin.builtin.update({controls:{h1Color:{mode:'custom',value:'#123456',strength:100},calloutPadding:24}}));assert.equal(await color(),'rgb(18, 52, 86)');
 await install(':where(.compat-demo){--h1-color:#aa2233}');assert.equal(await color(),'rgb(170, 34, 51)');
 // Built-in changes and injected stylesheet order cannot take control back.
 await page.evaluate(async()=>{await plugin.builtin.update({controls:{h1Color:{mode:'custom',value:'#abcdef',strength:100}}});document.head.append(document.querySelector('[data-snippet-editor-builtin]'));});assert.equal(await color(),'rgb(170, 34, 51)');
 // Host edit and file watcher changes update without a plugin reload.
 await page.evaluate(()=>testSnippet.textContent=':where(.compat-demo){--h1-color:#334455}');await page.waitForFunction(()=>getComputedStyle(document.getElementById('heading')).color==='rgb(51, 68, 85)');
 await install('@media (max-width:600px){:where(.compat-demo){--h1-color:#aa2233}}');assert.equal(await color(),'rgb(171, 205, 239)');await page.setViewportSize({width:500,height:900});assert.equal(await color(),'rgb(170, 34, 51)');await page.setViewportSize({width:1100,height:900});
 await install('@supports (display:grid){:where(.compat-demo){--h1-color:#aa2233}}');assert.equal(await color(),'rgb(170, 34, 51)');
 await install('@supports (unsupported-property:thing){:where(.compat-demo){--h1-color:#aa2233}}');assert.equal(await color(),'rgb(171, 205, 239)');
 await install('.workspace-leaf-content{container-type:inline-size;container-name:priority-test;width:400px}@container priority-test (max-width:500px){:where(.compat-demo){--h1-color:#aa2233}}');assert.equal(await color(),'rgb(170, 34, 51)');await page.locator('.workspace-leaf-content').evaluate(e=>e.style.width='700px');assert.equal(await color(),'rgb(171, 205, 239)');await page.locator('.workspace-leaf-content').evaluate(e=>e.style.removeProperty('width'));
 // Native CSS layers: normal unlayered > last declared layer; important reverses.
 const cases=[
 ['@layer a,b;@layer b{.compat-demo{--h1-color:#223344}}@layer a{.compat-demo{--h1-color:#112233}}','rgb(34, 51, 68)'],
 ['@layer a,b;@layer a{.compat-demo{--h1-color:#112233!important}}@layer b{.compat-demo{--h1-color:#223344!important}}.compat-demo{--h1-color:#334455!important}','rgb(17, 34, 51)'],
 ['@layer a{.compat-demo{--h1-color:#112233}}:where(.compat-demo){--h1-color:#223344}','rgb(34, 51, 68)'],
 ['.compat-demo{--h1-color:#112233}:where(.compat-demo){--h1-color:#223344}','rgb(17, 34, 51)'],
 ['@layer outer{ @layer first,second; @layer first{.compat-demo{--h1-color:#112233}}@layer second{.compat-demo{--h1-color:#223344}}}','rgb(34, 51, 68)'],
 ['.workspace-leaf-content { & .compat-demo { --h1-color:#112233; } }','rgb(17, 34, 51)']
 ];for(const [css,expected]of cases){await install(css);assert.equal(await color(),expected,css);}
 // Layer declaration order survives removing/reloading sheets, just as in CSS.
 await install('@layer a,b;@layer a{.compat-demo{--h1-color:#112233}}@layer b{.compat-demo{--h1-color:#223344}}');assert.equal(await color(),'rgb(34, 51, 68)');
 await install('@layer b,a;@layer b{.compat-demo{--h1-color:#223344}}@layer a{.compat-demo{--h1-color:#112233}}');assert.equal(await color(),'rgb(34, 51, 68)');
 // Rollback directives keep the whole property's native cascade, not stale copies.
 await install(':where(.compat-demo){--h1-color:#aa2233}:where(.compat-demo){--h1-color:revert-layer}');assert.equal(await color(),'rgb(171, 205, 239)');
 // Shorthand-vs-longhand, non-overlap outside the active built-in scope.
 await install(':where(.compat-demo){--callout-padding:7px}#outside{padding:11px}');assert.equal(await page.locator('#box').evaluate(e=>getComputedStyle(e).padding),'7px');assert.equal(await page.locator('#outside').evaluate(e=>getComputedStyle(e).padding),'11px');
 // Explicit built-in important is still below normal snippets, with pseudo-elements.
 await page.evaluate(()=>{plugin.builtinStyles.priority.detach(document);window.rawBuiltin=document.createElement('style');rawBuiltin.textContent='#outside { color:red!important; padding-block:24px } #outside::before { content:"probe"; color:red!important }';document.head.append(rawBuiltin);plugin.builtinStyles.priority.attach(document,rawBuiltin);});
 await install(':where(#outside){color:blue;padding:7px}:where(#outside)::before{color:green}');assert.equal(await page.locator('#outside').evaluate(e=>getComputedStyle(e).color),'rgb(0, 0, 255)');assert.equal(await page.locator('#outside').evaluate(e=>getComputedStyle(e).padding),'7px');assert.equal(await page.locator('#outside').evaluate(e=>getComputedStyle(e,'::before').color),'rgb(0, 128, 0)');
 await page.evaluate(()=>{plugin.builtinStyles.priority.detach(document);rawBuiltin.remove();plugin.builtinStyles.priority.attach(document,document.querySelector('[data-snippet-editor-builtin]'));});
 // Disabled snippets must not retain promoted declarations; no source mutation.
 const final=':where(.compat-demo){--h1-color:#aa2233}';await install(final);assert.equal(await color(),'rgb(170, 34, 51)');assert.equal(await page.evaluate(()=>testSnippet.textContent),final);
 const revision=await page.evaluate(()=>plugin.builtinStyles.priority.entries.get(document).revision);
 await page.evaluate(async()=>{for(let i=0;i<20;i++)await plugin.builtin.update({controls:{h1Color:{mode:'custom',value:i%2?'#abcdef':'#123456',strength:100}}});});assert.equal(await page.evaluate(()=>plugin.builtinStyles.priority.entries.get(document).revision),revision);
 await page.evaluate(()=>{testSnippet.remove();plugin.app.customCss.extraStyleEls=[];plugin.builtinStyles.apply();});assert.equal(await color(),'rgb(171, 205, 239)');
 await page.evaluate(()=>plugin.builtin.update({controls:{h1Color:{mode:'default',value:null,strength:100}}}));assert.equal(await color(),native);
 // Fresh popout, disabled built-in master, and cleanup.
 await install(final);await page.evaluate(async()=>{await plugin.builtin.update({controls:{h1Color:{mode:'custom',value:'#123456',strength:100}}});const frame=document.createElement('iframe');frame.id='pop';document.body.append(frame);const d=frame.contentDocument;d.body.innerHTML='<div class="workspace-leaf-content" data-type="markdown"><div class="markdown-preview-view compat-demo"><h1>Popout</h1></div></div>';d.head.append(testSnippet.cloneNode(true));plugin.builtinStyles.attach(d);});
 assert.ok((await page.evaluate(()=>document.getElementById('pop').contentDocument.querySelector('[data-snippet-editor-priority]').textContent)).includes('#aa2233'));
 await page.evaluate(()=>plugin.builtin.update({enabled:false}));assert.equal(await page.locator('[data-snippet-editor-priority]').textContent(),'');
 await page.evaluate(()=>plugin.onunload());assert.equal(await page.locator('[data-snippet-editor-priority]').count(),0);assert.equal(await page.evaluate(()=>document.getElementById('pop').contentDocument.querySelector('[data-snippet-editor-priority]')),null);assert.equal(await page.evaluate(()=>testSnippet.textContent),final);assert.deepEqual(errors,[]);
 console.log('PASS: custom > builtin > native, specificity/order, conditional rules, layer importance/order, nesting, shorthand, pseudo elements, live edits, disable/default, popout and unload.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
