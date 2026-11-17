import { parentPort } from 'node:worker_threads';
import { importGtfs } from './gtfs.js';

// Importa e valida ZIP GTFS em worker separado.
parentPort.on('message',({archive,options})=>{
  try{parentPort.postMessage({network:importGtfs(archive,options)});}
  catch(error){parentPort.postMessage({error:error.message});}
});
