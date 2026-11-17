import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const popupSource = source.slice(source.indexOf('function createStopPopup('), source.indexOf('function drawMap()'));

function setup() {
  const events = [];
  const listeners = {};
  const checkbox = { value:'R1', checked:false, dispatchEvent:event => events.push(event.type) };
  const elements = {
    origin:{ value:'A', dispatchEvent:event => events.push(`origin:${event.type}`) },
    destination:{ value:'B', disabled:false, options:[{value:'B'}], dispatchEvent:event => events.push(`destination:${event.type}`) },
    'analyze-button':{ disabled:false, click:() => events.push('analyze') },
    'city-button':{ disabled:false },
    'find-button':{ disabled:false, click:() => events.push('find') },
    'route-list':{ querySelectorAll:() => [checkbox] },
  };
  const context = {
    $:id => elements[id], analyzed:true, escapeHtml:String, Event,
    network:{ edges:[{from:'A',to:'B',routeIds:['R1']}], routes:[{id:'R1',name:'Linha 1'},{id:'R2',name:'Outra linha'}] },
    document:{ createElement:() => ({ addEventListener:(type, listener) => { listeners[type] = listener; } }) },
    leafletMap:{ closePopup:() => events.push('close') },
    L:{ popup:() => ({setLatLng(){return this;},setContent(){return this;},openOn(){return this;}}) },
  };
  runInNewContext(popupSource, context);
  const popup = context.createStopPopup({id:'B',name:'Beta',lat:0,lon:0});
  const click = action => listeners.click({target:{closest:() => ({dataset:{action}})}});
  return {elements,events,checkbox,popup,listeners,click};
}

test('map destination synchronizes selection and queries the analyzed path', () => {
  const {elements,events,click} = setup();
  click('destination');
  assert.equal(elements.destination.value, 'B');
  assert.deepEqual(events, ['close','destination:change','find']);
});

test('map cannot select unreachable destinations or mutate while calculating', () => {
  const {elements,events,click} = setup();
  elements.destination.options = [{value:'C'}];
  click('destination');
  elements['analyze-button'].disabled = true;
  click('origin');
  assert.deepEqual(events, []);
  assert.equal(elements.origin.value, 'A');
});

test('map origin reuses change handler and route interruption synchronizes sidebar', () => {
  const {elements,events,checkbox,popup,listeners,click} = setup();
  click('origin');
  assert.equal(elements.origin.value, 'B');
  assert.deepEqual(events, ['close','origin:change']);
  assert.match(popup.innerHTML, /Linha 1/);
  assert.doesNotMatch(popup.innerHTML, /Outra linha/);
  listeners.change({target:{dataset:{route:'R1'},checked:true}});
  assert.equal(checkbox.checked, true);
  assert.equal(events.at(-1), 'change');
});
