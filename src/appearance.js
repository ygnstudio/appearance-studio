'use strict';
const APPEARANCE_FILE = '99-外观设置.css';
// Stable keys map to the public --yn- variables. Units never come from user input.
const GROUPS = [
 ['阅读', [
  ['正文行高',1.65,'',1.2,2.4,.05,'越大越舒展。'],
  ['段落间距',.85,'em',0,2,.05,'普通笔记段落之间的距离。'],
  ['长文段落间距',.75,'em',0,2,.05,'只影响 note-prose 长文模式。'],
  ['清单段落间距',.5,'em',0,2,.05,'只影响 note-list 清单模式。'],
  ['长文宽度',42,'em',25,65,1,'只限制长文模式的最大宽度。'],
  ['标题大小',1,'',.7,1.5,.05,'所有正文标题一起缩放。'],
  ['标题主题色',65,'%',0,100,1,'0 为正文颜色，越大主题色越明显。'],
  ['标题上方留白',1.2,'em',0,4,.05,'窄屏会自动略收紧。'],
  ['标题下方留白',.45,'em',0,4,.05,'实时预览会保留可编辑空行，不能用此项压缩空行高度。']
 ]],
 ['图片与内容块', [
  ['圆角',8,'px',0,24,1,'图片、代码块和标注的圆角。'],
  ['内容块留白',12,'px',0,32,1,'标注、嵌入、图表的内部留白。'],
  ['表格留白',7,'px',0,20,1,'表格单元格的上下留白。'],
  ['线条浓度',16,'%',0,60,1,'分隔线和表格线。'],
  ['高亮浓度',26,'%',0,70,1,'手工高亮文字的底色。'],
  ['标签底色浓度',9,'%',0,50,1,'标签底色的浓度，悬停时略加深。'],
  ['标注底色浓度',9,'%',0,40,1,'提示与警告标注的底色。']
 ]],
 ['手机与窄分栏', [
  ['窄屏页边距',16,'px',4,40,1,'笔记容器不超过 540px 时生效。'],
  ['窄屏内容块留白',8,'px',0,24,1,'窄屏中的标注、嵌入和图表。'],
  ['窄屏表格留白',6,'px',0,16,1,'窄屏表格单元格的上下留白。']
 ]],
 ['界面导航', [
  ['标签页圆角',999,'px',0,999,1,'999 为胶囊，6 为微圆角，0 为直角。'],
  ['标签页底色浓度',12,'%',0,50,1,'活动标签页的底色。'],
  ['标签页描边',1,'px',0,4,.5,'0 表示关闭描边。'],
  ['文件选中底色浓度',16,'%',0,50,1,'文件列表中选中项的底色。']
 ]],
 ['窗口半透明', [
  ['深色窗口不透明度',45,'%',0,100,1,'越高越深，越低越透；只调整底色，文字保持清晰。'],
  ['浅色窗口不透明度',65,'%',0,100,1,'笔记与侧栏共用窗口底色，100 为完全不透明。']
 ]]
];
const FIELDS = GROUPS.flatMap(([group, items]) => items.map(([label, value, unit, min, max, step, help]) => ({group,label,key:'--yn-'+label,value,unit,min,max,step,help})));
const LEGACY_FIELDS=FIELDS.filter(f=>f.key!=='--yn-标签底色浓度');
function mask(source) { return source.replace(/\/\*[\s\S]*?(?:\*\/|$)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, s => s.replace(/[^\n]/g,' ')); }
function parseAppearance(source) {
 const clean = mask(source), fields = new Map();
 // Deliberately support one plain body rule only. Ambiguous/scoped CSS stays in source mode.
 const blocks = [...clean.matchAll(/\bbody\s*\{([^{}]*)\}/g)].filter(m => { const before=clean.slice(0,m.index).trimEnd(); return (!before || before.endsWith('}')) && [...before].reduce((n,ch)=>n+(ch==='{'?1:ch==='}'?-1:0),0)===0; });
 if (blocks.length !== 1) return {fields, error:'此文件不再是单一 body 设置块，请使用源码编辑。'};
 const block = blocks[0], open = clean.indexOf('{', block.index), close = clean.indexOf('}', open);
 for (const field of FIELDS) {
   const re = new RegExp(field.key + '\\s*:\\s*([^;{}]+);','g');
   const matches = [...clean.matchAll(re)].filter(m => m.index === 0 || !/[-\w\u0080-\uFFFF]/.test(clean[m.index-1]));
   if (matches.length !== 1 || matches[0].index <= open || matches[0].index >= close) continue;
   const m = matches[0], valueStart = m.index + m[0].indexOf(':') + 1;
   const valueText = source.slice(valueStart, m.index+m[0].length-1).trim();
   const numeric = valueText.match(/^(-?(?:\d+(?:\.\d*)?|\.\d+))(px|em|%)?$/);
   if (!numeric || (numeric[2]||'') !== field.unit || !Number.isFinite(Number(numeric[1]))) continue;
   fields.set(field.key, {field,value:Number(numeric[1]),start:valueStart,end:m.index+m[0].length-1});
 }
 return {fields,error:fields.size ? '' : '未找到可直接调整的数值设置，请使用源码编辑。'};
}
function updateAppearance(source, changes) {
 const parsed = parseAppearance(source), replacements = [];
 if (parsed.error) throw new Error(parsed.error);
 for (const [key, value] of Object.entries(changes)) {
   const item = parsed.fields.get(key);
   if (!item) throw new Error('设置项缺失、重复或使用了表达式，请在源码中检查：' + key);
   if (!Number.isFinite(value) || value < item.field.min || value > item.field.max) throw new Error(item.field.label + '应在 ' + item.field.min + '～' + item.field.max + ' 之间。');
   replacements.push({...item,text:' ' + Number(value.toFixed(4)) + item.field.unit});
 }
 for (const r of replacements.sort((a,b) => b.start-a.start)) source = source.slice(0,r.start) + r.text + source.slice(r.end);
 return source;
}
module.exports = {APPEARANCE_FILE,GROUPS,FIELDS,LEGACY_FIELDS,parseAppearance,updateAppearance};
