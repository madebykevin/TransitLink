import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8, unzipSync } from 'fflate';
import { importGtfs, latestServiceDate } from '../server/gtfs.js';

const feed = zipSync({
  'stops.txt': strToU8('\uFEFFstop_id,stop_name,stop_lat,stop_lon\nA,Alpha,-23.5,-46.6\nB,"Beta, Central",-23.51,-46.61\nC,Gamma,-23.52,-46.62\nBAD,Missing,,,\n'),
  'routes.txt': strToU8('route_id,route_short_name,route_type\nR1,10,3\nR2,20,3\n'),
  'trips.txt': strToU8('route_id,service_id,trip_id\nR1,S1,T1\nR2,S1,T2\n'),
  'calendar.txt': strToU8('service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nS1,1,1,1,1,1,1,1,20200101,20300101\n'),
  'stop_times.txt': strToU8('trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,08:00:00,08:00:00,A,1\nT1,08:05:00,08:05:00,B,2\nT2,08:01:00,08:01:00,A,1\nT2,08:07:00,08:07:00,B,2\nT2,08:12:00,08:12:00,C,3\n')
});

test('imports GTFS stops and directed consecutive trip connections',()=>{
  const result=importGtfs(feed,{serviceDate:'2026-11-11'});assert.equal(result.stops.length,3);assert.equal(result.edges.length,2);
  assert.deepEqual(result.edges[0].routeIds,['R1','R2']);assert.equal(result.edges[0].from,'A');assert.equal(result.edges[0].to,'B');
  assert.ok(result.edges[0].weight>0);
});
test('rejects unsupported subset size before all-pairs calculation',()=>assert.throws(()=>importGtfs(feed,{maxStops:601}),/2–600 stops/));
test('rejects invalid calendar dates',()=>assert.throws(()=>importGtfs(feed,{serviceDate:'2026-11-31'}),/YYYY-MM-DD/));

test('latest service never selects future days and respects removals',()=>{
  const files=unzipSync(feed);
  files['calendar_dates.txt']=strToU8('service_id,date,exception_type\nS1,20261114,2\nS1,20261115,1\n');
  assert.equal(latestServiceDate(files,'20261114'),'2026-11-13');
});

test('historical calendar chooses last operating weekday, not end date',()=>{
  const files=unzipSync(feed);
  files['calendar.txt']=strToU8('service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nS1,1,1,1,1,1,0,0,20250901,20250928\n');
  assert.equal(latestServiceDate(files,'20261114'),'2025-09-26');
});

test('date-only feeds ignore services without trips and choose latest service as of supplied date',()=>{
  const files=unzipSync(feed);
  delete files['calendar.txt'];
  files['calendar_dates.txt']=strToU8('service_id,date,exception_type\nS1,20250920,1\nUNUSED,20261114,1\nS1,20261115,1\n');
  assert.equal(latestServiceDate(files,'20261114'),'2025-09-20');
  assert.equal(importGtfs(zipSync(files),{serviceDate:latestServiceDate(files,'20261114')}).network.serviceDate,'2025-09-20');
});
