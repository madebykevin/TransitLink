# TransitLink

Aplicação web local para importar feeds GTFS e analisar caminhos mínimos com implementação própria de Floyd-Warshall. Inclui cópias reais de Curitiba, Belo Horizonte e Porto Alegre para uso offline. Porto Alegre usa um feed histórico de 2025, identificado no seletor.

## Executar

Requer Node.js 20 ou superior.

```powershell
npm install
npm start
```

Abra `http://127.0.0.1:4173`, importe um arquivo ZIP GTFS e execute o cálculo. O servidor escuta somente em loopback. Após instalar dependências, a análise e a interface não exigem acesso externo.

## Dados e modelo

Selecione uma cidade e clique em “Carregar cidade · feed real” para usar seu GTFS em `data/`; outro arquivo GTFS também pode ser importado. A data é automática: usa o serviço mais recente disponível até hoje (fuso de São Paulo) na cópia local, considerando dias da semana e exceções. Feeds antigos usam sua última data de operação; o arquivo não é atualizado pela internet. O importador lê `stops.txt`, `routes.txt`, `trips.txt`, `stop_times.txt` e calendários de serviço, filtrando viagens ativas. Para redes maiores que o limite, escolhe recorte geográfico compacto de 180, 360 ou 600 paradas. Mantém arestas somente entre paradas consecutivas originais dentro do recorte, sem ligar paradas através de trechos excluídos. `data/SOURCES.md` registra origens e hashes dos arquivos.

Mapa interativo Leaflet mostra paradas, conexões e rota sobre imagens de satélite Esri. Zoom por roda, botões ou gesto e arraste. Após calcular a rede, o menu de destinos lista apenas paradas alcançáveis a partir da origem no cenário ativo; recalcule após alterar interrupções. Imagens são servidas online e exigem internet; menu de camadas troca para base escura offline, mantendo dados GTFS, pontos e conexões locais. Atribuição da imagem aparece no mapa. Uso Esri deste projeto é acadêmico e não comercial; verifique termos atuais antes de redistribuir ou usar comercialmente.

Cada parada é um vértice. Peso de aresta é distância geodésica Haversine entre as coordenadas do GTFS, em metros. É um custo espacial estático, não tempo de viagem, previsão de chegada nem garantia de conexão entre viagens. Transferências são inferidas quando o caminho troca de linha em uma parada compartilhada.

Interrupções removem uma linha do conjunto de arestas quando nenhuma outra linha ativa percorre a mesma conexão e recalculam todas as distâncias. A matriz é exibida em blocos de até 40 × 40.

## Limitações atuais

- Floyd-Warshall é cúbico no número de paradas; importação limita a 600 vértices. Um feed urbano completo normalmente excede esse limite. É preciso preparar subconjuntos GTFS documentados antes de uma demonstração.
- Os três tamanhos são recortes do feed da cidade selecionada. Porto Alegre é uma demonstração histórica de 2025.
- O mapa satélite depende do serviço de imagens Esri e internet; base escura offline não traz ruas. Linhas GTFS conectam coordenadas em segmentos retos, sem seguir ruas.
- Custos não usam horários, frequência, tempo de espera, bilhetagem nem acessibilidade.
- Uma aresta pode ser percorrida por múltiplas linhas; o rótulo do caminho escolhe continuidade local de linha, sem otimizar número de transferências como segundo critério.

## Testes

`npm run verify:feeds` inicia um servidor isolado e verifica as três cidades nos três tamanhos pela API: seleção automática da data, importação, Floyd-Warshall e reconstrução de caminho.

`npm test` executa testes unitários do algoritmo: caminho mínimo, direção/ausência de caminho, interrupção de linha e pesos zero/negativos.

`npm run verify:data` importa o feed de Curitiba na data escolhida pelo script (padrão `2026-11-12`), calcula Floyd-Warshall em cada tamanho e imprime contagens de conectividade, um caminho verificável e tempo medido do algoritmo.

## Estrutura

- `server/gtfs.js`: leitura e validação de arquivos GTFS, filtragem por calendário, recorte geográfico e montagem de arestas/pesos.
- `server/floyd-warshall.js`: algoritmo próprio e reconstrução de caminho.
- `server/calc-worker.js`: cálculo isolado em worker thread para manter a API responsiva.
- `server/gtfs-worker.js`: importação do feed isolada em worker thread.
- `server/index.js`: API local e servidor web.
- `web/`: interface, visualização de coordenadas, consulta de percurso e matriz.
- `web/vendor/leaflet.*`: Leaflet local, sem CDN.
- `test/`: testes matemáticos automatizados.
