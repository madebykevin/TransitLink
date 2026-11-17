from pathlib import Path
import re
import xml.sax.saxutils as xml

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "relatorio-tecnico-rascunho.md"
OUTPUT = ROOT / "output" / "pdf" / "TransitLink-relatorio-tecnico-rascunho.pdf"

def clean(value):
    return value.replace("—", "-").replace("–", "-").replace("−", "-").replace("³", "^3").replace("²", "^2").replace("×", "x").replace("→", "para").strip()

def inline(value):
    value = xml.escape(clean(value))
    value = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", value)
    value = re.sub(r"`(.+?)`", r"<font name='Courier'>\1</font>", value)
    value = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r"<link href='\2' color='#237d67'>\1</link>", value)
    value = re.sub(r"&lt;(https?://[^&]+)&gt;", r"<link href='\1' color='#237d67'>\1</link>", value)
    return value

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=29, leading=35, textColor=colors.HexColor("#163b35"), alignment=TA_CENTER, spaceAfter=10))
styles.add(ParagraphStyle(name="CoverSub", parent=styles["Normal"], fontSize=13, leading=19, textColor=colors.HexColor("#526461"), alignment=TA_CENTER, spaceAfter=12))
styles.add(ParagraphStyle(name="Draft", parent=styles["Normal"], fontSize=10, leading=14, textColor=colors.HexColor("#a05232"), alignment=TA_CENTER))
styles.add(ParagraphStyle(name="Section", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=colors.HexColor("#163b35"), spaceBefore=12, spaceAfter=6, keepWithNext=True))
styles.add(ParagraphStyle(name="BodyTL", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2, leading=13.2, textColor=colors.HexColor("#263230"), spaceAfter=6))
styles.add(ParagraphStyle(name="SmallTL", parent=styles["BodyText"], fontSize=7.8, leading=10, textColor=colors.HexColor("#43514e")))
styles.add(ParagraphStyle(name="TableHeaderTL", parent=styles["SmallTL"], textColor=colors.white, fontName="Helvetica-Bold"))

def page(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(colors.HexColor("#d4dfda"))
    canvas.line(18*mm, 16*mm, width-18*mm, 16*mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#667672"))
    canvas.drawString(18*mm, 11*mm, "TRANSITLINK  |  RASCUNHO TÉCNICO  |  12/11/2026")
    canvas.drawRightString(width-18*mm, 11*mm, f"{doc.page}")
    canvas.restoreState()

doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=19*mm, leftMargin=19*mm, topMargin=18*mm, bottomMargin=23*mm, title="TransitLink - Relatório técnico (rascunho)", author="Grupo TransitLink - preencher integrantes")
story = [Spacer(1, 47*mm), Paragraph("TRANSITLINK", styles["CoverTitle"]), Paragraph("Análise de conectividade e caminhos mínimos em redes de transporte público", styles["CoverSub"]), Spacer(1, 13*mm), Paragraph("RELATÓRIO TÉCNICO · RASCUNHO", styles["Draft"]), Spacer(1, 20*mm), Paragraph("Projeto acadêmico de Teoria dos Grafos<br/><br/>Instituição: preencher<br/>Disciplina e turma: preencher<br/>Professor(a): preencher<br/>Integrantes: preencher pelo grupo<br/><br/>Data da verificação técnica: 12 de novembro de 2026", styles["CoverSub"]), PageBreak()]

lines = SOURCE.read_text(encoding="utf-8").splitlines()
section = None
paragraph = []
table_rows = []
bullets = []

def flush_paragraph():
    if paragraph:
        story.append(Paragraph(inline(" ".join(paragraph)), styles["BodyTL"]))
        paragraph.clear()

def flush_bullets():
    if bullets:
        for item in bullets:
            story.append(Paragraph("- " + inline(item), styles["BodyTL"]))
        bullets.clear()

def flush_table():
    if not table_rows:
        return
    rows = [[Paragraph(inline(cell), styles["TableHeaderTL"] if r == 0 else styles["SmallTL"]) for cell in row] for r, row in enumerate(table_rows)]
    table = Table(rows, colWidths=[25*mm, 27*mm, 23*mm, 34*mm, 38*mm, 25*mm], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#163b35")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("BACKGROUND", (0,1), (-1,-1), colors.HexColor("#f1f5f3")),
        ("GRID", (0,0), (-1,-1), .35, colors.HexColor("#c7d3ce")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    from reportlab.platypus import KeepTogether
    story.append(KeepTogether([Spacer(1, 3*mm), table, Spacer(1, 3*mm)]))
    table_rows.clear()

for raw in lines:
    line = raw.strip()
    if line.startswith("# "):
        continue
    if line.startswith("## "):
        flush_paragraph(); flush_bullets(); flush_table()
        section = line[3:]
        story.append(Paragraph(inline(section), styles["Section"]))
    elif line.startswith("|"):
        flush_paragraph(); flush_bullets()
        cells = [c.strip() for c in line.strip("|").split("|")]
        if all(re.fullmatch(r":?-{3,}:?", c) for c in cells):
            continue
        table_rows.append(cells)
    elif line.startswith("- "):
        flush_paragraph(); flush_table(); bullets.append(line[2:])
    elif not line:
        flush_paragraph(); flush_bullets(); flush_table()
    else:
        flush_bullets(); flush_table(); paragraph.append(line)
flush_paragraph(); flush_bullets(); flush_table()
doc.build(story, onFirstPage=page, onLaterPages=page)
print(OUTPUT)
