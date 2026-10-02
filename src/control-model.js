'use strict';
const {LAYOUT}=require('./constants');
const {requirement}=require('./capabilities');
const {EXTRA_FIELDS}=require('./advanced');
const {hexColor}=require('./color-settings');
const ROOT='.workspace-leaf-content[data-type="markdown"]';
const NOTE=ROOT+' :is(.markdown-preview-view,.markdown-source-view.is-live-preview)';
const GROUPS=['窗口与界面','正文与页面','标题','列表与引用','代码','表格','图片与提示框','链接、标签与高亮','文件树与标签页','手机与窄栏'];
const groupOf={界面尺寸:'窗口与界面',文件树与标签页:'文件树与标签页',笔记细节:'正文与页面',标题分级:'标题',列表与引用:'列表与引用',代码与表格:'代码'};
const fields=EXTRA_FIELDS.map(f=>({...f,group:groupOf[f.group],type:'number',sub:'',seed:f.value}));
for(const f of fields){if(f.id.startsWith('table'))f.group='表格';if(/^h[1-6]/.test(f.id)){f.sub=f.id[1]+' 级标题';if(f.id.endsWith('Size')){f.step=.001;f.seed=[1.618,1.462,1.318,1.188,1.076,1][Number(f.id[1])-1];}}if(f.id==='inlineTitle'){f.group='标题';f.sub='文档标题';}if(f.id==='uiMedium')f.label='界面标题字号';}
const add=(group,id,label,variable,unit,min,max,step,seed,kind='',sub='')=>fields.push({group,id,label,variable,unit,min,max,step,seed,type:'number',selector:NOTE,kind,sub});
add('正文与页面','bodyLineHeight','正文行高','--line-height-normal','',1.2,2.4,.05,1.5);
add('正文与页面','paragraphGap','段落间距','--p-spacing','em',0,2,.05,1);
add('正文与页面','proseGap','长文样式段落间距','--p-spacing','em',0,2,.05,.75,'prose');
add('正文与页面','listParagraphGap','清单样式段落间距','--p-spacing','em',0,2,.05,.5,'list');
add('正文与页面','proseWidth','长文样式宽度','--file-line-width','em',25,65,1,42,'prose');
for(let n=1;n<=6;n++){
 const sub=n+' 级标题';
 add('标题','h'+n+'LineHeight',n+' 级标题行高','--h'+n+'-line-height','',1,2.5,.05,n<3?1.2:1.4,'',sub);
 add('标题','h'+n+'Before',n+' 级标题上方间距','', 'em',0,4,.05,1,'heading-before',sub);
 add('标题','h'+n+'After',n+' 级标题下方间距','', 'em',0,4,.05,1,'heading-after',sub);
 fields.push({group:'标题',sub,id:'h'+n+'Color',label:n+' 级标题颜色',type:'color',variable:'--h'+n+'-color',selector:NOTE});
}
add('标题','inlineTitleWeight','文档标题字重','--inline-title-weight','',300,900,100,700,'','文档标题');
fields.push({group:'标题',sub:'文档标题',id:'inlineTitleColor',label:'文档标题颜色',type:'color',variable:'--inline-title-color',selector:NOTE});
add('图片与提示框','imageRadius','图片圆角','', 'px',0,32,1,8,'image-radius');
add('图片与提示框','embedPadding','嵌入内容留白','', 'px',0,40,1,12,'embed-padding');
add('图片与提示框','calloutRadius','提示框圆角','--callout-radius','px',0,32,1,8);
add('图片与提示框','calloutPadding','提示框内部留白','--callout-padding','px',0,40,1,12);
add('图片与提示框','calloutTint','提示框底色浓度','', '%',0,60,1,10,'callout-tint');
add('表格','tablePaddingY','表格上下留白','', 'px',0,24,1,7,'table-padding');
add('表格','tablePaddingX','表格左右留白','', 'px',0,32,1,10,'table-padding');
add('表格','tableRuleTint','表格线浓度','', '%',0,100,1,16,'table-rule');
add('代码','codePadding','代码块留白','','px',0,40,1,16,'code-padding');
add('文件树与标签页','tabRadius','标签页圆角','', 'px',0,999,1,6,'tab-radius');
add('文件树与标签页','tabBorder','标签页描边','', 'px',0,4,.5,1,'tab-border');
add('手机与窄栏','narrowMargin','窄栏页边距','--file-margins','px',4,40,1,16,'narrow');
add('手机与窄栏','narrowPadding','窄栏提示框留白','--callout-padding','px',0,32,1,8,'narrow');
add('手机与窄栏','narrowTablePadding','窄栏表格留白','', 'px',0,24,1,6,'narrow-table');
for(const [id,label,variable,group]of [['linkColor','链接颜色','--link-color','链接、标签与高亮'],['tagColor','标签颜色','--tag-color','链接、标签与高亮'],['highlightColor','高亮底色','--text-highlight-bg','链接、标签与高亮'],['tabColor','活动标签页底色','','文件树与标签页'],['fileColor','文件选中底色','','文件树与标签页'],['quoteColor','引用边线颜色','--blockquote-border-color','列表与引用'],['boldColor','加粗文字颜色','--bold-color','正文与页面'],['italicColor','斜体文字颜色','--italic-color','正文与页面']])fields.push({id,label,variable,group,sub:'',selector:NOTE,type:'color',background:['highlightColor','tabColor','fileColor'].includes(id)});
add('链接、标签与高亮','tagTint','标签底色浓度','', '%',0,50,1,10,'tag-tint');
for(const f of fields)f.capability=requirement('controls.'+f.id);
const CONTROLS=fields,MAP=new Map(fields.map(f=>[f.id,f]));
function defaultColor(){return {mode:'default',value:null,strength:100};}
function valid(f,v){return f.type==='number'?(v===null||typeof v==='number'&&Number.isFinite(v)&&v>=f.min&&v<=f.max):(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>['mode','value','strength'].includes(k))&&['default','accent','custom','muted'].includes(v.mode)&&(v.value===null||!!hexColor(v.value))&&(v.mode!=='custom'||!!hexColor(v.value))&&typeof v.strength==='number'&&Number.isFinite(v.strength)&&v.strength>=0&&v.strength<=100);}
function normalizeControls(input){return Object.fromEntries(CONTROLS.map(f=>[f.id,valid(f,input?.[f.id])?(f.type==='color'?{...input[f.id],value:hexColor(input[f.id].value)}:input[f.id]===null?null:Number(input[f.id].toFixed(4))):f.type==='color'?defaultColor():null]));}
function updateControls(current,changes){if(!changes||typeof changes!=='object'||Array.isArray(changes))throw new Error('外观参数无效');const next=normalizeControls(current);for(const [id,v]of Object.entries(changes)){const f=MAP.get(id);if(!f||!valid(f,v))throw new Error('设置值无效：'+(f?.label||id));next[id]=f.type==='color'?{...v,value:hexColor(v.value)}:v===null?null:Number(v.toFixed(4));}return next;}
function migrateControls(config){
 const c=normalizeControls(),v=config.values||{},notes=config.modules?.notes,nav=config.modules?.navigation;
 const set=(id,key)=>{if(Number.isFinite(v[key]))c[id]=v[key];};
 const color=(old,strength=100)=>({mode:old?.mode==='custom'?'custom':'accent',value:old?.value||null,strength});
 if(notes){
  for(const [id,key]of Object.entries({bodyLineHeight:'正文行高',paragraphGap:'段落间距',proseGap:'长文段落间距',listParagraphGap:'清单段落间距',proseWidth:'长文宽度',imageRadius:'圆角',codeRadius:'圆角',calloutRadius:'圆角',embedPadding:'内容块留白',calloutPadding:'内容块留白',tablePaddingY:'表格留白',tableRuleTint:'线条浓度',calloutTint:'标注底色浓度',narrowMargin:'窄屏页边距',narrowPadding:'窄屏内容块留白',narrowTablePadding:'窄屏表格留白',tagTint:'标签底色浓度'}))set(id,'--yn-'+key);
  for(let n=1;n<=6;n++){c['h'+n+'Size']=[1.75,1.45,1.22,1.1,1,1][n-1]*(v['--yn-标题大小']||1);c['h'+n+'Weight']=[700,650,600,600,600,500][n-1];c['h'+n+'LineHeight']=[1.3,1.35,1.4,1.45,1.5,1.5][n-1];set('h'+n+'Before','--yn-标题上方留白');set('h'+n+'After','--yn-标题下方留白');}
  c.h1Color=color(config.colors?.heading,v['--yn-标题主题色']??65);c.h2Color=color(config.colors?.heading,(v['--yn-标题主题色']??65)*7/13);c.h6Color={mode:'muted',value:null,strength:100};c.highlightColor=color(config.colors?.highlight,v['--yn-高亮浓度']??26);c.tagColor=color(config.colors?.tag);c.tablePaddingX=10;c.quoteBorder=2;
 }
 if(nav){set('tabRadius','--yn-标签页圆角');set('tabBorder','--yn-标签页描边');c.tabColor=color(config.colors?.tab,v['--yn-标签页底色浓度']??12);c.fileColor=color(config.colors?.file,v['--yn-文件选中底色浓度']??16);}
 for(const [id,value]of Object.entries(config.overrides||{}))if(MAP.has(id)&&value!==null)c[id]=value;
 return normalizeControls(c);
}
function controlsCSS(input){
 const c=normalizeControls(input),rules=new Map(),raw=[],narrow=[];
 const rule=(sel,decl)=>{const parts=rules.get(sel)||[];parts.push(decl);rules.set(sel,parts);};
 const tone=(entry,background=false)=>{const source=entry.mode==='custom'?entry.value:entry.mode==='muted'?'var(--text-muted)':'var(--interactive-accent)';return entry.strength===100?source:'color-mix(in srgb, '+source+' '+entry.strength+'%, '+(background?'transparent':'var(--text-normal)')+')';};
 for(const f of CONTROLS){const value=c[f.id];if(f.type==='color'){
   if(value.mode==='default')continue;const color=tone(value,f.background);
   if(f.id==='tabColor')rule('.workspace-split.mod-root .workspace-tab-header-container .workspace-tab-header.is-active','background-color: '+color+';');
   else if(f.id==='fileColor')rule('.nav-files-container','--nav-item-background-active: '+color+';');
   else{rule(f.selector,f.variable+': '+color+';');if(f.id==='linkColor')rule(f.selector,'--link-color-hover: '+color+'; --link-external-color: '+color+';');if(f.id==='tagColor')rule(f.selector,'--tag-color-hover: '+color+';');}
   continue;
  }
  if(value===null)continue;const formatted=value+f.unit;
  if(f.kind?.startsWith('heading-')){const level=f.id[1],before=f.kind==='heading-before',side=before?'start':'end';rule(ROOT+' .markdown-rendered h'+level,'margin-block-'+side+': '+formatted+';');rule(ROOT+' .markdown-source-view.is-live-preview .cm-line.HyperMD-header-'+level,'padding-block-'+side+': '+formatted+';');if(!before)rule(ROOT+' .markdown-source-view.is-live-preview .cm-line.HyperMD-header-'+level+':has(+ .cm-line > br:only-child)','padding-block-end: max(0px, calc('+formatted+' - var(--font-text-size) * var(--line-height-normal)));');}
  else if(f.kind==='image-radius')rule(NOTE+' img:not(.emoji)','border-radius: '+formatted+';');
  else if(f.kind==='embed-padding')rule(ROOT+' .markdown-embed','--embed-padding: 0 '+formatted+';');
  else if(f.kind==='callout-tint')rule(ROOT+' .callout','background-color: color-mix(in srgb, var(--callout-color) '+formatted+', transparent);');
  else if(f.kind==='table-rule')rule(NOTE,'--table-border-color: color-mix(in srgb, var(--text-normal) '+formatted+', transparent);');
  else if(f.kind==='code-padding'){rule(ROOT+' .markdown-rendered pre','padding: '+formatted+';');rule(ROOT+' .markdown-source-view.is-live-preview .cm-line.HyperMD-codeblock','padding-inline: '+formatted+';');rule(ROOT+' .markdown-source-view.is-live-preview .cm-line.HyperMD-codeblock-begin','padding-top: '+formatted+';');rule(ROOT+' .markdown-source-view.is-live-preview .cm-line.HyperMD-codeblock-end','padding-bottom: '+formatted+';');}
  else if(f.kind==='table-padding')continue;
  else if(f.kind==='tab-radius')rule('.workspace-split.mod-root .workspace-tab-header-container .workspace-tab-header','border-radius: '+formatted+';');
  else if(f.kind==='tab-border')rule('.workspace-split.mod-root .workspace-tab-header-container .workspace-tab-header.is-active','box-shadow: inset 0 0 0 '+formatted+' color-mix(in srgb, var(--interactive-accent) '+LAYOUT.tabBorderTintPercent+'%, transparent);');
  else if(f.kind==='tag-tint'){const entry=c.tagColor,source=entry.mode==='custom'?entry.value:entry.mode==='muted'?'var(--text-muted)':'var(--interactive-accent)';rule(NOTE,'--tag-background: color-mix(in srgb, '+source+' '+formatted+', transparent); --tag-background-hover: color-mix(in srgb, '+source+' '+Math.min(value*2,100)+'%, transparent);');}
  else if(f.kind==='narrow')narrow.push(NOTE+' { '+f.variable+': '+formatted+'; }');
  else if(f.kind==='narrow-table')continue;
  else rule(f.kind==='prose'?NOTE+'.note-prose':f.kind==='list'?NOTE+'.note-list':f.selector,f.variable+': '+formatted+';');
 }
 // Custom tab geometry/fill is self-contained; native reverse corners retain
 // the opaque default fill and otherwise protrude from either side of the tab.
 if(c.tabRadius!==null||c.tabBorder!==null||c.tabColor.mode!=='default'){
  const tab='.workspace-split.mod-root .workspace-tab-header-container .workspace-tab-header.is-active';
  rule(tab+'::before, '+tab+'::after','box-shadow: none;');
 }
 const cells=ROOT+' .markdown-rendered :is(th,td):not(:has(> .table-cell-wrapper)), '+ROOT+' .cm-table-widget .table-cell-wrapper';
 if(c.tablePaddingY!==null)rule(cells,'padding-block: '+c.tablePaddingY+'px;');if(c.tablePaddingX!==null)rule(cells,'padding-inline: '+c.tablePaddingX+'px;');if(c.tablePaddingY!==null||c.tablePaddingX!==null)rule(ROOT+' .cm-table-widget :is(th,td):has(> .table-cell-wrapper)','padding: 0;');
 if(c.narrowTablePadding!==null)narrow.push(cells+' { padding-block: '+c.narrowTablePadding+'px; }');
 if(narrow.length){rule(ROOT,'container-type: inline-size; container-name: yn-note;');raw.push('@container yn-note (max-width:'+LAYOUT.narrowWidthPx+'px) { '+narrow.join('\n')+' }');}
 if(c.imageRadius!==null)raw.push(NOTE+' img:not(.emoji)[alt~="center"] { display:block; margin-inline:auto; max-width:100%; }');
 if(c.codeRadius!==null||c.codeSize!==null||c.codePadding!==null)raw.push('@media(pointer:coarse) { '+ROOT+' .markdown-rendered pre:has(> .copy-code-button) { display:flex; flex-direction:column; } '+ROOT+' .markdown-rendered pre > .copy-code-button { position:static; align-self:flex-end; order:-1; min-width:'+LAYOUT.touchTargetPx+'px; min-height:'+LAYOUT.touchTargetPx+'px; opacity:1; margin-bottom:'+LAYOUT.codeActionGapPx+'px; } '+ROOT+' .markdown-source-view.is-live-preview .cm-line.HyperMD-codeblock-begin:has(.code-block-flair) { padding-top:max('+LAYOUT.codeToolbarPx+'px, 2.75em); } '+ROOT+' .code-block-flair { min-width:'+LAYOUT.touchTargetPx+'px; min-height:'+LAYOUT.touchTargetPx+'px; } }');
 return [...rules].map(([s,d])=>s+' { '+d.join(' ')+' }').concat(raw).join('\n');
}
module.exports={GROUPS,CONTROLS,MAP,ROOT,NOTE,defaultColor,normalizeControls,updateControls,migrateControls,controlsCSS};
