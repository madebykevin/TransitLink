import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const updateSource=source.slice(source.indexOf('let destinationRequest ='),source.indexOf('function initializeMap()'));
function setup(analyzed=false, api=async()=>({stops:[]})) {
  const elements={origin:{value:'A'},destination:{value:'A',innerHTML:'',disabled:false},'find-button':{disabled:false}};
  const context={network:{stops:[{id:'A',name:'Alpha'},{id:'B',name:'Beta'}]},analyzed,api,
    $:id=>elements[id],escapeHtml:String,leafletMap:null,alert:()=>{}};
  runInNewContext(updateSource,context);
  return {elements,context};
}
test('destination excludes origin before analysis and after origin changes',async()=>{
  const {elements,context}=setup();
  await context.updateDestinations();
  assert.doesNotMatch(elements.destination.innerHTML,/value="A"/);
  assert.equal(elements.destination.value,'B');
  elements.origin.value='B';
  await context.updateDestinations();
  assert.doesNotMatch(elements.destination.innerHTML,/value="B"/);
  assert.equal(elements.destination.value,'A');
});
test('pending destination query clears previous selection and filters origin from response',async()=>{
  let resolve;
  const {elements,context}=setup(true,()=>new Promise(done=>{resolve=done;}));
  const pending=context.updateDestinations();
  assert.equal(elements.destination.disabled,true);
  assert.match(elements.destination.innerHTML,/value=""/);
  assert.equal(elements['find-button'].disabled,true);
  resolve({stops:[{id:'A',name:'Alpha'},{id:'B',name:'Beta'}]});
  await pending;
  assert.doesNotMatch(elements.destination.innerHTML,/value="A"/);
  assert.equal(elements.destination.value,'B');
});
test('origin alone in reachable results leaves destination disabled',async()=>{
  const {elements,context}=setup(true,async()=>({stops:[{id:'A',name:'Alpha'}]}));
  await context.updateDestinations();
  assert.equal(elements.destination.disabled,true);
  assert.equal(elements['find-button'].disabled,true);
  assert.doesNotMatch(elements.destination.innerHTML,/value="A"/);
});
