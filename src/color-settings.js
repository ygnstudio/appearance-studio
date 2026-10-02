'use strict';
const COLOR_TARGETS = [
 {id:'heading',label:'标题',group:'笔记颜色',module:'notes',variable:'--yn-heading-accent',field:'--yn-标题主题色',fieldLabel:'标题颜色浓度'},
 {id:'highlight',label:'高亮',group:'笔记颜色',module:'notes',variable:'--yn-highlight-accent',field:'--yn-高亮浓度'},
 {id:'tag',label:'标签',group:'笔记颜色',module:'notes',variable:'--yn-tag-accent',field:'--yn-标签底色浓度'},
 {id:'tab',label:'活动标签页',group:'导航颜色',module:'navigation',variable:'--yn-tab-accent',field:'--yn-标签页底色浓度'},
 {id:'file',label:'文件选中',group:'导航颜色',module:'navigation',variable:'--yn-file-accent',field:'--yn-文件选中底色浓度'}
];
const COLOR_FIELD_KEYS=new Set([...COLOR_TARGETS.map(t=>t.field),'--yn-线条浓度','--yn-标注底色浓度']);
function hexColor(value){if(typeof value!=='string')return null;const s=value.trim().toLowerCase();if(/^#[0-9a-f]{6}$/.test(s))return s;if(/^#[0-9a-f]{3}$/.test(s))return '#'+[...s.slice(1)].map(c=>c+c).join('');return null;}
function normalizeColors(input){return Object.fromEntries(COLOR_TARGETS.map(t=>{const value=hexColor(input?.[t.id]?.value);return [t.id,{mode:input?.[t.id]?.mode==='custom'&&value?'custom':'theme',value}];}));}
function updateColors(current,changes){const next=normalizeColors(current);if(!changes||typeof changes!=='object'||Array.isArray(changes))throw new Error('颜色设置无效');for(const [id,patch]of Object.entries(changes)){if(!COLOR_TARGETS.some(t=>t.id===id)||!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('未知颜色设置');if(Object.keys(patch).some(k=>!['mode','value'].includes(k)))throw new Error('未知颜色选项');if('mode'in patch){if(!['theme','custom'].includes(patch.mode))throw new Error('未知颜色来源');next[id].mode=patch.mode;}if('value'in patch){const value=hexColor(patch.value);if(!value)throw new Error('请输入 #RGB 或 #RRGGBB 色号');next[id].value=value;}if(next[id].mode==='custom'&&!next[id].value)throw new Error('请先选择颜色');}return next;}
function colorVariables(input){const colors=normalizeColors(input),lines=COLOR_TARGETS.map(t=>t.variable+': '+(colors[t.id].mode==='custom'?colors[t.id].value:'var(--interactive-accent)')+';');const tag=colors.tag;lines.push('--yn-tag-text: '+(tag.mode==='custom'?tag.value:'var(--text-accent)')+';','--yn-tag-text-hover: '+(tag.mode==='custom'?tag.value:'var(--text-accent-hover)')+';');return lines.join('\n');}
module.exports={COLOR_TARGETS,COLOR_FIELD_KEYS,hexColor,normalizeColors,updateColors,colorVariables};
