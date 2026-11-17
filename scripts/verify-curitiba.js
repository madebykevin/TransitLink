import { readFile } from 'node:fs/promises';
import { importGtfs } from '../server/gtfs.js';
import { floydWarshall, reconstructPath } from '../server/floyd-warshall.js';

const date=process.argv[2]||'2026-11-12';
const archive=await readFile(new URL('../data/curitiba-urbs-gtfs.zip',import.meta.url));
for(const maxStops of [180,360,600]){
  const graph=importGtfs(archive,{maxStops,serviceDate:date,source:'URBS GTFS archive'});
  const result=floydWarshall(graph.stops,graph.edges);let reachableOrderedPairs=0;
  for(const row of result.dist)for(const value of row)if(Number.isFinite(value))reachableOrderedPairs++;
  let sample=null;outer:for(let i=0;i<graph.stops.length;i++)for(let j=0;j<graph.stops.length;j++)if(i!==j&&Number.isFinite(result.dist[i][j])){const route=reconstructPath(result,graph.stops[i].id,graph.stops[j].id);sample={from:graph.stops[i].id,to:graph.stops[j].id,costMeters:Math.round(route.cost),stopCount:route.stops.length};break outer;}
  console.log(JSON.stringify({maxStops,serviceDate:date,stopCount:graph.stops.length,sourceStopCount:graph.network.sourceStopCount,routeCount:graph.routes.length,connectionCount:graph.edges.length,reachableOrderedPairs,floydWarshallMs:Number(result.durationMs.toFixed(2)),sample}));
}
