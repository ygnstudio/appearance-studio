/* Browser-only Obsidian API adapter. All files stay in memory. */
const host=document.getElementById('host');
const listeners=new Map();
class Component {
 constructor(){this.cleanups=[];}
 register(fn){this.cleanups.push(fn);}
 registerDomEvent(node,event,fn){node.addEventListener(event,fn);this.register(()=>node.removeEventListener(event,fn));}
 registerEvent(cleanup){if(typeof cleanup==='function')this.register(cleanup);}
 registerInterval(id){this.register(()=>clearInterval(id));}
}
class ItemView extends Component {
 constructor(leaf){super();this.leaf=leaf;this.app=leaf.app;this.contentEl=document.createElement('div');host.appendChild(this.contentEl);}
 async setState(){}
}
class Modal {
 constructor(app){this.app=app;this.modalEl=document.createElement('div');this.modalEl.className='modal';this.contentEl=document.createElement('div');this.modalEl.appendChild(this.contentEl);}
 open(){document.body.appendChild(this.modalEl);this.onOpen?.();}
 close(){this.onClose?.();this.modalEl.remove();}
}
class Plugin extends Component {
 constructor(app){super();this.app=app;}
 async loadData(){return {mode:'panel',autoSave:false};}
 async saveData(data){window.persisted=structuredClone(data);}
 registerView(type,fn){this.viewFactory=fn;}
 addSettingTab(){} addRibbonIcon(){} addCommand(){}
}
class PluginSettingTab{constructor(app,plugin){this.app=app;this.plugin=plugin;}}
class Notice{constructor(message){window.notices.push(String(message));}}
window.notices=[];
const obsidian={Plugin,ItemView,Modal,Notice,PluginSettingTab,Setting:class{},FuzzySuggestModal:class{},Platform:window.testPlatform||{isDesktopApp:true,isWin:true}};
window.require=id=>{if(id==='obsidian')return obsidian;throw new Error(id);};
window.module={exports:{}};
window.startHarness=async function(initial,saved){
 const files=new Map(Object.entries(initial)),dirs=new Set(['.obsidian/snippets']),enabled=new Set(Object.keys(initial).map(p=>p.split('/').pop().replace(/\.css$/,'')));
 window.disk=files;
 const adapter={exists:async p=>files.has(p)||dirs.has(p),read:async p=>{if(!files.has(p))throw new Error('missing');return files.get(p);},write:async(p,t)=>files.set(p,t),rename:async(p,q)=>{files.set(q,files.get(p));files.delete(p);},mkdir:async p=>dirs.add(p),list:async()=>({files:[...files.keys()].filter(p=>p.startsWith('.obsidian/snippets/'))})};
 const app={vault:{adapter,configDir:'.obsidian',getConfig:()=>'',setConfig:()=>{}},customCss:{extraStyleEls:[],enabledSnippets:enabled,setCssEnabledStatus:async(k,on)=>on?enabled.add(k):enabled.delete(k),requestLoadSnippets:async()=>{}},workspace:{on:(event,fn)=>{listeners.set(event,fn);return()=>listeners.delete(event);},getLeavesOfType:()=>[leaf],revealLeaf:async()=>{}}};
 const leaf={app,updateHeader(){},view:null};
 const plugin=new module.exports(app);if(saved)plugin.loadData=async()=>structuredClone(saved);await plugin.onload();window.plugin=plugin;
 const view=plugin.viewFactory(leaf);leaf.view=view;window.view=view;await view.onOpen();
};
