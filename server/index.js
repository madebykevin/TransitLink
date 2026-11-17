import http from 'node:http';
import { Worker } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { floydWarshall, reconstructPath } from './floyd-warshall.js';
import { feeds } from './feeds.js';

const root = fileURLToPath(new URL('../web/', import.meta.url));
let network = null, analysis = null, baselineAnalysis = null, blocked = new Set();
const json = (res, code, value) => { res.writeHead(code, {'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*'}); res.end(JSON.stringify(value)); };
const body = req => new Promise((resolve,reject)=>{const chunks=[];let size=0;req.on('data',c=>{size+=c.length;if(size>100*1024*1024){reject(new Error('Upload exceeds 100 MB'));req.destroy();}else chunks.push(c);});req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject);});
const publicStats = result => ({ durationMs:result.durationMs, relaxations:result.relaxations, vertices:result.vertices.length, complexity:'O(V³) time, O(V²) memory' });
const calculate = (stops, edges, blockedRoutes) => new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./calc-worker.js',import.meta.url));
  worker.once('message',message=>{worker.terminate();message.error?reject(new Error(message.error)):resolve(message.result);});
  worker.once('error',reject);worker.postMessage({stops,edges,blockedRoutes:[...blockedRoutes]});
});
const importInWorker = (archive,options) => new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./gtfs-worker.js',import.meta.url));
  worker.once('message',message=>{worker.terminate();message.error?reject(new Error(message.error)):resolve(message.network);});
  worker.once('error',reject);worker.postMessage({archive:new Uint8Array(archive),options});
});

// API local: importação de feeds, análise, caminhos e matriz de distâncias.
const server = http.createServer(async (req,res)=>{
  try {
    const url = new URL(req.url,'http://127.0.0.1');
    // Lista cidades e importa feed local ou ZIP fornecido pelo usuário.
    if (req.method==='GET' && url.pathname==='/api/feeds') return json(res,200,feeds.map(({file,...feed})=>feed));
    if (req.method==='POST' && (url.pathname==='/api/import'||url.pathname==='/api/curitiba'||url.pathname==='/api/bundled')) {
      const feed=url.pathname==='/api/import'?null:feeds.find(f=>f.id===(url.pathname==='/api/curitiba'?'curitiba':url.searchParams.get('city')));
      if(url.pathname!=='/api/import'&&!feed) return json(res,404,{error:'Cidade não disponível.'});
      const maxStops=Number(url.searchParams.get('maxStops')||600),serviceDate=url.searchParams.get('serviceDate')||undefined;
      let archive;
      if(feed) archive=await readFile(new URL(`../data/${feed.file}`,import.meta.url));
      else {
        const raw=await body(req), match=(req.headers['content-type']||'').match(/boundary=(.+)$/); if(!match) return json(res,400,{error:'Upload must use multipart/form-data.'});
        const boundary=Buffer.from(`--${match[1]}`), parts=raw.toString('latin1').split(boundary); const part=parts.find(p=>p.includes('name="file"')); if(!part) return json(res,400,{error:'Choose a GTFS ZIP file.'});
        const start=part.indexOf('\r\n\r\n')+4, end=part.lastIndexOf('\r\n'); archive=Buffer.from(part.slice(start,end),'latin1');
      }
      const source=feed?.source||'GTFS supplied archive';
      network=await importInWorker(archive,{maxStops,serviceDate:serviceDate||'latest',source});
      if(feed) network.network.name=`${feed.name} · recorte GTFS`;
      analysis=null; baselineAnalysis=null; blocked=new Set(); return json(res,200,{network:network.network,stops:network.stops,routes:network.routes,edges:network.edges});
    }
    // Floyd-Warshall calcula somente recortes com até 600 vértices.
    if (req.method==='POST' && url.pathname==='/api/analyze') {
      if(!network) return json(res,409,{error:'Import GTFS first.'});
      if(network.stops.length>600) return json(res,409,{error:'Floyd-Warshall supports up to 600 stops. This full-feed option is for visualization only.'});
      const data=JSON.parse((await body(req)).toString()||'{}'); blocked=new Set(data.blockedRoutes||[]); analysis=await calculate(network.stops,network.edges,blocked); if(!blocked.size)baselineAnalysis=analysis;
      return json(res,200,{stats:publicStats(analysis),blockedRoutes:[...blocked]});
    }
    // Consulta caminho, destinos alcançáveis e bloco da matriz calculada.
    if (req.method==='GET' && url.pathname==='/api/route') {
      if(!analysis) return json(res,409,{error:'Run Floyd-Warshall first.'}); const from=url.searchParams.get('from'),to=url.searchParams.get('to'),result=reconstructPath(analysis,from,to),baseline=baselineAnalysis?reconstructPath(baselineAnalysis,from,to):null;
      const comparison=baseline?{reachable:!!baseline,cost:baseline?.cost??null,deltaMeters:result&&baseline?Math.round(result.cost-baseline.cost):null}:null;
      if(!result) return json(res,200,{reachable:false,comparison}); return json(res,200,{reachable:true,...result,comparison,stops:result.stops.map(s=>({id:s.id,name:s.name,lat:s.lat,lon:s.lon})),routes:result.routeIds.map(id=>network.routes.find(r=>r.id===id)||{id,name:id})});
    }
    if (req.method==='GET' && url.pathname==='/api/destinations') {
      if(!analysis) return json(res,409,{error:'Run Floyd-Warshall first.'});
      const from=url.searchParams.get('from'),index=analysis.index.get(from);
      if(index===undefined) return json(res,400,{error:'Origin not found.'});
      const stops=network.stops.filter((stop,i)=>i!==index&&Number.isFinite(analysis.dist[index][i]));
      return json(res,200,{stops});
    }
    if (req.method==='GET' && url.pathname==='/api/matrix') {
      if(!analysis) return json(res,409,{error:'Run Floyd-Warshall first.'}); const offset=Math.max(0,Number(url.searchParams.get('offset'))||0),limit=40;
      return json(res,200,{stops:network.stops.slice(offset,offset+limit).map(s=>({id:s.id,name:s.name})), rows:Array.from({length:Math.min(limit,network.stops.length-offset)},(_,a)=>Array.from({length:Math.min(limit,network.stops.length-offset)},(_,b)=>{const d=analysis.dist[offset+a][offset+b];return Number.isFinite(d)?Math.round(d):null;})),offset,total:network.stops.length});
    }
    if (req.method==='GET' && url.pathname==='/api/network') return json(res,200,network?{...network.network,routes:network.routes,stops:network.stops}:null);
    const decoded=decodeURIComponent(url.pathname), file=decoded==='/'?'index.html':decoded.slice(1), path=resolve(root,file);
    if(path!==resolve(root,'index.html') && !path.startsWith(resolve(root)+sep)) return json(res,403,{error:'Forbidden.'});
    const data=await readFile(path); const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'}; res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream'});res.end(data);
  } catch(error){json(res,400,{error:error.message||'Request failed.'});}
});
const port=Number(process.env.TRANSITLINK_PORT||4173);
server.listen(port,'127.0.0.1',()=>console.log(`TransitLink running at http://127.0.0.1:${server.address().port}`));
