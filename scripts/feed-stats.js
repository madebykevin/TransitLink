import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';

const archive = process.argv[2];
if (!archive) throw new Error('Usage: node scripts/feed-stats.js <feed.zip>');
const files=unzipSync(new Uint8Array(await readFile(archive)));
for(const name of ['agency.txt','stops.txt','routes.txt','trips.txt','stop_times.txt','calendar.txt','calendar_dates.txt']){
  const path=Object.keys(files).find(k=>k.toLowerCase().endsWith(`/${name}`)||k.toLowerCase()===name);
  if(path)console.log(`${name}: ${strFromU8(files[path]).trimEnd().split(/\r?\n/).length-1} registros`);
}
