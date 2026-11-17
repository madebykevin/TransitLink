import { unzipSync, strFromU8 } from 'fflate';

// Leitor CSV que preserva campos entre aspas e cabeçalhos com BOM.
function* csvRows(text) {
  let headers=null,row=[],field='',quoted=false;
  const emit=()=>{row.push(field.replace(/\r$/,''));field='';if(!headers){headers=row.map((h,i)=>i===0?h.replace(/^\uFEFF/,''):h);row=[];return null;}const values=row;row=[];if(values.every(v=>v===''))return null;return Object.fromEntries(headers.map((h,i)=>[h,values[i]??'']));};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}
    else if(c==='"')quoted=true;
    else if(c===','){row.push(field);field='';}
    else if(c==='\n'){const value=emit();if(value)yield value;}
    else field+=c;
  }
  if(field||row.length){const value=emit();if(value)yield value;}
}
const csv=text=>[...csvRows(text)];
const num=v=>{if(v===undefined||v===null||String(v).trim()==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const rad=n=>n*Math.PI/180;
const haversine=(a,b)=>{const dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon),x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));};
const validDate=s=>{if(!/^\d{8}$/.test(s||''))return false;const formatted=`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`,parsed=new Date(`${formatted}T00:00:00Z`);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===formatted;};
const toGtfsDate=s=>s.replaceAll('-','');
const localToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()).replaceAll('-','');

// Encontra a data de serviço mais recente, respeitando calendários e exceções.
export function latestServiceDate(files, today=localToday()) {
  const rows = name => {
    const key=Object.keys(files).find(k=>k.toLowerCase()===name||k.toLowerCase().endsWith(`/${name}`));
    return key?csv(strFromU8(files[key])):[];
  };
  const routes=new Set(rows('routes.txt').map(r=>r.route_id));
  const services=new Set(rows('trips.txt').filter(t=>routes.has(t.route_id)).map(t=>t.service_id));
  const exceptions=rows('calendar_dates.txt');
  const removed=new Set(exceptions.filter(e=>e.exception_type==='2').map(e=>`${e.service_id}:${e.date}`));
  let latest='';
  for(const e of exceptions) if(e.exception_type==='1'&&services.has(e.service_id)&&validDate(e.date)&&e.date<=today&&e.date>latest) latest=e.date;
  const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  for(const c of rows('calendar.txt')) {
    if(!services.has(c.service_id)||!validDate(c.start_date)||!validDate(c.end_date)||!weekdays.some(day=>c[day]==='1')) continue;
    const end=c.end_date<today?c.end_date:today;
    const cursor=new Date(`${end.slice(0,4)}-${end.slice(4,6)}-${end.slice(6,8)}T00:00:00Z`);
    while(true) {
      const date=cursor.toISOString().slice(0,10).replaceAll('-','');
      if(date<c.start_date||date<=latest) break;
      if(c[weekdays[cursor.getUTCDay()]]==='1'&&!removed.has(`${c.service_id}:${date}`)) { latest=date; break; }
      cursor.setUTCDate(cursor.getUTCDate()-1);
    }
  }
  if(!latest) throw new Error('Nenhum serviço GTFS disponível até hoje.');
  return `${latest.slice(0,4)}-${latest.slice(4,6)}-${latest.slice(6,8)}`;
}

// Obtém serviços ativos na data, aplicando exceções depois do calendário semanal.
function activeServiceIds(files,date){
  const hasCalendar=Object.keys(files).some(k=>k.toLowerCase().endsWith('calendar.txt'));
  const hasDates=Object.keys(files).some(k=>k.toLowerCase().endsWith('calendar_dates.txt'));
  if(!hasCalendar&&!hasDates)throw new Error('GTFS requires calendar.txt or calendar_dates.txt to choose service date.');
  const weekday=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T00:00:00Z`).getUTCDay()];
  const active=new Set();
  const calendarKey=Object.keys(files).find(k=>k.toLowerCase().endsWith('calendar.txt'));
  if(calendarKey)for(const c of csv(strFromU8(files[calendarKey])))if(c.start_date<=date&&date<=c.end_date&&c[weekday]==='1')active.add(c.service_id);
  const datesKey=Object.keys(files).find(k=>k.toLowerCase().endsWith('calendar_dates.txt'));
  if(datesKey)for(const c of csv(strFromU8(files[datesKey])))if(c.date===date){if(c.exception_type==='1')active.add(c.service_id);else if(c.exception_type==='2')active.delete(c.service_id);}
  return active;
}

// Seleciona área geográfica compacta para manter o cálculo dentro do limite.
function compactRegion(stops,limit){
  if(stops.length<=limit)return {selected:stops,center:null};
  const stride=Math.max(1,Math.ceil(stops.length/500));let best=null;
  for(let c=0;c<stops.length;c+=stride){
    const center=stops[c], cos=Math.cos(rad(center.lat));
    const ranked=stops.map(s=>{const dx=(s.lon-center.lon)*cos,dy=s.lat-center.lat;return {s,d:dx*dx+dy*dy};}).sort((a,b)=>a.d-b.d).slice(0,limit);
    const score=ranked.reduce((sum,x)=>sum+x.d,0);
    if(!best||score<best.score)best={score,selected:ranked.map(x=>x.s),center};
  }
  return best;
}

// Converte arquivos GTFS em paradas, linhas e arestas dirigidas com peso Haversine.
// maxStops acima de 600 serve apenas para visualização integral; análise continua limitada.
export function importGtfs(buffer,{maxStops=600,serviceDate='latest',source='GTFS supplied archive'}={}){
  if(!Number.isInteger(maxStops)||maxStops<2||maxStops>10000)throw new Error('GTFS view must contain 2–10,000 stops. Floyd-Warshall analysis is limited to 600 stops.');
  const files=unzipSync(new Uint8Array(buffer));
  if(serviceDate==='latest') serviceDate=latestServiceDate(files);
  const file=name=>{const key=Object.keys(files).find(k=>k.toLowerCase().endsWith(`/${name}`)||k.toLowerCase()===name);if(!key)throw new Error(`GTFS file missing: ${name}`);return files[key];};
  const date=toGtfsDate(serviceDate);if(!validDate(date))throw new Error('Service date must use YYYY-MM-DD.');
  const stops=csv(strFromU8(file('stops.txt'))).map(s=>({id:s.stop_id,name:s.stop_name||s.stop_id,lat:num(s.stop_lat),lon:num(s.stop_lon)})).filter(s=>s.id&&s.lat!==null&&s.lon!==null&&s.lat>=-90&&s.lat<=90&&s.lon>=-180&&s.lon<=180);
  if(stops.length<2)throw new Error('GTFS must contain at least two stops with valid coordinates.');
  const region=compactRegion(stops,maxStops),selected=region.selected,byId=new Map(selected.map(s=>[s.id,s]));
  const allRoutes=new Map(csv(strFromU8(file('routes.txt'))).map(r=>[r.route_id,{id:r.route_id,name:r.route_short_name||r.route_long_name||r.route_id,type:r.route_type}]));
  const services=activeServiceIds(files,date),trips=new Map(csv(strFromU8(file('trips.txt'))).filter(t=>services.has(t.service_id)&&allRoutes.has(t.route_id)).map(t=>[t.trip_id,t.route_id]));
  if(!trips.size)throw new Error(`No active trips found for ${serviceDate}. Choose another service date.`);
  const stopTimesKey=Object.keys(files).find(k=>k.toLowerCase().endsWith('/stop_times.txt')||k.toLowerCase()==='stop_times.txt');
  const sequences=new Map();
  for(const st of csvRows(strFromU8(files[stopTimesKey]))){const routeId=trips.get(st.trip_id),seq=num(st.stop_sequence);if(!routeId||seq===null)continue;const list=sequences.get(st.trip_id)||[];list.push([st.stop_id,seq]);sequences.set(st.trip_id,list);}
  const edges=new Map();
  for(const [tripId,list] of sequences){list.sort((a,b)=>a[1]-b[1]);const routeId=trips.get(tripId);for(let i=0;i<list.length-1;i++){
    const from=byId.get(list[i][0]),to=byId.get(list[i+1][0]);if(!from||!to||from.id===to.id)continue;
    const key=`${from.id}\0${to.id}`,weight=haversine(from,to),old=edges.get(key);
    if(!old)edges.set(key,{from:from.id,to:to.id,weight,routeIds:[routeId]});else if(!old.routeIds.includes(routeId))old.routeIds.push(routeId);
  }}
  if(!edges.size)throw new Error(`No active consecutive-stop connections in selected area for ${serviceDate}.`);
  const usedRoutes=new Set([...edges.values()].flatMap(e=>e.routeIds));
  const agencyKey=Object.keys(files).find(k=>k.toLowerCase().endsWith('/agency.txt')||k.toLowerCase()==='agency.txt'),agency=agencyKey?csv(strFromU8(files[agencyKey]))[0]?.agency_name:null;
  return {network:{name:agency?`${agency} · recorte GTFS`:'GTFS · recorte geográfico',source,serviceDate,stopCount:selected.length,sourceStopCount:stops.length,routeCount:usedRoutes.size,connectionCount:edges.size,subsetCenter:region.center?{lat:region.center.lat,lon:region.center.lon}:null},stops:selected,routes:[...usedRoutes].map(id=>allRoutes.get(id)),edges:[...edges.values()]};
}
