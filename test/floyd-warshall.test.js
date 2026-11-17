import test from 'node:test';
import assert from 'node:assert/strict';
import { floydWarshall, reconstructPath } from '../server/floyd-warshall.js';

const vertices=['A','B','C','D'].map(id=>({id,name:id}));
const edges=[{from:'A',to:'B',weight:4,routeIds:['R1']},{from:'A',to:'C',weight:1,routeIds:['R2']},{from:'C',to:'B',weight:1,routeIds:['R2']},{from:'B',to:'D',weight:2,routeIds:['R1']},{from:'D',to:'B',weight:2,routeIds:['R1']}];
test('finds and reconstructs minimum directed path',()=>{const r=floydWarshall(vertices,edges);assert.equal(reconstructPath(r,'A','D').cost,4);assert.deepEqual(reconstructPath(r,'A','D').stops.map(s=>s.id),['A','C','B','D']);});
test('returns null for unreachable destination',()=>assert.equal(reconstructPath(floydWarshall(vertices,edges),'D','A'),null));
test('blocked route removes its directed connections',()=>{const r=floydWarshall(vertices,edges,new Set(['R2']));assert.equal(reconstructPath(r,'A','D').cost,6);});
test('supports zero cost and rejects negative edges by ignoring them',()=>{const r=floydWarshall(vertices,[{from:'A',to:'B',weight:0,routeIds:[]},{from:'B',to:'C',weight:-2,routeIds:[]}]);assert.equal(reconstructPath(r,'A','B').cost,0);assert.equal(reconstructPath(r,'A','C'),null);});
