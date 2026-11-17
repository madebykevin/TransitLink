from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'pdf'
OUT.mkdir(parents=True, exist_ok=True)
DOCX = OUT / 'TransitLink-relatorio-tecnico.docx'
PDF = OUT / 'TransitLink-relatorio-tecnico.pdf'

sections = [
('Resumo', [
('p', 'Este relatório descreve o TransitLink, aplicação web local que transforma dados públicos GTFS em grafos direcionados e ponderados e calcula caminhos mínimos com implementação própria de Floyd-Warshall. A ferramenta permite explorar conectividade, consultar percursos e simular interrupções de linhas. O custo representa distância geográfica estimada entre paradas, não duração de viagem. A verificação automatizada mais recente executou 20 testes: 19 passaram e 1 falhou em um caso de seleção de data de serviço; essa pendência é registrada nos resultados.')]),
('1. Identificação do projeto e integrantes', [
('table', [['Campo','Identificação'],['Projeto','TransitLink - análise de redes de transporte público'],['Instituição','[Preencher]'],['Curso, disciplina e turma','[Preencher]'],['Professor(a)','[Preencher]'],['Integrantes e matrículas','[Preencher pelo grupo]'],['Data do relatório','15 de novembro de 2026']]),
('p','Os campos entre colchetes devem ser preenchidos pelo grupo antes da entrega. Nomes, matrículas e participação individual não foram inferidos.')]),
('2. Descrição e relevância do problema', [
('p','Redes de transporte público reúnem paradas, linhas e conexões em diferentes sentidos. Compreender se uma parada é alcançável a partir de outra e como uma interrupção afeta as alternativas pode ser difícil quando a rede possui muitas conexões.'),
('p','O TransitLink representa as viagens como grafo para tornar consultas de conectividade reproduzíveis. O sistema calcula os menores custos espaciais entre pares de paradas, reconstrói um percurso escolhido e permite retirar linhas do cenário e recalcular. O projeto tem finalidade acadêmica: demonstrar modelagem em grafos, programação dinâmica e análise de cenários com dados de transporte publicados.'),
('p','A solução não é um planejador de viagens em tempo real. A relevância do modelo está em estudar a estrutura espacial e a conectividade da rede sob hipóteses explicitadas.')]),
('3. Origem e características dos dados', [
('p','A aplicação inclui cópias locais de feeds GTFS de Curitiba/PR, Belo Horizonte/MG e Porto Alegre/RS. As fontes, versões, hashes e atribuições estão documentadas em data/SOURCES.md. Curitiba utiliza feed URBS distribuído por pipeline comunitário derivado de dados abertos C3SL/UFPR; Belo Horizonte utiliza dados associados à SUMOB; Porto Alegre utiliza feed EPTC histórico de 2025, que não representa necessariamente a operação atual.'),
('p','O importador lê stops.txt, routes.txt, trips.txt, stop_times.txt e calendários de serviço. Filtra viagens ativas para a data selecionada, respeitando calendar.txt e calendar_dates.txt. Não atualiza os arquivos pela internet e não inventa viagens.'),
('p','A cópia de Curitiba observada em 12/11/2026 continha 7.235 registros de paradas, 309 linhas, 71.152 viagens e 2.035.923 registros stop_times. São contagens do arquivo congelado, não da operação presente. A interface oferece recortes geográficos de até 180, 360 ou 600 paradas para limitar o custo do cálculo. Esses recortes não representam a cobertura integral das cidades.')]),
('4. Modelagem como grafo', [
('p','O modelo é um grafo direcionado e ponderado. Cada parada com coordenadas válidas é um vértice. Cada par de paradas consecutivas numa viagem ativa é uma aresta orientada conforme stop_sequence. Uma conexão A para B não implica uma conexão B para A.'),
('p','O peso da aresta é a distância geodésica estimada em metros entre coordenadas GTFS, calculada pela fórmula de Haversine. Conexões duplicadas são agregadas e guardam os identificadores das linhas que atendem o trecho. Arestas repetidas entre um mesmo par não criam novos vértices.'),
('p','O recorte seleciona paradas próximas e conserva somente pares consecutivos originais presentes no recorte. O importador não conecta artificialmente os extremos de um trecho removido. Transferências são inferidas quando o percurso muda de linha numa parada compartilhada; não há penalidade temporal nem caminhada entre plataformas.')]),
('5. Fundamentação e descrição dos algoritmos', [
('p','Floyd-Warshall resolve caminhos mínimos entre todos os pares de vértices. Em server/floyd-warshall.js, a função floydWarshall inicializa distâncias próprias com zero, conexões diretas com seus pesos e demais pares com infinito. Em seguida, considera cada vértice k como intermediário e compara, para cada origem i e destino j, o custo conhecido com dist[i][k] + dist[k][j]. Se a soma for menor, atualiza a matriz.'),
('code','dist[i][j] = min(dist[i][j], dist[i][k] + dist[k][j])'),
('p','Uma matriz next registra a próxima parada no percurso e permite reconstruir a rota sem executar novamente o algoritmo para cada consulta. A função reconstructPath retorna ausência de rota quando a distância permanece infinita. A complexidade é O(V³) em tempo e O(V²) em memória; a aplicação limita o grafo a 600 vértices.'),
('p','A implementação é própria. O worker server/calc-worker.js executa a chamada em worker thread, mantendo o processamento pesado fora da thread principal do servidor. Isso não altera a complexidade nem paraleliza os três laços. Sem linhas interrompidas, blockedRoutes é conjunto vazio e todas as conexões válidas são consideradas. Com interrupções, uma aresta permanece se alguma linha associada ainda estiver ativa.'),
('p','O peso é distância geográfica entre pontos, não distância de rua, tempo de viagem, previsão de chegada ou garantia de conexão entre horários. O algoritmo otimiza somente a soma desses pesos.')]),
('6. Arquitetura e implementação', [
('table', [['Componente','Responsabilidade'],['server/gtfs.js','Lê ZIP/CSV GTFS, filtra calendário, escolhe recorte, cria vértices e arestas e calcula pesos Haversine.'],['server/gtfs-worker.js','Executa importação GTFS em worker thread.'],['server/floyd-warshall.js','Inicializa matrizes, calcula caminhos mínimos e reconstrói percurso.'],['server/calc-worker.js','Executa Floyd-Warshall em worker thread.'],['server/index.js','Servidor HTTP local e API de feeds, importação, análise, destinos, rota e matriz.'],['web/index.html e web/style.css','Estrutura e apresentação da interface.'],['web/app.js','Eventos da interface, chamadas da API, seletor de destinos e desenho do mapa Leaflet.'],['data/ e data/SOURCES.md','Feeds congelados e suas informações de proveniência.'],['test/ e scripts/','Testes automatizados e verificações dos feeds.']]),
('p','A aplicação utiliza Node.js e JavaScript, HTML e CSS. fflate lê ZIPs; Leaflet 1.9.4, empacotado localmente, apresenta mapa, zoom, paradas e conexões. O servidor escuta em 127.0.0.1:4173. Após instalar dependências, processamento e interface usam os dados locais; imagens de satélite Esri exigem internet. A base escura offline não contém ruas.'),
('p','Fluxo principal: selecionar cidade e recorte; importar GTFS; construir grafo; executar Floyd-Warshall; selecionar origem e destino; consultar percurso. Ao interromper linhas, é necessário recalcular. O mapa oculta paradas e trechos indisponíveis na situação apresentada; ocultação é apenas visual e não apaga o grafo.')]),
('7. Metodologia de testes', [
('p','A suíte usa node:test e cobre caminhos mínimos dirigidos, reconstrução, ausência de caminho, interrupção, pesos zero e negativos, importação GTFS, validação de datas, destinos disponíveis, API e comportamento das ações do mapa. Testes específicos também verificam conexões compartilhadas, alcançabilidade orientada e conexões removidas.'),
('p','O teste de integração da API importa um feed real, executa análise e verifica rota e matriz. scripts/verify-feeds.js pode exercitar as três cidades e recortes de 180, 360 e 600 vértices. scripts/verify-curitiba.js mede conectividade, exemplo de caminho e duração do algoritmo para os três tamanhos.'),
('p','Os resultados de testes refletem a execução local em 15/11/2026. Um teste de calendário falhou: test/gtfs.test.js esperava 2025-09-20, mas a função retornou 2026-11-15. A falha requer investigação e impede afirmar aprovação integral da suíte. Não foi feita validação visual da interface no navegador neste ciclo.')]),
('8. Resultados obtidos', [
('p','Na execução de npm test em 15/11/2026, 20 testes foram executados: 19 aprovados e 1 reprovado. O teste de integração de API, testes de Floyd-Warshall, importação, seleção de destinos e disponibilidade no mapa passaram. A falha ocorreu no caso de calendário baseado apenas em exceções, com diferença entre a data esperada e a retornada descrita na seção anterior.'),
('p','Medições previamente registradas para Curitiba em 12/11/2026, Node.js 22.21.1. São observações locais sem benchmark controlado; equipamento e carga não foram documentados. Pares alcançáveis incluem cada vértice consigo mesmo.'),
('table', [['Recorte','Vértices','Linhas','Arestas dirigidas','Pares alcançáveis','Tempo do algoritmo'],['Compacto','180','75','187','3.565','5,09 ms'],['Médio','360','124','502','22.379','7,54 ms'],['Amplo','600','131','802','87.958','32,69 ms']]),
('p','No recorte de 180, foi registrado um caminho entre as paradas 103503 e 103502, com distância estimada de 3.752 m e 13 paradas. Essa é evidência de uma consulta reconstruída, não de desempenho universal.'),
('p','Esses números históricos não são resultado de uma execução comparativa atual de todas as três cidades. Recomenda-se atualizar a tabela por cidade e tamanho antes da apresentação final e indicar data, máquina e versão do Node.js. Não se devem extrapolar os tempos medidos para outros equipamentos.')]),
('9. Limitações e possibilidades de melhoria', [
('p','O limite de 600 vértices decorre do crescimento cúbico do algoritmo e do uso quadrático de memória. Recortes podem omitir caminhos que existiriam na rede completa. Os feeds são cópias estáticas; o feed de Porto Alegre é histórico de 2025.'),
('p','Os pesos não representam percurso viário ou tempo. O modelo não considera horários, frequência, espera, trânsito, acessibilidade, caminhada, bilhetagem ou compatibilidade temporal entre viagens. Transferências são inferidas localmente e não constituem critério secundário otimizado. Os segmentos do mapa ligam coordenadas em linha reta. Satélite depende de internet.'),
('p','Melhorias possíveis: investigar e corrigir a falha de calendário; validar feeds com ferramenta GTFS; comparar de forma controlada cidades e tamanhos; documentar máquina e condições do benchmark; incorporar tempos e penalidades de transferência com modelo temporal apropriado; usar geometria das rotas; e avaliar fontes cartográficas offline conforme licença.')]),
('10. Contribuições individuais', [
('p','Preencher pelo grupo. Registrar somente atividades realmente realizadas e que cada integrante consiga explicar. Modelo sugerido:'),
('table', [['Integrante e matrícula','Atividades comprováveis','Parte do sistema explicada na apresentação'],['[Nome]','[Ex.: importador GTFS, com evidência]','[Arquivos e decisões que domina]'],['[Nome]','[Preencher]','[Preencher]'],['[Nome]','[Preencher]','[Preencher]']]),
('p','A participação individual não pode ser inferida pelo código ou pelo uso de ferramentas. O grupo deve revisar e completar esta seção.')]),
('11. Referências', [
('p','GENERAL TRANSIT FEED SPECIFICATION. Reference. Disponível em: https://gtfs.org/documentation/schedule/reference/.'),
('p','PORTAL DE DADOS ABERTOS DE CURITIBA. Transporte Coletivo de Curitiba. Disponível em: https://dadosabertos.curitiba.pr.gov.br/.'),
('p','URBS-GTFS. Pipeline comunitário derivado de dados abertos C3SL/UFPR. Disponível em: https://github.com/benaytms/urbs-gtfs.'),
('p','PREFEITURA DE BELO HORIZONTE. Catálogo GTFS da SUMOB. Disponível em: https://ckan.pbh.gov.br/dataset/gtfs.'),
('p','PREFEITURA DE PORTO ALEGRE. Catálogo GTFS da EPTC. Disponível em: https://dadosabertos.poa.br/dataset/gtfs.'),
('p','LEAFLET. Leaflet 1.9.4 Reference. Disponível em: https://leafletjs.com/reference-1.9.4.html.'),
('p','ESRI. World Imagery e atribuição cartográfica. Termos e atribuições aplicáveis devem ser verificados antes de redistribuição ou uso comercial.'),
('p','As datas de obtenção, versões declaradas, hashes e notas de licença das cópias utilizadas estão registradas em data/SOURCES.md.')]),
('12. Declaração de uso de Inteligência Artificial', [
('p','OpenAI Codex foi utilizado como assistente na estruturação, implementação, testes e documentação desta versão do projeto. O código contém testes automatizados; o estado observado nesta execução foi de 19 aprovações e 1 falha, descrita neste relatório.'),
('p','O grupo deve revisar e compreender o código e este relatório, verificar as fontes e os resultados, registrar outras ferramentas de IA utilizadas e ajustar a declaração às atividades efetivamente realizadas. Esta declaração não afirma revisão humana concluída nem substitui a responsabilidade acadêmica dos integrantes.')]),
('Conclusão', [
('p','O TransitLink demonstra uma cadeia de análise verificável: dados GTFS são filtrados e transformados em grafo direcionado; uma implementação própria de Floyd-Warshall calcula custos mínimos entre pares; a interface permite reconstruir percursos e observar alterações de conectividade após interrupções. Os resultados são úteis para fins acadêmicos dentro do recorte espacial e das hipóteses explicitadas. A entrega final deve resolver ou explicar a falha de calendário, atualizar experimentos, validar a demonstração e preencher identificação e contribuições do grupo.')])
]

def shade(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd'); shd.set(qn('w:fill'), fill); tc_pr.append(shd)

def set_cell_text(cell, text, bold=False, color=None):
    cell.text = ''
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(text); r.bold = bold; r.font.size = Pt(8.5)
    if color: r.font.color.rgb = RGBColor(*color)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

doc = Document()
sec = doc.sections[0]
sec.top_margin = Inches(.72); sec.bottom_margin = Inches(.72)
sec.left_margin = Inches(.78); sec.right_margin = Inches(.78)
normal = doc.styles['Normal']; normal.font.name='Aptos'; normal.font.size=Pt(10); normal.font.color.rgb=RGBColor(40,52,48)
normal.paragraph_format.space_after=Pt(6); normal.paragraph_format.line_spacing=1.12
for name,size in [('Title',28),('Heading 1',16),('Heading 2',12)]:
    st=doc.styles[name]; st.font.name='Aptos Display'; st.font.size=Pt(size); st.font.bold=True; st.font.color.rgb=RGBColor(22,59,53)
    st.paragraph_format.space_before=Pt(12); st.paragraph_format.space_after=Pt(6)
p=doc.add_paragraph(style='Title'); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.add_run('TransitLink')
p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
r=p.add_run('Relatório técnico do projeto'); r.font.size=Pt(15); r.font.color.rgb=RGBColor(82,100,95)
p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
p.add_run('Análise de conectividade e caminhos mínimos em redes de transporte público').italic=True
doc.add_paragraph('Instituição: [Preencher]     Disciplina/turma: [Preencher]')
doc.add_paragraph('Professor(a): [Preencher]     Integrantes: [Preencher pelo grupo]')
doc.add_paragraph('Data: 15 de novembro de 2026')
doc.add_paragraph('Documento editável. Complete os campos acadêmicos e revise as contribuições antes da entrega.')
doc.add_page_break()

for title, blocks in sections:
    doc.add_heading(title, level=1)
    for kind, value in blocks:
        if kind=='p':
            doc.add_paragraph(value)
        elif kind=='code':
            p=doc.add_paragraph(); p.paragraph_format.left_indent=Inches(.25); r=p.add_run(value); r.font.name='Consolas'; r.font.size=Pt(9); r.font.color.rgb=RGBColor(35,105,83)
        else:
            table=doc.add_table(rows=0, cols=len(value[0])); table.alignment=WD_TABLE_ALIGNMENT.CENTER; table.style='Table Grid'
            for ri,row in enumerate(value):
                cells=table.add_row().cells
                for ci,text in enumerate(row):
                    set_cell_text(cells[ci],text,bold=ri==0,color=(255,255,255) if ri==0 else None)
                    if ri==0: shade(cells[ci],'163B35')
                    elif ri%2==0: shade(cells[ci],'F0F5F2')
            doc.add_paragraph().paragraph_format.space_after=Pt(2)

footer=sec.footer.paragraphs[0]; footer.alignment=WD_ALIGN_PARAGRAPH.CENTER
footer.add_run('TRANSITLINK  |  RELATÓRIO TÉCNICO  |  15/11/2026').font.size=Pt(8)
doc.core_properties.title='TransitLink - Relatório técnico'; doc.core_properties.subject='Projeto acadêmico de grafos e transporte público'
doc.save(DOCX)

styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='CoverTitleTL',parent=styles['Title'],fontName='Helvetica-Bold',fontSize=28,leading=33,textColor=colors.HexColor('#163b35'),alignment=TA_CENTER,spaceAfter=8))
styles.add(ParagraphStyle(name='SubTL',parent=styles['Normal'],fontSize=12,leading=17,textColor=colors.HexColor('#52645f'),alignment=TA_CENTER,spaceAfter=8))
styles.add(ParagraphStyle(name='H1TL',parent=styles['Heading1'],fontName='Helvetica-Bold',fontSize=14,leading=18,textColor=colors.HexColor('#163b35'),spaceBefore=12,spaceAfter=6,keepWithNext=True))
styles.add(ParagraphStyle(name='BodyTL',parent=styles['BodyText'],fontName='Helvetica',fontSize=9.2,leading=13,textColor=colors.HexColor('#263430'),spaceAfter=6))
styles.add(ParagraphStyle(name='CellTL',parent=styles['BodyText'],fontName='Helvetica',fontSize=7.7,leading=10,textColor=colors.HexColor('#263430')))
styles.add(ParagraphStyle(name='CellHeadTL',parent=styles['CellTL'],fontName='Helvetica-Bold',textColor=colors.white))
story=[Spacer(1,28*mm),Paragraph('TRANSITLINK',styles['CoverTitleTL']),Paragraph('Relatório técnico do projeto',styles['SubTL']),Paragraph('Análise de conectividade e caminhos mínimos em redes de transporte público',styles['SubTL']),Spacer(1,12*mm),Paragraph('Instituição: [Preencher]<br/>Disciplina/turma: [Preencher]<br/>Professor(a): [Preencher]<br/>Integrantes: [Preencher pelo grupo]<br/><br/>15 de novembro de 2026',styles['SubTL']),Spacer(1,8*mm),Paragraph('Complete os campos acadêmicos e revise as contribuições antes da entrega.',styles['BodyTL']),PageBreak()]
for title,blocks in sections:
    story.append(Paragraph(escape(title),styles['H1TL']))
    for kind,value in blocks:
        if kind=='p': story.append(Paragraph(escape(value).replace('\n','<br/>'),styles['BodyTL']))
        elif kind=='code': story.append(Paragraph(f'<font name="Courier" color="#236953">{escape(value)}</font>',styles['BodyTL']))
        else:
            rows=[]
            for ri,row in enumerate(value):
                sty=styles['CellHeadTL'] if ri==0 else styles['CellTL']
                rows.append([Paragraph(escape(str(cell)),sty) for cell in row])
            widths=[(A4[0]-38*mm)/len(value[0])]*len(value[0])
            t=Table(rows,colWidths=widths,repeatRows=1,hAlign='LEFT')
            cmds=[('BACKGROUND',(0,0),(-1,0),colors.HexColor('#163b35')),('GRID',(0,0),(-1,-1),.35,colors.HexColor('#c7d3ce')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]
            for ri in range(2,len(rows),2): cmds.append(('BACKGROUND',(0,ri),(-1,ri),colors.HexColor('#f0f5f2')))
            t.setStyle(TableStyle(cmds)); story.extend([Spacer(1,2*mm),t,Spacer(1,3*mm)])

def page(canvas, template):
    canvas.saveState(); canvas.setFont('Helvetica',8); canvas.setFillColor(colors.HexColor('#667672'))
    canvas.drawString(19*mm,11*mm,'TRANSITLINK | RELATÓRIO TÉCNICO | 15/11/2026')
    canvas.drawRightString(A4[0]-19*mm,11*mm,str(template.page)); canvas.restoreState()

SimpleDocTemplate(str(PDF),pagesize=A4,rightMargin=19*mm,leftMargin=19*mm,topMargin=17*mm,bottomMargin=20*mm,title='TransitLink - Relatório técnico',author='Grupo TransitLink').build(story,onFirstPage=page,onLaterPages=page)
print(DOCX)
print(PDF)
