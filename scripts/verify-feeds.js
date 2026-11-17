import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { latestServiceDate } from '../server/gtfs.js';
import { feeds as bundledFeeds } from '../server/feeds.js';

const server = spawn(process.execPath, ['server/index.js'], { env:{...process.env, TRANSITLINK_PORT:'0'}, stdio:['ignore','pipe','inherit'] });
try {
  const [output] = await once(server.stdout, 'data');
  const base = String(output).match(/http:\/\/127\.0\.0\.1:\d+/)[0];
  const request = async (path, body) => {
    const response = await fetch(base + path, body === undefined ? {} : {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)});
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    return result;
  };
  const feeds = (await request('/api/feeds')).filter(feed => !process.argv[2] || process.argv[2]==='all' || feed.id === process.argv[2]);
  assert.ok(feeds.length, 'No matching bundled city');
  for (const feed of feeds) {
    const archive=await readFile(new URL(`../data/${bundledFeeds.find(f=>f.id===feed.id).file}`,import.meta.url));
    const expectedDate=latestServiceDate(unzipSync(archive));
    for (const maxStops of (process.argv[3]?[Number(process.argv[3])]:[180,360,600])) {
    const graph = await request(`/api/bundled?city=${feed.id}&maxStops=${maxStops}`, {});
    assert.equal(graph.network.serviceDate, expectedDate);
    assert.ok(graph.stops.length <= maxStops && graph.edges.length > 0);
    const analysis = await request('/api/analyze', {});
    assert.equal(analysis.stats.vertices, graph.stops.length);
    const edge = graph.edges[0];
    const route = await request(`/api/route?from=${encodeURIComponent(edge.from)}&to=${encodeURIComponent(edge.to)}`);
    assert.ok(route.reachable && route.stops.length >= 2 && Number.isFinite(route.cost));
    console.log(JSON.stringify({city:feed.id,date:graph.network.serviceDate,maxStops,stops:graph.stops.length,sourceStops:graph.network.sourceStopCount,edges:graph.edges.length,routeStops:route.stops.length}));
    }
  }
  const unknown = await fetch(base + '/api/bundled?city=unknown', {method:'POST'});
  assert.equal(unknown.status,404);
} finally {
  server.kill();
}
