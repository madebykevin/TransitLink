import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const context = {};
runInNewContext(source.slice(source.indexOf('function getMapAvailability('), source.indexOf('function drawMap()')), context);
const availability = context.getMapAvailability;

test('shared connections stay available until all their lines are interrupted', () => {
  const edge = {from:'A',to:'B',routeIds:['R1','R2']};
  const shared = availability([edge], new Set(['R1']), null);
  assert.equal(shared.availableEdges.has(edge), true);
  assert.equal(shared.availableStops.has('B'), true);
  const blocked = availability([edge], new Set(['R1','R2']), null);
  assert.equal(blocked.availableEdges.size, 0);
  assert.equal(blocked.availableStops.size, 0);
  assert.equal(availability([edge], new Set(), null).availableEdges.has(edge), true);
});

test('directed reachability dims inbound-only branches and disconnected stops', () => {
  const forward = {from:'A',to:'B',routeIds:['R1']};
  const inbound = {from:'C',to:'A',routeIds:['R1']};
  const result = availability([forward,inbound], new Set(), new Set(['A','B']));
  assert.equal(result.availableEdges.has(forward), true);
  assert.equal(result.availableEdges.has(inbound), false);
  assert.equal(result.availableStops.has('C'), false);
  const changedOrigin = availability([forward,inbound], new Set(), new Set(['C','A','B']));
  assert.equal(changedOrigin.availableEdges.has(inbound), true);
});

test('blocked edge stays dim even when endpoints are reachable through another path', () => {
  const edge = {from:'A',to:'B',routeIds:['R1']};
  const result = availability([edge], new Set(['R1']), new Set(['A','B']));
  assert.equal(result.availableEdges.has(edge), false);
  assert.equal(result.availableStops.has('B'), true);
});
