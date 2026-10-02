'use strict';
const NOTE='.workspace-leaf-content[data-type="markdown"] :is(.markdown-preview-view,.markdown-source-view.is-live-preview)';
const entries=[
 ['界面尺寸','uiSmall','界面字号','--font-ui-small','px',11,20,1,13,'body'],
 ['界面尺寸','uiMedium','分组标题字号','--font-ui-medium','px',12,24,1,15,'body'],
 ['界面尺寸','controlHeight','控件高度','--input-height','px',24,48,1,30,'body'],
 ['界面尺寸','controlRadius','控件圆角','--input-radius','px',0,18,1,5,'body'],
 ['文件树与标签页','treeSize','文件树字号','--nav-item-size','px',11,22,1,13,'.nav-files-container'],
 ['文件树与标签页','treeIndent','文件夹缩进','--nav-item-children-padding-start','px',0,32,1,4,'.nav-files-container'],
 ['文件树与标签页','guideWidth','层级线粗细','--nav-indentation-guide-width','px',0,3,.5,1,'.nav-files-container'],
 ['文件树与标签页','tabSize','标签页字号','--tab-font-size','px',11,20,1,13,'body'],
 ['文件树与标签页','tabWidth','标签页最大宽度','--tab-max-width','px',100,420,10,320,'body'],
 ['笔记细节','bodySize','正文字号','--font-text-size','px',12,28,1,16,NOTE],
 ['笔记细节','noteWidth','笔记行宽','--file-line-width','px',320,1200,20,700,NOTE],
 ['笔记细节','noteMargin','笔记左右留白','--file-margins-x','px',8,80,2,32,NOTE],
 ['笔记细节','inlineTitle','文档标题字号','--inline-title-size','em',1,3,.1,2,NOTE],
 ...[1,2,3,4,5,6].map((n)=>['标题分级','h'+n+'Size',n+' 级标题字号','--h'+n+'-size','em',.8,3,.05,[1.8,1.5,1.25,1.1,1,1][n-1],NOTE]),
 ...[1,2,3,4,5,6].map((n)=>['标题分级','h'+n+'Weight',n+' 级标题字重','--h'+n+'-weight','',300,900,100,600,NOTE]),
 ['列表与引用','listIndent','列表缩进','--list-indent','em',1,4,.1,2,NOTE],
 ['列表与引用','listGap','列表项间距','--list-spacing','em',0,1,.05,.075,NOTE],
 ['列表与引用','quoteBorder','引用边线粗细','--blockquote-border-thickness','px',0,6,.5,2,NOTE],
 ['代码与表格','codeSize','代码字号','--code-size','em',.7,1.4,.05,.875,NOTE],
 ['代码与表格','tableSize','表格字号','--table-text-size','px',11,24,1,16,NOTE],
 ['代码与表格','tableBorder','表格边线粗细','--table-border-width','px',0,3,.5,1,NOTE],
 ['代码与表格','codeRadius','代码圆角','--code-radius','px',0,20,1,4,NOTE]
];
const EXTRA_FIELDS=entries.map(([group,id,label,variable,unit,min,max,step,value,selector])=>({group,id,label,variable,unit,min,max,step,value,selector}));
const EXTRA_GROUPS=[...new Set(EXTRA_FIELDS.map(f=>f.group))];
function valid(f,v){return v===null||(typeof v==='number'&&Number.isFinite(v)&&v>=f.min&&v<=f.max);}
function normalizeOverrides(input){return Object.fromEntries(EXTRA_FIELDS.map(f=>[f.id,valid(f,input?.[f.id])?input[f.id]:null]));}
function updateOverrides(current,changes){if(!changes||typeof changes!=='object'||Array.isArray(changes))throw new Error('外观参数无效');const next=normalizeOverrides(current);for(const [id,v]of Object.entries(changes)){const f=EXTRA_FIELDS.find(f=>f.id===id);if(!f||!valid(f,v))throw new Error('外观参数超出范围：'+id);next[id]=v===null?null:Number(v.toFixed(4));}return next;}
function overridesCSS(input){const values=normalizeOverrides(input),rules=new Map();for(const f of EXTRA_FIELDS){if(values[f.id]===null)continue;const parts=rules.get(f.selector)||[];parts.push(f.variable+': '+values[f.id]+f.unit+';');rules.set(f.selector,parts);}return [...rules].map(([selector,parts])=>selector+' { '+parts.join(' ')+' }').join('\n');}
module.exports={EXTRA_FIELDS,EXTRA_GROUPS,normalizeOverrides,updateOverrides,overridesCSS};
