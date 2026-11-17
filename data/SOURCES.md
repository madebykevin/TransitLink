# Feed GTFS incluído

## Cidades adicionadas em 14/11/2026

Os arquivos abaixo são cópias locais completas das fontes públicas. A aplicação analisa recortes de até 600 paradas; não representa a cobertura integral da cidade no mapa. Não há atualização automática.

### Belo Horizonte / MG

- Responsável: Superintendência de Mobilidade Urbana de Belo Horizonte (SUMOB). Publicador técnico no feed: Bus2.
- Catálogo e atribuição: <https://ckan.pbh.gov.br/dataset/gtfs>. Licença indicada: Creative Commons Attribution.
- Download: <https://ckan.pbh.gov.br/dataset/77764a7e-63fc-4111-ace3-fb7d3037953a/resource/f0fa78dc-74c3-49fa-8971-c310a76a07fa/download/gtfsfiles.zip>.
- Arquivo: `belo-horizonte-gtfs.zip`. SHA-256: `E0E8DCD9D6B33BA875297D967DCE565CDBAC6B269EE6BEC759F6F4B7311E8F0A`.
- Versão declarada: `202611131930`. Data de demonstração: `2026-11-14`.

### Porto Alegre / RS — histórico de 2025

- Responsável: Empresa Pública de Transporte e Circulação (EPTC), Prefeitura de Porto Alegre.
- Catálogo e atribuição: <https://dadosabertos.poa.br/dataset/gtfs>. Licença indicada: Creative Commons Attribution.
- Download: <https://dadosabertos.poa.br/dataset/1fe9c2c1-9fbe-48ea-841b-61e30597ecd6/resource/b3bce61f-78ee-49eb-be57-6236d82bd5e0/download/arquivo-gtfs.zip>.
- Arquivo: `porto-alegre-gtfs.zip`. SHA-256: `7AD9C99183E7A867CACDD3FA0E6F813125CF0C5B772C2188BEA03F4FA6A5D76F`.
- Versão declarada: `3.5@20250918`. O arquivo público obtido em 14/11/2026 contém serviços de 2025, não a operação atual. Data de demonstração: `2025-09-25`.

A interface seleciona automaticamente o serviço mais recente disponível até hoje, considerando dias da semana, exceções e serviços com viagens. As datas de demonstração acima são referências da validação inicial. Não há atualização automática dos arquivos; o importador não fabrica viagens nem altera os calendários originais.

## Curitiba / PR

- Operador/rede: Urbanização de Curitiba S/A (URBS), Curitiba/PR.
- Arquivo: `curitiba-urbs-gtfs.zip`.
- Download congelado: 12/11/2026; não há atualização automática durante execução.
- SHA-256: `0AF00B386FB42DCE75B014AFFF8AE9CAF31C45BCD0CE2AF1C434BFFBE11FDF42`.
- O feed distribuído pela comunidade URBS-GTFS deriva de dados abertos publicados por C3SL/UFPR. O código da transformação é Apache-2.0; os dados seguem os termos da fonte C3SL/UFPR.
- O portal oficial de dados abertos de Curitiba identifica URBS como responsável pelo conjunto de transporte coletivo e descreve arquivos GTFS entre os dados disponíveis: <https://dadosabertos.curitiba.pr.gov.br/conjuntodado/detalhe?chave=ca40f13b-ef61-472b-810f-dd705f85fd2e>.
- Feed derivado e pipeline: <https://github.com/benaytms/urbs-gtfs>.
- Download usado: <https://github.com/benaytms/urbs-gtfs/releases/download/latest/gtfs_curitiba.zip>.
- Imagens satélite opcionais: Esri World Imagery, carregadas pela rede em tempo de execução. Atribuição exibida no mapa: “Sources: Esri, DigitalGlobe, GeoEye, i-cubed, USDA FSA, USGS, AEX, Getmapping, Aerogrid, IGN, IGP, swisstopo, GIS User Community”. Referências: <https://developers.arcgis.com/javascript/latest/references/core/layers/TileLayer/> e <https://support.esri.com/en-us/knowledge-base/what-is-the-correct-way-to-cite-an-arcgis-online-basema-000012040>.
- Navegação e zoom locais usam Leaflet 1.9.4, empacotado em `web/vendor/`; documentação: <https://leafletjs.com/reference-1.9.4.html>.
- Termos Esri consultados: permitem uso não comercial de serviços com atribuição, sujeitos a termos de imagens de terceiros; serviço pode mudar ou ser descontinuado: <https://www.esri.com/en-us/legal/terms/web-site-service>.

O ZIP contém 7.235 registros em `stops.txt`, 309 em `routes.txt`, 71.152 em `trips.txt` e 2.035.923 em `stop_times.txt` (contagens de linhas de dados observadas no arquivo, 12/11/2026). O importador filtra serviços pela data selecionada e analisa apenas subconjunto geográfico compacto para limitar o custo cúbico do Floyd-Warshall.

O feed é uma cópia congelada para demonstração offline. Verifique a origem e os termos atuais antes de redistribuir o ZIP fora deste projeto.
