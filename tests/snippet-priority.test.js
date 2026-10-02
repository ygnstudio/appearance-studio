'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {splitSelectors,pseudo,nest,overlaps}=require('../src/snippet-priority');
test('selector list keeps commas in functions, attributes and escaped identifiers',()=>assert.deepEqual(splitSelectors(':is(.a,.b), [data-name="a,b"], .a\\,b'),[':is(.a,.b)','[data-name="a,b"]','.a\\,b']));
test('pseudo-elements stay outside selector functions',()=>{assert.deepEqual(pseudo('.a:not([title="::"] )::before'),['.a:not([title="::"] )','::before']);assert.deepEqual(pseudo('.a:before'),['.a','::before']);});
test('nesting resolves ampersands without rewriting attribute strings',()=>{assert.equal(nest('&[title="&"]','.outer, #id'),':is(.outer, #id)[title="&"]');assert.equal(nest('.child','.outer'),':is(.outer) .child');});
test('shorthand and logical property conflicts are recognized; custom properties remain exact',()=>{assert.ok(overlaps('padding-block','padding-top'));assert.ok(overlaps('background','background-color'));assert.ok(overlaps('all','color'));assert.ok(!overlaps('all','--h1-color'));assert.ok(!overlaps('--h1-color','--h2-color'));});
