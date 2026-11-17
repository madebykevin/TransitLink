// Calcula menores distâncias entre todos os pares no grafo direcionado.
export function floydWarshall(vertices, edges, blockedRoutes = new Set()) {
  const n = vertices.length;
  if (!n || n > 600) throw new Error(`GRAFO TEM QUE CONTER 1–600 PARADAS; RECEBIDAS ${n}. SELECIONE UMA GTFS MENOR.`);
  const index = new Map(vertices.map((v, i) => [v.id, i]));
  const dist = Array.from({ length: n }, (_, i) => Float64Array.from({ length: n }, (_, j) => i === j ? 0 : Infinity));
  const next = Array.from({ length: n }, () => new Int32Array(n).fill(-1));
  const edgeFor = Array.from({ length: n }, () => Array(n).fill(null));
  for (const edge of edges) {
    const availableRoutes = edge.routeIds?.length ? edge.routeIds.filter(id => !blockedRoutes.has(id)) : [];
    if (edge.routeIds?.length && !availableRoutes.length) continue;
    const i = index.get(edge.from), j = index.get(edge.to);
    if (i === undefined || j === undefined || i === j || !Number.isFinite(edge.weight) || edge.weight < 0) continue;
    if (edge.weight < dist[i][j]) { dist[i][j] = edge.weight; next[i][j] = j; edgeFor[i][j] = { ...edge, routeIds: availableRoutes }; }
  }
  const start = performance.now();
  let relaxations = 0;
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
    if (!Number.isFinite(dist[i][k])) continue;
    for (let j = 0; j < n; j++) {
      if (!Number.isFinite(dist[k][j])) continue;
      const candidate = dist[i][k] + dist[k][j];
      if (candidate < dist[i][j]) { dist[i][j] = candidate; next[i][j] = next[i][k]; relaxations++; }
    }
  }
  return { dist, next, edgeFor, index, durationMs: performance.now() - start, relaxations, vertices };
}

// Reconstrói a sequência de vértices usando a matriz `next` do cálculo.
export function reconstructPath(result, fromId, toId) {
  const i = result.index.get(fromId), target = result.index.get(toId);
  if (i === undefined || target === undefined) throw new Error('ORIGEM OU DESTINO NÃO FORAM ENCONTRADOS.');
  if (!Number.isFinite(result.dist[i][target])) return null;
  const indices = [i]; let current = i;
  while (current !== target) {
    current = result.next[current][target];
    if (current < 0 || indices.length > result.vertices.length) throw new Error('RECOSTRUÇÃO DO CAMINHO ALHOU');
    indices.push(current);
  }
  const stops = indices.map(index => result.vertices[index]);
  const routeIds = [];
  for (let x = 0; x < indices.length - 1; x++) {
    const e = result.edgeFor[indices[x]][indices[x + 1]];
    const route = e?.routeIds.find(id => id === routeIds.at(-1)) || e?.routeIds[0];
    if (route && routeIds.at(-1) !== route) routeIds.push(route);
  }
  return { stops, cost: result.dist[i][target], routeIds, transfers: Math.max(0, routeIds.length - 1) };
}
