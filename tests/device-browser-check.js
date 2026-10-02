'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {defaults,normalize}=require('../src/builtin');
const {makePreset}=require('../src/presets');
const root=path.join(__dirname,'..'),artifacts=process.env.ARTIFACT_DIR||path.join(require('node:os').tmpdir(),'snippet-editor-devices');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
 try{
  const cases=[['mac',390,{isDesktopApp:true,isMacOS:true}],['win',390,{isDesktopApp:true,isWin:true}],['linux',390,{isDesktopApp:true,isLinux:true}],['ios',390,{isMobileApp:true,isIosApp:true}],['ipad',768,{isMobileApp:true,isIosApp:true}],['android',320,{isMobileApp:true,isAndroidApp:true}],['mac-no-api',390,{isDesktopApp:true,isMacOS:true}]];
  for(const [name,width,platform]of cases){
   const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.setContent('<style>'+fs.readFileSync(process.env.OBSIDIAN_BASE_CSS,'utf8')+'</style><style>body{display:block;margin:0}#host{height:100vh;width:'+width+'px}.modal{position:fixed;inset:20px;padding:20px;overflow:auto;z-index:30}</style><body class="theme-dark'+(platform.isMobileApp?' is-mobile':'')+'"><div id="host"></div></body>');
   await page.evaluate(({platform,name})=>{window.testPlatform=platform;window.nativeCalls=[];window.nativeFull=false;window.nativeEvents=new Map();if(name!=='mac-no-api')window.electronWindow={setVibrancy:v=>nativeCalls.push(['material',v]),setBackgroundColor:v=>nativeCalls.push(['background',v]),getBackgroundColor:()=>'#123456',isFullScreen:()=>nativeFull,isDestroyed:()=>false,on:(event,fn)=>nativeEvents.set(event,fn),removeListener:event=>nativeEvents.delete(event)};},{platform,name});
   await page.addStyleTag({content:fs.readFileSync(path.join(root,'styles.css'),'utf8')});
   for(const f of ['tests/browser-harness.js','main.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,f),'utf8')});
   const config=normalize(defaults());config.modules.translucency=true;config.modules.hideStatus=true;config.controls.tabWidth=260;
   await page.evaluate(config=>startHarness({}, {builtin:config}),config);
   await page.getByRole('button',{name:'全部展开',exact:true}).click();
   assert.equal(await page.getByRole('combobox',{name:'窗口材质',exact:true}).count(),platform.isMacOS?1:0,name);
   assert.equal(await page.getByRole('switch',{name:'显示状态栏',exact:true}).count(),platform.isDesktopApp?1:0,name);
   assert.equal(await page.locator('[data-setting-id="tabWidth"]').count(),platform.isDesktopApp?1:0,name);
   for(const id of ['h1Color','treeSize','narrowMargin'])assert.equal(await page.locator('[data-setting-id="'+id+'"]').count(),1,name+' '+id);
   const getCss=()=>page.locator('[data-snippet-editor-builtin]').textContent();
   assert.equal((await getCss()).includes('--yn-window-scrim'),name==='mac');
   assert.equal((await getCss()).includes('--tab-max-width: 260px'),!!platform.isDesktopApp);
   const search=page.getByRole('searchbox',{name:'查找外观设置'});await search.fill('窗口材质');
   if(!platform.isMacOS)assert.equal(await page.locator('.se-setting-group:not([hidden])').count(),0);
   await search.fill('');await page.getByRole('button',{name:'全部折叠',exact:true}).click();
   await page.screenshot({path:path.join(artifacts,name+'-overview.png')});
   await search.fill('文件树');assert.ok(await page.locator('.se-appearance').evaluate(e=>e.scrollWidth-e.clientWidth)<=1,name+' overflow');
   if(platform.isMobileApp)assert.equal(await page.getByRole('group',{name:'文件树',exact:true}).count(),1);
   await search.fill('');
   const next=structuredClone(config);next.controls.h3Size=2.1;next.controls.tabWidth=350;next.glassMaterial='sidebar';next.values['--yn-深色窗口不透明度']=80;
   await page.getByRole('button',{name:'导入',exact:true}).click();await page.locator('.se-preset-code>summary').click();
   await page.getByRole('textbox',{name:'粘贴外观配置',exact:true}).fill(JSON.stringify(makePreset(next,'跨平台配置')));
   if(platform.isMacOS)assert.match(await page.locator('.se-preset-diff').textContent(),/深色背景透明度：55% → 20%/);
   const skipped=await page.locator('.se-preset-skipped').textContent();if(!platform.isMacOS)assert.match(skipped,/将跳过并保留原值/);else assert.equal(skipped,'');
   await page.getByRole('button',{name:'应用配置',exact:true}).click();await page.waitForFunction(()=>plugin.builtin.config.controls.h3Size===2.1);
   const after=await page.evaluate(()=>plugin.builtin.config);assert.equal(after.controls.tabWidth,platform.isDesktopApp?350:260);assert.equal(after.glassMaterial,platform.isMacOS?'sidebar':'glass');assert.equal(after.values['--yn-深色窗口不透明度'],platform.isMacOS?80:45);
   await page.getByRole('button',{name:'撤销上次导入',exact:true}).click();await page.getByRole('button',{name:'撤销导入',exact:true}).click();await page.waitForFunction(()=>plugin.builtin.config.controls.h3Size===1.22);
   assert.deepEqual(await page.evaluate(()=>plugin.builtin.config),config);assert.equal(await page.evaluate(()=>plugin.data.appearanceUndo),undefined);assert.equal(await page.getByRole('button',{name:'撤销上次导入',exact:true}).isVisible(),false);
   if(name==='mac'){
    await search.fill('窗口材质');const select=page.getByRole('combobox',{name:'窗口材质',exact:true});assert.equal(await select.isEnabled(),true);
    await page.evaluate(()=>{nativeFull=true;nativeEvents.get('enter-full-screen')();});assert.equal(await select.isDisabled(),true);assert.match(await page.locator('.se-appearance').textContent(),/退出全屏后自动恢复/);
    await page.evaluate(()=>{nativeFull=false;nativeEvents.get('leave-full-screen')();});assert.equal(await select.isEnabled(),true);
    const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});await page.waitForFunction(()=>document.querySelector('[aria-label="窗口材质"]').disabled);await cdp.send('Emulation.setEmulatedMedia',{features:[]});await page.waitForFunction(()=>!document.querySelector('[aria-label="窗口材质"]').disabled);
    await page.evaluate(()=>{plugin.app.isMobile=true;document.body.classList.add('is-mobile');});await page.waitForFunction(()=>!document.querySelector('[data-setting-id="tabWidth"]'));
    assert.ok(!(await getCss()).includes('--yn-window-scrim'));assert.ok(!(await getCss()).includes('--tab-max-width'));
    assert.equal(await page.evaluate(()=>plugin.builtin.config.controls.tabWidth),260);
    await page.evaluate(()=>{plugin.app.isMobile=false;document.body.classList.remove('is-mobile');});await page.waitForFunction(()=>!!document.querySelector('[data-setting-id="tabWidth"]'));assert.ok((await getCss()).includes('--tab-max-width: 260px'));
    await search.fill('窗口材质');
    await page.evaluate(()=>{electronWindow.setVibrancy=()=>{throw new Error('native unavailable');};plugin.nativeAppearance.apply(true);});
    await page.waitForFunction(()=>plugin.nativeAppearance.status(document)==='unavailable');assert.ok(!(await getCss()).includes('--yn-window-scrim'));assert.equal(await page.getByRole('combobox',{name:'窗口材质',exact:true}).isDisabled(),true);
   }else if(name==='mac-no-api'){
    await search.fill('窗口材质');assert.equal(await page.getByRole('combobox',{name:'窗口材质',exact:true}).isDisabled(),true);assert.match(await page.locator('.se-appearance').textContent(),/当前窗口不支持/);
   }else assert.deepEqual(await page.evaluate(()=>nativeCalls),[],name+' must not call native window APIs');
   await page.evaluate(()=>plugin.onunload());assert.equal(await page.locator('[data-snippet-editor-builtin]').count(),0);assert.deepEqual(errors,[],name);await page.close();
  }
  console.log('PASS: macOS/Windows/Linux/iOS/iPad/Android UI and runtime gating; disabled API/fullscreen/reduced states; cross-platform import/undo; live mobile layout switching; saved desktop values preserved; unload.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
