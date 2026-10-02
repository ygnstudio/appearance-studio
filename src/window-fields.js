'use strict';
const WINDOW_FIELDS=Object.freeze([
 {key:'--yn-深色窗口不透明度',label:'深色背景透明度'},
 {key:'--yn-浅色窗口不透明度',label:'浅色背景透明度'}
]);
const inversePercent=value=>Number((100-value).toFixed(4));
function windowField(path){return WINDOW_FIELDS.find(f=>path===f.key||path==='values.'+f.key);}
function displayValue(path,value){return windowField(path)&&typeof value==='number'?inversePercent(value)+'%':null;}
module.exports={WINDOW_FIELDS,inversePercent,windowField,displayValue};
