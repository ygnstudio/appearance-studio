'use strict';
const {WINDOW_FIELDS,inversePercent}=require('./window-fields');
const {el,button,ask,report,AccentModal}=require('./ui');
const {GROUPS,CONTROLS,defaultColor}=require('./control-model');
const {renderControl,syncControls}=require('./control-view');
const {PresetModal,undoImport}=require('./preset-view');
const {supports}=require('./capabilities');
const {LEGACY_FILES}=require('./builtin');
function renderBuiltin(view,c){
 const plugin=view.plugin,manager=plugin.builtin,panel=plugin.data.appearancePanel||{},caps=plugin.capabilities(c.ownerDocument);
 view.capabilityKey=caps.layoutKey;view.builtinMaterial=null;view.builtinGlassFields=null;view.builtinNativeStatus=null;
 const head=el(c,'div','se-header se-appearance-header');el(head,'h2','','外观');
 if(!manager.config){el(c,'p','se-warning',manager.error||'外观尚未初始化');button(c,'重试',async()=>{await manager.initialize();await view.render();});return;}
 const actions=el(head,'div','se-actions');button(actions,'导入',()=>new PresetModal(plugin,'import').open());button(actions,'导出',()=>new PresetModal(plugin,'export').open());
 const tools=el(c,'div','se-panel-tools');
 c.dataset.density=panel.density==='comfortable'?'comfortable':'compact';
 const disclosures=()=>[...form.querySelectorAll('details')];button(tools,'全部展开',()=>{for(const d of disclosures())d.open=true;});button(tools,'全部折叠',()=>{for(const d of disclosures())d.open=false;});view.undoImportButton=button(tools,'撤销上次导入',()=>ask(view.app,{title:'撤销上次导入',description:'恢复导入前的外观配置；导入后手动调整的参数也会被替换。',label:'撤销导入',action:()=>undoImport(plugin,c.ownerDocument)}));
 const search=el(c,'input','se-appearance-search');search.type='search';search.placeholder='搜索对象或设置，如：三级标题、代码圆角';search.setAttribute('aria-label','查找外观设置');view.builtinSearch=search;
 const form=el(c,'div','se-appearance');view.builtinLegacy=el(form,'p','se-warning');const sections=[],cards=[];view.objectControls=new Map();view.builtinControls=new Map();view.builtinRanges=new Map();view.builtinModuleButtons=new Map();view.panelGroups=[];
 const disclosure=(parent,title,key,cls='se-setting-group')=>{const node=el(parent,'details',cls);node.setAttribute('role','group');node.setAttribute('aria-label',title);const summary=el(node,'summary',cls==='se-setting-group'?'se-group-summary':'se-object-summary');el(summary,'span','se-group-title',title);node.open=panel.groups?.[key]??(title==='标题');node.addEventListener('toggle',()=>{if(search.value.trim())return;plugin.data.appearancePanel={...plugin.data.appearancePanel,groups:{...plugin.data.appearancePanel?.groups,[key]:node.open}};plugin.persist().catch(report);});return node;};
 const toggle=(parent,label,id,inverse=false,scope='modules')=>{const row=el(parent,'label','se-inline-toggle');el(row,'span','',label);const holder=el(row,'span','se-switch'),input=el(holder,'input');input.type='checkbox';input.setAttribute('role','switch');input.setAttribute('aria-label',label);el(holder,'span','se-switch-track').setAttribute('aria-hidden','true');input.addEventListener('change',async()=>{input.disabled=true;try{const value=inverse?!input.checked:input.checked;await manager.update(scope?{[scope]:{[id]:value}}:{[id]:value});}catch(e){report(e);}finally{input.disabled=false;syncBuiltin(view);}});view.builtinModuleButtons.set(id,{input,inverse,scope});return row;};
 const special=(card,row,text)=>sections.push({card,rows:[{row,text}],container:row,parentText:card.getAttribute('aria-label')});
 for(const group of GROUPS){
  const displayGroup=group==='文件树与标签页'&&!caps.desktopTabs?'文件树':group==='手机与窄栏'?'小屏与窄栏':group;
  const card=disclosure(form,displayGroup,'对象/'+group);view.panelGroups.push(card);cards.push(card);
  if(group==='窗口与界面'){
   const accent=el(card,'div','se-inline-toggle');el(accent,'span','','强调色');button(accent,'选择颜色',()=>new AccentModal(plugin).open());special(card,accent,'强调色 颜色');
   if(caps.windowMaterial){
   const material=el(card,'label','se-inline-toggle');el(material,'span','','窗口材质');const select=el(material,'select');select.setAttribute('aria-label','窗口材质');for(const [value,label]of [['off','实色'],['glass','玻璃'],['sidebar','磨砂'],['under-window','通透']]){const o=el(select,'option','',label);o.value=value;}view.builtinMaterial=select;select.addEventListener('change',async()=>{try{await manager.update({modules:{translucency:select.value!=='off'},...(select.value!=='off'?{glassMaterial:select.value}:{})});}catch(e){report(e);}finally{syncBuiltin(view);}});special(card,material,'窗口材质 玻璃 半透明 模糊');
   const glass=el(card,'fieldset','se-setting-children');glass.setAttribute('aria-label','窗口材质参数');view.builtinGlassFields=glass;
   for(const {key,label}of WINDOW_FIELDS){const row=el(glass,'div','se-setting-row'),labelEl=el(row,'label','se-setting-label');el(labelEl,'span','',label);const valueEl=el(labelEl,'span','se-window-value');const number=el(valueEl,'input');number.type='number';Object.assign(number,{min:0,max:100,step:1});number.setAttribute('aria-label',label);el(valueEl,'span','se-unit','%');const range=el(row,'input','se-range');range.type='range';Object.assign(range,{min:0,max:100,step:1});range.setAttribute('aria-label',label+'滑块');view.builtinControls.set(key,number);view.builtinRanges.set(key,range);
    const commit=async()=>{if(!number.value.trim()||!number.checkValidity()){number.reportValidity();plugin.builtinStyles.clearPreview(key);return;}try{await manager.update({values:{[key]:inversePercent(number.valueAsNumber)}});}catch(e){report(e);}finally{plugin.builtinStyles.clearPreview(key);}};number.addEventListener('input',()=>{if(number.value.trim()&&number.checkValidity()){range.value=number.value;plugin.builtinStyles.preview(key,inversePercent(number.valueAsNumber));}else plugin.builtinStyles.clearPreview(key);});number.addEventListener('change',commit);range.addEventListener('input',()=>{number.value=range.value;plugin.builtinStyles.preview(key,inversePercent(Number(range.value)));});range.addEventListener('change',commit);special(card,row,'窗口材质 '+label+' 透明度');
   }
   el(glass,'p','se-muted','数值越大，背景越透明；0% 为实色。只改变背景，文字保持清晰。');view.builtinNativeStatus=el(glass,'p','se-muted');special(card,glass,'窗口材质 深色背景透明度 浅色背景透明度 透明度 模糊');
   }
   if(caps.statusBar){const status=toggle(card,'显示状态栏','hideStatus',true);special(card,status,'状态栏 显示 隐藏');}
  }
  if(group==='正文与页面'){const presets=el(card,'div','se-actions se-note-presets');for(const [label,height,gap]of [['紧凑',1.5,.6],['舒展',1.8,1]])button(presets,label,()=>manager.update({controls:{bodyLineHeight:height,paragraphGap:gap}}));button(presets,'正文跟随 Obsidian',()=>manager.update({controls:{bodyLineHeight:null,paragraphGap:null,bodySize:null,noteMargin:null,noteWidth:null}}));special(card,presets,'正文 快速预设 紧凑 舒展 默认');}
  if(group==='标题'){const explanation=el(card,'p','se-muted','每级标题可独立设置。“跟随 Obsidian”会撤销本插件对此项的调整；自定义 CSS 仍可生效。');special(card,explanation,'标题 颜色 默认 强调色');}
  if(group==='文件树与标签页'){const guide=toggle(card,'显示文件夹层级线','showFileTreeGuides',false,null);special(card,guide,'文件夹 层级线 缩进线');}
  const fields=CONTROLS.filter(f=>f.group===group&&supports(caps,f.capability)),subs=group==='标题'?['文档标题','1 级标题','2 级标题','3 级标题','4 级标题','5 级标题','6 级标题']:[''];
  for(const sub of subs){const target=sub?disclosure(card,sub,group+'/'+sub,'se-object-subgroup'):el(card,'section','se-object-section');const rows=[];const local=fields.filter(f=>(f.sub||'')===sub);if(sub)local.sort((a,b)=>{const rank=f=>['Color','Size','Weight','LineHeight','Before','After'].findIndex(s=>f.id.endsWith(s));return rank(a)-rank(b);});
   for(const f of local){const row=renderControl(view,target,f);rows.push({row,text:displayGroup+' '+sub+' '+f.label+' '+(sub?sub.replace(/[1-6]/g,n=>'一二三四五六'[Number(n)-1]).replace(' ',''):'')});}
   if(sub){const reset=button(target,'本组跟随 Obsidian',()=>ask(view.app,{title:'恢复'+sub+'默认值',description:'清除本组自定义值，重新跟随 Obsidian。已启用的 CSS 仍可生效。',label:'恢复默认',action:()=>manager.update({controls:Object.fromEntries(local.map(f=>[f.id,f.type==='color'?defaultColor():null]))})}),'se-reset');reset.setAttribute('aria-label','恢复'+sub+'默认值');}
   if(local.length)sections.push({card,container:target,rows,parentText:displayGroup+' '+sub});
  }
 }
 let savedOpen=null;search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();if(q&&!savedOpen)savedOpen=new Map(disclosures().map(d=>[d,d.open]));for(const s of sections){const match=s.parentText.toLowerCase().includes(q);for(const r of s.rows)r.row.hidden=!match&&!r.text.toLowerCase().includes(q);s.container.hidden=s.rows.every(r=>r.row.hidden);}for(const card of cards)card.hidden=sections.filter(s=>s.card===card).every(s=>s.container.hidden);if(q){for(const d of disclosures())d.open=true;}else if(savedOpen){for(const [d,open]of savedOpen)d.open=open;savedOpen=null;}});
 view.builtinStatus=el(c,'div','se-status');view.builtinStatus.setAttribute('role','status');syncBuiltin(view);
}
function syncBuiltin(view){const plugin=view.plugin,config=plugin.builtin.config;if(!config||!view.objectControls)return;const caps=plugin.capabilities(view.contentEl.ownerDocument);if(view.capabilityKey!==caps.layoutKey){view.render().catch(report);return;}syncControls(view);view.undoImportButton.hidden=!plugin.data.appearanceUndo;for(const [id,{input,inverse,scope}]of view.builtinModuleButtons){const value=(scope?config[scope]:config)[id];input.checked=inverse?!value:value;}if(view.builtinMaterial){view.builtinMaterial.value=config.modules.translucency?config.glassMaterial:'off';view.builtinMaterial.disabled=!caps.materialEnabled;view.builtinGlassFields.disabled=!config.modules.translucency||!caps.materialEnabled;}for(const controls of [view.builtinControls,view.builtinRanges])for(const [key,input]of controls)if(input!==input.ownerDocument.activeElement&&!(key in plugin.builtinStyles.previewValues))input.value=inversePercent(config.values[key]);
 if(view.builtinNativeStatus){view.builtinNativeStatus.textContent=caps.materialReason||(config.modules.translucency?'背景模糊由系统材质决定。':'');view.builtinNativeStatus.hidden=!view.builtinNativeStatus.textContent;}
 const duplicates=LEGACY_FILES.filter(name=>plugin.builtin.enabled(plugin.builtin.dir+'/'+name));view.builtinLegacy.hidden=!duplicates.length;view.builtinLegacy.textContent='请停用重复的旧片段：'+duplicates.join('、');view.builtinStatus.textContent=config.enabled?'已保存':'外观已暂停，可在插件设置中恢复。';
}
module.exports={renderBuiltin,syncBuiltin};
