import { parentPort } from 'node:worker_threads';
import { floydWarshall } from './floyd-warshall.js';

// Recebe rede e interrupções, executa algoritmo fora da thread principal.
parentPort.on('message', ({ stops, edges, blockedRoutes }) => {
  try { parentPort.postMessage({ result: floydWarshall(stops, edges, new Set(blockedRoutes)) }); }
  catch (error) { parentPort.postMessage({ error: error.message }); }
});
