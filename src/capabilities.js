'use strict';
// One policy shared by settings, runtime CSS, native windows and preset import.
// No OS modules are loaded here: the host supplies the platform and window.
const REQUIREMENTS={
 'glassMaterial':'windowMaterial',
 'modules.translucency':'windowMaterial',
 'values.--yn-深色窗口不透明度':'windowMaterial',
 'values.--yn-浅色窗口不透明度':'windowMaterial',
 'modules.hideStatus':'statusBar',
 ...Object.fromEntries(['tabSize','tabWidth','tabRadius','tabBorder','tabColor'].map(id=>['controls.'+id,'desktopTabs']))
};
function requirement(path){return Object.entries(REQUIREMENTS).find(([key])=>path===key||path.startsWith(key+'.'))?.[1]||'common';}
function supports(caps,capability){return !caps||capability==='common'||caps[capability]===true;}
function capabilities({platform={},app={},doc,state,media}={}){
 const has=key=>!!doc?.body?.classList?.contains(key);
 const mobile=!!(platform.isMobileApp||platform.isIosApp||platform.isAndroidApp||app.isMobile||has('is-mobile'));
 const desktop=!!platform.isDesktopApp&&!mobile;
 const mac=desktop&&!!platform.isMacOS;
 const native=doc?.defaultView?.electronWindow;
 const nativeMaterial=!!(mac&&native&&!native.isDestroyed?.()&&['setVibrancy','setBackgroundColor','getBackgroundColor'].every(key=>typeof native[key]==='function'));
 const matches=query=>(media?.[query]||doc?.defaultView?.matchMedia?.(query))?.matches;
 const reduced=!!matches('(prefers-reduced-transparency: reduce)')||!!matches('(forced-colors: active)');
 const fullscreen=has('is-fullscreen')||(nativeMaterial&&!!native.isFullScreen?.());
 const materialReason=!nativeMaterial?'当前窗口不支持原生材质。':reduced?'系统已开启减少透明度或高对比度，暂时使用实色。':fullscreen?'全屏时暂时使用实色；退出全屏后自动恢复。':state==='unavailable'?'窗口材质接口暂不可用，已恢复系统外观。':'';
 return {mobile,desktop,windowMaterial:mac,nativeMaterial,desktopTabs:desktop,statusBar:desktop,
  materialEnabled:nativeMaterial&&!materialReason,materialReason,
  layoutKey:[mobile,mac,desktop].join('/'),
  name:mobile?(platform.isIosApp?'iOS / iPadOS':platform.isAndroidApp?'Android':'移动端'):platform.isMacOS?'macOS':platform.isWin?'Windows':platform.isLinux?'Linux':'当前设备'};
}
// Runtime projection never modifies stored settings. A Mac preset can travel
// through a phone and return without losing its desktop choices.
function runtimeConfig(config,caps){
 if(!config||!caps)return config;
 const next={...config,modules:{...config.modules},controls:config.controls?{...config.controls}:undefined};
 if(!caps.materialEnabled)next.modules.translucency=false;
 if(!caps.statusBar)next.modules.hideStatus=false;
 for(const [id,value]of Object.entries(next.controls||{}))if(!supports(caps,requirement('controls.'+id)))next.controls[id]=value&&typeof value==='object'?{...value,mode:'default'}:null;
 return next;
}
// Import only the supported scope. Keep this device's previous values for
// unsupported objects, instead of overwriting settings shared with other devices.
function importConfig(before,incoming,caps){
 if(!caps)return {config:incoming,skipped:[]};
 const config={...incoming,modules:{...incoming.modules},values:{...incoming.values},controls:{...incoming.controls}},skipped=[];
 for(const [path,capability]of Object.entries(REQUIREMENTS))if(!supports(caps,capability)){
  const parts=path.split('.');const get=o=>parts.reduce((v,k)=>v?.[k],o);
  const old=get(before),value=get(incoming);
  if(JSON.stringify(old)!==JSON.stringify(value))skipped.push({path,capability});
  let target=config;for(const key of parts.slice(0,-1))target=target[key];target[parts.at(-1)]=old;
 }
 return {config,skipped};
}
module.exports={REQUIREMENTS,requirement,supports,capabilities,runtimeConfig,importConfig};
