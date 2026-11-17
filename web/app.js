const $ = id => document.getElementById(id);

// Estado da rede, consulta atual e camadas do mapa.
let network = null;
let fullNetworkView = false;
let analyzed = false;
let offset = 0;
let activePath = [];
let previewRouteId = null;
let leafletMap = null;
let pathLayer = null;
let previewLayer = null;
let networkLayer = null;
let stopsLayer = null;
let mapNeedsFit = true;

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Falha na requisição.');
  return data;
}

// Protege nomes e identificadores antes de montar conteúdo HTML.
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
}


async function loadNetwork(path, button, request) {
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = 'Importando GTFS…';
  try {
    network = await api(path, request);
    renderNetwork();
    $('panel-title').textContent = network.stops.length > 600 ? 'Curitiba · feed completo · visualização' : network.network.name;
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}


// Carrega catálogo de cidades e coordena a importação do feed selecionado.
api('/api/feeds').then(feeds => {
  $('city-select').innerHTML = feeds.map(feed => `<option value="${escapeHtml(feed.id)}">${escapeHtml(feed.name)}</option>`).join('');
  $('city-select').disabled = false;
  $('city-button').disabled = false;
  updateFullFeedOption();
}).catch(() => { $('city-select').innerHTML = '<option>Cidades indisponíveis</option>'; });

function updateFullFeedOption() {
  const option = $('full-curitiba-option');
  const isCuritiba = $('city-select').value === 'curitiba';
  option.hidden = !isCuritiba;
  if (!isCuritiba && $('subset-size').value === '10000') $('subset-size').value = '600';
}
$('city-select').addEventListener('change', updateFullFeedOption);

$('city-button').addEventListener('click', () => {
  const query = new URLSearchParams({ city:$('city-select').value, maxStops:$('subset-size').value });
  loadNetwork(`/api/bundled?${query}`, $('city-button'), { method:'POST' });
});

$('route-list').addEventListener('change', () => {
  analyzed = false;
  activePath = [];
  $('metrics').innerHTML = '';
  $('matrix-table').innerHTML = '';
  $('matrix-caption').textContent = 'Cenário alterado. Execute Floyd-Warshall novamente.';
  $('matrix-prev').disabled = true;
  $('matrix-next').disabled = true;
  $('result').classList.add('hidden');
  $('find-button').disabled = true;
  $('reset-route-button').disabled = true;
  updateDestinations();
  drawMap();
});

function previewInterruption(event) {
  const input = event.target.closest('label')?.querySelector('input[type="checkbox"]') || event.target.closest('input[type="checkbox"]');
  const routeId = input?.dataset.route || input?.value;
  if (!routeId || routeId === previewRouteId) return;
  previewRouteId = routeId;
  drawInterruptionPreview();
}
function clearInterruptionPreview(event) {
  const label = event.target.closest('label');
  const input = label?.querySelector('input[type="checkbox"]') || event.target.closest('input[type="checkbox"]');
  const routeId = input?.dataset.route || input?.value;
  if (!input || routeId !== previewRouteId || label?.contains(event.relatedTarget) || input.contains(event.relatedTarget)) return;
  previewRouteId = null;
  drawInterruptionPreview();
}
$('route-list').addEventListener('mouseover', previewInterruption);
$('route-list').addEventListener('mouseout', clearInterruptionPreview);

// Prepara seletores, controles e resumo após a importação da rede.
function renderNetwork() {
  offset = 0;
  $('matrix-table').innerHTML = '';
  $('matrix-caption').textContent = 'Execute o algoritmo para consultar a matriz.';
  $('matrix-prev').disabled = true;
  $('matrix-next').disabled = true;
  analyzed = false;
  activePath = [];
  mapNeedsFit = true;
  $('result').classList.add('hidden');
  $('metrics').innerHTML = '';
  $('find-button').disabled = true;
  fullNetworkView = network.stops.length > 600;
  $('network-summary').classList.remove('hidden');
  $('network-summary').innerHTML = `<b>${network.network.stopCount.toLocaleString('pt-BR')}</b> ${fullNetworkView ? 'paradas no feed completo' : 'vértices ativos no recorte'}<br><b>${network.network.sourceStopCount.toLocaleString('pt-BR')}</b> paradas com coordenadas<br><b>${network.network.routeCount.toLocaleString('pt-BR')}</b> linhas · <b>${network.network.connectionCount.toLocaleString('pt-BR')}</b> conexões dirigidas<br>Serviço: ${escapeHtml(network.network.serviceDate)}<br><small>${escapeHtml(network.network.source)}</small>`;
  $('route-list').classList.remove('muted');
  $('route-list').innerHTML = fullNetworkView
    ? '<p class="full-view-note">Grafo completo carregado para visualização. Interrupções e cálculo ficam disponíveis nos recortes de até 600 paradas.</p>'
    : network.routes.map(route => `<label class="route-item"><input type="checkbox" value="${escapeHtml(route.id)}"><span>${escapeHtml(route.name)}</span></label>`).join('');
  $('origin').innerHTML = '<option value="">Selecione uma origem</option>' + network.stops.map(stop => `<option value="${escapeHtml(stop.id)}">${escapeHtml(stop.name)} · ${escapeHtml(stop.id)}</option>`).join('');
  $('origin').value = '';
  $('origin').disabled = fullNetworkView;
  $('destination').innerHTML = '<option value="">Selecione um destino</option>';
  $('destination').value = '';
  $('destination').disabled = true;
  updateDestinations();
  $('network-view').classList.remove('hidden');
  $('network-view').classList.toggle('full-network-view', fullNetworkView);
  $('empty-state').classList.add('hidden');
  $('analyze-button').disabled = fullNetworkView;
  $('analyze-button').textContent = fullNetworkView ? 'Apenas visualização do grafo' : 'Executar Floyd-Warshall';
  drawMap();
}

$('analyze-button').addEventListener('click', async () => {
  const button = $('analyze-button');
  const blockedRoutes = [...$('route-list').querySelectorAll('input:checked')].map(input => input.value);
  button.disabled = true;
  button.textContent = 'Calculando…';
  activePath = [];
  $('result').classList.add('hidden');
  try {
    const result = await api('/api/analyze', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({blockedRoutes}) });
    analyzed = true;
    await updateDestinations();
    $('metrics').innerHTML = [['VÉRTICES',result.stats.vertices],['TEMPO DE CÁLCULO',`${result.stats.durationMs.toFixed(1)} ms`],['RELAXAMENTOS',result.stats.relaxations.toLocaleString('pt-BR')]].map(([label,value]) => `<div class="metric"><span>${label}</span><b>${value}</b></div>`).join('');
    $('matrix-caption').textContent = `${result.stats.complexity}. Intervalo ${offset + 1}–${Math.min(offset + 40, result.stats.vertices)}.`;
    await loadMatrix();
    drawMap();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = blockedRoutes.length ? 'Recalcular cenário' : 'Executar Floyd-Warshall';
  }
});

// Consulta caminho já calculado e apresenta distância, trechos, pesos e linhas.
$('find-button').addEventListener('click', async () => {
  if (!$('destination').value || $('origin').value === $('destination').value) return;
  try {
    const result = await api(`/api/route?from=${encodeURIComponent($('origin').value)}&to=${encodeURIComponent($('destination').value)}`);
    const box = $('result');
    box.classList.remove('hidden');
    let comparison = '';
    if (result.comparison) {
      if (result.comparison.reachable && !result.reachable) comparison = '<br><strong>Interrupção removeu conectividade</strong> para este par.';
      else if (result.comparison.reachable && result.reachable && result.comparison.deltaMeters !== 0) comparison = `<br>Variação contra cenário base: ${result.comparison.deltaMeters > 0 ? '+' : ''}${result.comparison.deltaMeters.toLocaleString('pt-BR')} m.`;
      else comparison = '<br>Custo igual ao cenário base.';
    }
    if (!result.reachable) {
      box.classList.remove('route-result');
      box.innerHTML = `<strong>Sem caminho disponível.</strong> As paradas não estão conectadas neste cenário.${comparison}`;
      activePath = [];
    } else {
      box.classList.add('route-result');
      activePath = result.stops.map(stop => stop.id);
      const kilometers = result.cost >= 1000;
      const distance = kilometers
        ? `${(result.cost / 1000).toLocaleString('pt-BR', { maximumFractionDigits:1 })} km`
        : `${Math.round(result.cost).toLocaleString('pt-BR')} m`;
      const stops = result.stops.map((stop, index) => {
        const previous = result.stops[index - 1];
        const edge = previous && network.edges.find(item => item.from === previous.id && item.to === stop.id);
        const segment = edge
          ? `<small class="route-segment-weight">${edge.weight.toLocaleString('pt-BR', { maximumFractionDigits:0 })} m neste trecho</small>`
          : '';
        return `<li class="route-stop${index === 0 ? ' is-origin' : ''}${index === result.stops.length - 1 ? ' is-destination' : ''}"><span class="route-stop-marker" aria-hidden="true"></span><span>${escapeHtml(stop.name)}${segment}</span></li>`;
      }).join('');
      const routes = result.routes.length
        ? result.routes.map(route => `<span class="route-line-chip">${escapeHtml(route.name)}</span>`).join('')
        : '<span class="route-line-chip">Linhas não identificadas</span>';
      box.innerHTML = `<div class="route-result-head"><div><span class="route-result-label">DISTÂNCIA GEOGRÁFICA ESTIMADA</span><strong class="route-distance">${distance}</strong></div><span class="route-transfer-badge">${result.transfers} ${result.transfers === 1 ? 'transferência' : 'transferências'}</span></div><div class="route-summary">${result.stops.length} paradas no percurso</div><ol class="route-stop-list">${stops}</ol><div class="route-lines"><span class="route-section-label">LINHAS</span><div class="route-line-list">${routes}</div></div>${comparison ? `<div class="route-comparison">${comparison.replace(/^<br>/, '')}</div>` : ''}<p class="route-result-note">Distância estimada entre coordenadas das paradas; não representa distância pelas ruas nem tempo de viagem.</p>`;
    }
    drawMap();
  } catch (error) { alert(error.message); }
});

$('origin').addEventListener('change', () => { activePath = []; $('result').classList.add('hidden'); updateDestinations(); drawMap(); });
$('destination').addEventListener('change', () => { activePath = []; $('result').classList.add('hidden'); drawMap(); });
$('reset-route-button').addEventListener('click', () => {
  $('origin').value = '';
  $('destination').innerHTML = '<option value="">Selecione um destino</option>';
  $('destination').value = '';
  $('destination').disabled = true;
  $('find-button').disabled = true;
  $('reset-route-button').disabled = true;
  activePath = [];
  $('result').classList.add('hidden');
  reachableStops = null;
  updateDestinations();
  drawMap();
});
$('matrix-prev').addEventListener('click', () => { offset = Math.max(0, offset - 40); loadMatrix(); });
$('matrix-next').addEventListener('click', () => { offset += 40; loadMatrix(); });

async function loadMatrix() {
  if (!analyzed) return;
  try {
    const matrix = await api(`/api/matrix?offset=${offset}`);
    $('matrix-prev').disabled = offset === 0;
    $('matrix-next').disabled = offset + 40 >= matrix.total;
    $('matrix-caption').textContent = `Paradas ${offset + 1}–${Math.min(offset + 40, matrix.total)} de ${matrix.total}`;
    const header = `<tr><th>Origem \ Destino</th>${matrix.stops.map(stop => `<th title="${escapeHtml(stop.name)}">${escapeHtml(stop.id)}</th>`).join('')}</tr>`;
    const rows = matrix.rows.map((row,index) => `<tr><th title="${escapeHtml(matrix.stops[index].name)}">${escapeHtml(matrix.stops[index].id)}</th>${row.map(value => `<td>${value === null ? '∞' : value.toLocaleString('pt-BR')}</td>`).join('')}</tr>`).join('');
    $('matrix-table').innerHTML = `<table>${header}${rows}</table>`;
  } catch (error) { $('matrix-caption').textContent = error.message; }
}

// Atualiza destinos alcançáveis para a origem escolhida.
let destinationRequest = 0;
let reachableStops = null;
async function updateDestinations() {
  if (!network) return;
  reachableStops = null;
  const select = $('destination'), previous = select.value, origin = $('origin').value, requestId = ++destinationRequest;
  $('find-button').disabled = true;
  $('reset-route-button').disabled = !origin;
  if (!origin) {
    select.innerHTML = '<option value="">Selecione um destino</option>';
    select.value = '';
    select.disabled = true;
    if (leafletMap) drawMap();
    return;
  }
  select.innerHTML = '<option value="">Carregando destinos…</option>';
  select.disabled = true;
  let stops = network.stops.filter(stop => stop.id !== origin);
  if (analyzed) {
    try {
      const result = await api(`/api/destinations?from=${encodeURIComponent(origin)}`);
      if (requestId !== destinationRequest) return;
      stops = result.stops.filter(stop => stop.id !== origin);
      reachableStops = new Set([origin, ...stops.map(stop => stop.id)]);
    } catch (error) {
      if (requestId !== destinationRequest) return;
      stops = [];
      alert(error.message);
    }
  }
  select.innerHTML = `<option value="">${stops.length ? 'Selecione um destino' : 'Nenhum destino alcançável'}</option>` + stops.map(stop => `<option value="${escapeHtml(stop.id)}">${escapeHtml(stop.name)} · ${escapeHtml(stop.id)}</option>`).join('');
  if (stops.some(stop => stop.id === previous)) select.value = previous;
  else select.value = '';
  select.disabled = !stops.length;
  $('find-button').disabled = !analyzed || !stops.length;
  if (leafletMap) drawMap();
}

// Cria mapa Leaflet, camadas e opções de fundo.
function initializeMap() {
  if (leafletMap) return;
  leafletMap = L.map('map', { preferCanvas:true, scrollWheelZoom:true, zoomControl:true, attributionControl:true, maxZoom:19 });
  const satellite = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom:19,
    attribution:'Imagery: Sources <a href="https://www.esri.com/">Esri</a>, DigitalGlobe, GeoEye, i-cubed, USDA FSA, USGS, AEX, Getmapping, Aerogrid, IGN, IGP, swisstopo, GIS User Community'
  });
  const offline = L.gridLayer({ attribution:'Paradas e conexões: feed GTFS importado localmente' });
  offline.createTile = (_coords, done) => {
    const tile = L.DomUtil.create('div', 'offline-map-tile');
    queueMicrotask(() => done(null, tile));
    return tile;
  };
  satellite.addTo(leafletMap);
  leafletMap.attributionControl.setPrefix('Leaflet');
  pathLayer = L.layerGroup().addTo(leafletMap);
  previewLayer = L.layerGroup().addTo(leafletMap);
  networkLayer = L.layerGroup().addTo(leafletMap);
  stopsLayer = L.layerGroup().addTo(leafletMap);
  L.control.layers({'Satélite (internet)':satellite,'Base escura (offline)':offline},{'Conexões GTFS':networkLayer,'Paradas GTFS':stopsLayer},{collapsed:true}).addTo(leafletMap);
  const mapStatus = L.DomUtil.create('div', 'map-status', leafletMap.getContainer());
  mapStatus.setAttribute('aria-live','polite');
  mapStatus.textContent = 'Satélite carrega imagens pela internet';
  satellite.on('tileerror', () => { mapStatus.textContent = 'Imagem indisponível; escolha Base escura (offline) no controle de camadas.'; });
  leafletMap.on('baselayerchange', event => {
    mapStatus.textContent = event.name.includes('Satélite') ? 'Satélite carrega imagens pela internet' : 'Modo offline: paradas e conexões GTFS continuam disponíveis.';
  });
}

// Ações da parada: origem, destino e interrupção de linhas.
function createStopPopup(stop) {
  const popup = document.createElement('div');
  popup.className = 'stop-popup';
  if (fullNetworkView) {
    popup.innerHTML = `<b>${escapeHtml(stop.name)}</b><small>ID ${escapeHtml(stop.id)}</small><small>Parada do feed completo. Para calcular percursos ou testar interrupções, selecione um recorte de até 600 paradas.</small>`;
    return popup;
  }
  const busy = $('analyze-button').disabled || $('city-button').disabled;
  const canSelectDestination = !busy && !$('destination').disabled &&
    [...$('destination').options].some(option => option.value === stop.id);
  const routeIds = new Set(network.edges
    .filter(edge => edge.from === stop.id || edge.to === stop.id)
    .flatMap(edge => edge.routeIds || []));
  const inputs = [...$('route-list').querySelectorAll('input')];
  const routes = network.routes.filter(route => routeIds.has(route.id));
  popup.innerHTML = `<b>${escapeHtml(stop.name)}</b><small>ID ${escapeHtml(stop.id)}</small>
    <div class="stop-popup-actions">
      <button class="button small" data-action="origin" ${busy ? 'disabled' : ''}>Definir origem</button>
      <button class="button small" data-action="destination" ${canSelectDestination ? '' : 'disabled'}>Definir destino</button>
    </div>
    <p>${busy ? 'Aguarde o processamento.' : stop.id === $('origin').value ? 'Esta é a origem atual.' : !canSelectDestination ? 'Destino indisponível para a origem neste cenário.' : 'Selecione esta parada como origem ou destino.'}</p>
    <b>Linhas nesta parada</b>
    <small>Marque para interromper a linha inteira. Depois, recalcule o cenário.</small>
    <div class="stop-popup-routes">${routes.map(route => `<label><input type="checkbox" data-route="${escapeHtml(route.id)}" ${inputs.find(input => input.value === route.id)?.checked ? 'checked' : ''} ${busy ? 'disabled' : ''}><span>${escapeHtml(route.name)}</span></label>`).join('') || '<small>Nenhuma linha neste recorte.</small>'}</div>
    <button class="button secondary" data-action="analyze" ${busy ? 'disabled' : ''}>${analyzed ? 'Recalcular cenário' : 'Executar Floyd-Warshall'}</button>`;
  popup.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action || $('analyze-button').disabled || $('city-button').disabled) return;
    if (action === 'analyze') {
      leafletMap.closePopup();
      $('analyze-button').click();
      return;
    }
    if (action === 'destination' && ($('destination').disabled ||
      ![...$('destination').options].some(option => option.value === stop.id))) return;
    $(action).value = stop.id;
    leafletMap.closePopup();
    $(action).dispatchEvent(new Event('change'));
    if (action === 'origin') $('reset-route-button').disabled = false;
    if (action === 'destination' && !$('find-button').disabled) $('find-button').click();
  });
  popup.addEventListener('change', event => {
    const routeId = event.target.dataset.route;
    if (!routeId || $('analyze-button').disabled || $('city-button').disabled) return;
    const input = inputs.find(item => item.value === routeId);
    if (!input) return;
    input.checked = event.target.checked;
    input.dispatchEvent(new Event('change', { bubbles:true }));
    L.popup().setLatLng([stop.lat, stop.lon]).setContent(createStopPopup(stop)).openOn(leafletMap);
  });
  popup.addEventListener('mouseover', previewInterruption);
  popup.addEventListener('mouseout', clearInterruptionPreview);
  return popup;
}

// Calcula quais vértices e conexões permanecem visíveis no cenário.
function getMapAvailability(edges, blockedRoutes, reachable) {
  const availableEdges = new Set();
  const connectedStops = new Set();
  for (const edge of edges) {
    if (edge.routeIds?.length && edge.routeIds.every(id => blockedRoutes.has(id))) continue;
    connectedStops.add(edge.from);
    connectedStops.add(edge.to);
    if (!reachable || (reachable.has(edge.from) && reachable.has(edge.to))) availableEdges.add(edge);
  }
  return { availableEdges, availableStops:reachable || connectedStops };
}

// Prévia temporária da linha sob o cursor, sem fechar o popup aberto.
function drawInterruptionPreview() {
  if (!network || !leafletMap || !previewLayer) return;
  previewLayer.clearLayers();
  if (!previewRouteId) return;
  const byId = new Map(network.stops.map(stop => [stop.id,stop]));
  const highlightedStops = new Map();
  for (const edge of network.edges) {
    if (!edge.routeIds?.includes(previewRouteId)) continue;
    const from = byId.get(edge.from), to = byId.get(edge.to);
    if (!from || !to) continue;
    L.polyline([[from.lat,from.lon],[to.lat,to.lon]], {
      color:'#111315', weight:13, opacity:.96, interactive:false
    }).addTo(previewLayer);
    L.polyline([[from.lat,from.lon],[to.lat,to.lon]], {
      color:'#ffdc45', weight:8, opacity:1, interactive:false
    }).addTo(previewLayer);
    highlightedStops.set(from.id,from);
    highlightedStops.set(to.id,to);
  }
  for (const stop of highlightedStops.values()) {
    L.circleMarker([stop.lat,stop.lon], {
      radius:7, color:'#111315', weight:3, fillColor:'#ffdc45', fillOpacity:1, interactive:false
    }).addTo(previewLayer);
  }
}

// Desenha rede, rota escolhida e pontos no mapa.
function drawMap() {
  if (!network || !window.L) return;
  initializeMap();
  pathLayer.clearLayers();
  networkLayer.clearLayers();
  stopsLayer.clearLayers();
  const byId = new Map(network.stops.map(stop => [stop.id,stop]));
  const blockedRoutes = new Set([...$('route-list').querySelectorAll('input:checked')].map(input => input.value));
  const { availableEdges, availableStops } = fullNetworkView
    ? { availableEdges:new Set(network.edges), availableStops:new Set(network.stops.map(stop => stop.id)) }
    : getMapAvailability(network.edges, blockedRoutes, analyzed ? reachableStops : null);
  const stopRouteIds = new Map(network.stops.map(stop => [stop.id,new Set()]));
  for (const edge of network.edges) for (const id of edge.routeIds || []) {
    stopRouteIds.get(edge.from)?.add(id);
    stopRouteIds.get(edge.to)?.add(id);
  }
  const activeEdges = new Set();
  for (let index = 1; index < activePath.length; index++) activeEdges.add(`${activePath[index - 1]}\0${activePath[index]}`);
  drawInterruptionPreview();
  for (const edge of network.edges) {
    const from = byId.get(edge.from), to = byId.get(edge.to);
    if (!from || !to) continue;
    if (!availableEdges.has(edge)) continue;
    const active = activeEdges.has(`${edge.from}\0${edge.to}`);
    const coordinates = [[from.lat,from.lon],[to.lat,to.lon]];
    if (active) {
      L.polyline(coordinates, { color:'#08090a', weight:11, opacity:.98, interactive:false }).addTo(pathLayer);
      L.polyline(coordinates, { color:'#ffe04a', weight:5, opacity:1, interactive:false }).addTo(pathLayer);
    } else {
      L.polyline(coordinates, { color:'#b8bec2', weight:2, opacity:.74, interactive:false }).addTo(networkLayer);
    }
  }
  const origin = $('origin').value, destination = $('destination').value, pathStops = new Set(activePath);
  for (const stop of network.stops) {
    const isOrigin = stop.id === origin, isDestination = stop.id === destination, inPath = pathStops.has(stop.id);
    if (!isOrigin && !availableStops.has(stop.id)) continue;
    const marker = L.circleMarker([stop.lat,stop.lon], {
      radius:isOrigin||isDestination?7:inPath?5:4,
      color:'#ffffff', weight:1.5, opacity:1,
      fillColor:isOrigin?'#319cff':isDestination?'#ff786c':inPath?'#f4ae7d':'#a0b3ad',
      fillOpacity:.98
    });
    marker.bindPopup(() => createStopPopup(stop), { maxWidth:300 });
    const stopRoutes = network.routes.filter(route => stopRouteIds.get(stop.id)?.has(route.id));
    const routeDetails = stopRoutes.length
      ? stopRoutes.map(route => `${escapeHtml(route.name)}${blockedRoutes.has(route.id) ? ' · interrompida' : ''}`).join('<br>')
      : 'Sem linhas neste recorte';
    marker.bindTooltip(`<strong>${escapeHtml(stop.name)}</strong><br><small>ID ${escapeHtml(stop.id)}</small><br>${routeDetails}`, {
      direction:'top', offset:[0,-5], sticky:true, className:'stop-map-tooltip'
    });
    marker.addTo(stopsLayer);
  }
  if (mapNeedsFit) {
    leafletMap.fitBounds(L.latLngBounds(network.stops.map(stop => [stop.lat,stop.lon])).pad(.06), { maxZoom:15 });
    mapNeedsFit = false;
  } else leafletMap.invalidateSize({ pan:false });
}
