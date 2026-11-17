import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { zipSync, strToU8 } from 'fflate';

const feed=zipSync({
  'stops.txt':strToU8('stop_id,stop_name,stop_lat,stop_lon\nA,Alpha,-23.5,-46.6\nB,Beta,-23.51,-46.61\nC,Gamma,-23.52,-46.62\n'),
  'routes.txt':strToU8('route_id,route_short_name,route_type\nR1,10,3\n'),
  'trips.txt':strToU8('route_id,service_id,trip_id\nR1,S1,T1\n'),
  'calendar.txt':strToU8('service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nS1,1,1,1,1,1,1,1,20200101,20300101\n'),
  'stop_times.txt':strToU8('trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,08:00:00,08:00:00,A,1\nT1,08:05:00,08:05:00,B,2\nT1,08:10:00,08:10:00,C,3\n')
});
let child, base;
before(async()=>{
  child=spawn(process.execPath,['server/index.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,TRANSITLINK_PORT:'0'},stdio:['ignore','pipe','pipe']});
  let output='';
  base=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('TransitLink server did not start.')),10000);
    child.stdout.on('data',chunk=>{output+=chunk.toString();const match=output.match(/http:\/\/127\.0\.0\.1:(\d+)/);if(match){clearTimeout(timeout);resolve(`http://127.0.0.1:${match[1]}`);}});
    child.once('error',reject);child.once('exit',code=>{if(!base)reject(new Error(`TransitLink exited early (${code}): ${output}`));});
  });
});
after(async()=>{if(child&&!child.killed){child.kill();await once(child,'exit');}});

test('local API imports feed, calculates route, and returns matrix',async()=>{
  const page=await fetch(base);assert.equal(page.status,200);const html=await page.text();assert.match(html,/TransitLink/);assert.match(html,/id="map"/);assert.match(html,/vendor\/leaflet\.css/);
  const leaflet=await fetch(`${base}/vendor/leaflet.js`);assert.equal(leaflet.status,200);assert.match(await leaflet.text(),/1\.9\.4/);
  const leafletCss=await fetch(`${base}/vendor/leaflet.css`);assert.equal(leafletCss.status,200);assert.match(await leafletCss.text(),/leaflet-container/);
  const form=new FormData();form.append('file',new Blob([feed]),'fixture.zip');
  const imported=await fetch(`${base}/api/import?maxStops=600&serviceDate=2026-11-11`,{method:'POST',body:form});assert.equal(imported.status,200);const data=await imported.json();assert.equal(data.network.stopCount,3);assert.equal(data.edges.length,2);
  const analyzed=await fetch(`${base}/api/analyze`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(analyzed.status,200);assert.equal((await analyzed.json()).stats.vertices,3);
  const route=await fetch(`${base}/api/route?from=A&to=C`);const result=await route.json();assert.equal(result.reachable,true);assert.deepEqual(result.stops.map(s=>s.id),['A','B','C']);
  const matrix=await fetch(`${base}/api/matrix`);assert.equal((await matrix.json()).rows.length,3);
  const curitiba=await fetch(`${base}/api/curitiba?maxStops=180&serviceDate=2026-11-12`,{method:'POST'});assert.equal(curitiba.status,200);const real=await curitiba.json();assert.equal(real.network.sourceStopCount,7235);assert.equal(real.network.stopCount,180);
  const realAnalysis=await fetch(`${base}/api/analyze`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(realAnalysis.status,200);
  const realRoute=await fetch(`${base}/api/route?from=103503&to=103502`),realPath=await realRoute.json();assert.equal(realPath.reachable,true);assert.equal(realPath.stops.length,13);assert.equal(Math.round(realPath.cost),3752);
  assert.deepEqual(realPath.comparison,{reachable:true,cost:realPath.cost,deltaMeters:0});
  const blocked=await fetch(`${base}/api/analyze`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({blockedRoutes:realPath.routeIds})});assert.equal(blocked.status,200);
  const compared=await (await fetch(`${base}/api/route?from=103503&to=103502`)).json();assert.equal(compared.comparison.reachable,true);if(compared.reachable)assert.ok(compared.cost>=realPath.cost);
});
