"""Rebuild the placement PDF from its editable Markdown source.

Run with a Python environment containing reportlab. The default output replaces
the report PDF alongside this script; user/runtime databases are never read.
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import textwrap
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, CondPageBreak, Frame, KeepTogether, PageBreak, PageTemplate, Paragraph,
    Preformatted, Spacer, Table, TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "AgroGyanGPT_Placement_Report.md"
TARGET = ROOT / "AgroGyanGPT_Placement_Report.pdf"
GREEN = colors.HexColor("#244b35")
MUTED = colors.HexColor("#637264")
PAGE_W, PAGE_H = A4
MARGIN = 46
WIDTH = PAGE_W - MARGIN * 2


def register_fonts():
    fonts = Path("C:/Windows/Fonts")
    for name, filename in (("Body", "arial.ttf"), ("BodyBold", "arialbd.ttf"),
                           ("BodyItalic", "ariali.ttf"), ("Mono", "consola.ttf")):
        pdfmetrics.registerFont(TTFont(name, str(fonts / filename)))
    pdfmetrics.registerFontFamily("Body", normal="Body", bold="BodyBold", italic="BodyItalic", boldItalic="BodyBold")


def clean(text):
    # Transliteration is explicit in the historical benchmark; avoid unshaped
    # Indic glyphs in a Latin-font PDF while retaining original script in MD.
    text = text.replace("माती म्हणजे काय?", "Mati mhanje kay? [Marathi]")
    text = text.replace("मिट्टी क्या है?", "Mitti kya hai? [Hindi]")
    return text.replace("\u2011", "-").replace("\u2013", "-").replace("\u2014", " - ")


def inline(text):
    text = html.escape(clean(text))
    text = re.sub(r"`([^`]+)`", r'<font name="Mono">\1</font>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\[([^]]+)\]\((https?://[^)]+)\)", r'<link href="\2" color="#244b35">\1</link>', text)
    return text


class Report(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(str(filename), pagesize=A4, rightMargin=MARGIN, leftMargin=MARGIN,
                         topMargin=56, bottomMargin=47, title="AgroGyanGPT Placement Preparation Report",
                         author="AgroGyanGPT project documentation")
        self.addPageTemplates(PageTemplate("report", [Frame(MARGIN, 47, WIDTH, PAGE_H-103, id="body", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=self.page_chrome))
        self.heading = ""
        self.bookmarks = []

    def page_chrome(self, canvas, doc):
        canvas.saveState()
        if doc.page > 1:
            canvas.setFont("Body", 8)
            canvas.setFillColor(MUTED)
            canvas.drawString(MARGIN, PAGE_H-30, "AGROGYANGPT  /  PLACEMENT PREPARATION")
            canvas.setStrokeColor(colors.HexColor("#dce4d8"))
            canvas.line(MARGIN, PAGE_H-38, PAGE_W-MARGIN, PAGE_H-38)
        canvas.setFont("Body", 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(MARGIN, 26, "Revision: 24 October 2026")
        canvas.drawRightString(PAGE_W-MARGIN, 26, str(doc.page))
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name == "Chapter":
            title = flowable.getPlainText()
            key = "chapter-" + hashlib.sha256(title.encode()).hexdigest()[:16]
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(title, key, 0)
            self.notify("TOCEntry", (0, title, self.page, key))


def build():
    register_fonts()
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle("Text", fontName="Body", fontSize=9.2, leading=13.4, spaceAfter=8, textColor=colors.HexColor("#26362b"), splitLongWords=True))
    styles.add(ParagraphStyle("Chapter", fontName="BodyBold", fontSize=17, leading=22, textColor=GREEN, spaceAfter=18, keepWithNext=True))
    styles.add(ParagraphStyle("Section", fontName="BodyBold", fontSize=11.5, leading=16, textColor=GREEN, spaceBefore=13, spaceAfter=8, keepWithNext=True))
    styles.add(ParagraphStyle("Cell", parent=styles["Text"], fontSize=7.5, leading=10.5, spaceAfter=0))
    styles.add(ParagraphStyle("CodeBlock", fontName="Mono", fontSize=7.3, leading=10, leftIndent=9, rightIndent=9, backColor=colors.HexColor("#f0f3ed"), spaceBefore=5, spaceAfter=10, borderPadding=8))
    styles.add(ParagraphStyle("BulletText", parent=styles["Text"], leftIndent=13, firstLineIndent=-10, spaceAfter=4))
    styles.add(ParagraphStyle("CoverTitle", fontName="BodyBold", fontSize=39, leading=46, textColor=GREEN, spaceAfter=25))
    styles.add(ParagraphStyle("CoverSubtitle", fontName="Body", fontSize=17, leading=24, textColor=MUTED, spaceAfter=20))
    story = [Spacer(1, 105), Paragraph("AGRICULTURAL KNOWLEDGE PLATFORM", styles["Section"]), Spacer(1, 20),
             Paragraph("AgroGyanGPT", styles["CoverTitle"]), Paragraph("Placement preparation<br/>Technical architecture, deployed application<br/>and interview study guide", styles["CoverSubtitle"]),
             Spacer(1, 22), Paragraph("Updated 24 October 2026", styles["Section"]),
             Paragraph("Includes the public landing page, mobile remediation, Render + Supabase + Groq deployment, password registration, source-grounded retrieval, and step-by-step future publication workflow.", styles["Text"]),
             Spacer(1, 24), Paragraph("Local and cloud behavior are distinguished. Test counts are evidence of specific regressions, not an agricultural accuracy score.", styles["Text"]), PageBreak(),
             Paragraph("Contents", styles["Chapter"])]
    toc = TableOfContents()
    toc.levelStyles = [ParagraphStyle("TOC", fontName="Body", fontSize=9, leading=14, spaceBefore=5, textColor=GREEN, rightIndent=25)]
    story.extend([toc, PageBreak()])
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith("## "))
    i = start
    first = True
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith("## "):
            if not first:
                title = line[3:]
                # Start major study blocks on a new page; let short neighbouring
                # chapters share space instead of creating nearly empty pages.
                major = re.match(r"(?:1 |6 |10 |14 |19 |23 |24 |28 |29 |30 |31 |32 |Appendix)", title)
                story.append(PageBreak() if major else CondPageBreak(190))
            first = False
            story.append(Paragraph(inline(line[3:]), styles["Chapter"]))
            i += 1
        elif line.startswith("### "):
            story.append(Paragraph(inline(line[4:]), styles["Section"]))
            i += 1
        elif line.startswith("```"):
            code = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code.extend(textwrap.wrap(clean(lines[i]), width=107, replace_whitespace=False, drop_whitespace=False) or [""])
                i += 1
            story.append(Preformatted("\n".join(code), styles["CodeBlock"]))
            i += 1
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-+:?", c.replace(" ", "")) for c in cells):
                    rows.append(cells)
                i += 1
            count = max(len(row) for row in rows)
            rows = [row + [""]*(count-len(row)) for row in rows]
            weights = [max(8, min(65, max(len(row[col]) for row in rows)))**.65 for col in range(count)]
            widths = [WIDTH*w/sum(weights) for w in weights]
            endpoint_table = rows[0][0] == "Method and path"
            if endpoint_table:
                widths = [(WIDTH-38)*.54, (WIDTH-38)*.46, 38]
            data = [[Paragraph(("<b>"+inline(c)+"</b>") if n == 0 else inline(c), styles["Cell"]) for c in row] for n, row in enumerate(rows)]
            table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
            table.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#e7eee1")), ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f6f8f3")]), ("LINEBELOW", (0,0), (-1,0), .6, GREEN), ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7), ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6)]))
            if endpoint_table:
                table.setStyle(TableStyle([("TOPPADDING", (0,0), (-1,-1), 4.5), ("BOTTOMPADDING", (0,0), (-1,-1), 4.5)]))
            story.extend([table, Spacer(1, 11)])
        elif re.match(r"(?:- |\d+\. )", line):
            bullet, body = ("•", line[2:]) if line.startswith("- ") else (line.split(".",1)[0]+".", line.split(".",1)[1].strip())
            story.append(Paragraph(inline(bullet+" "+body), styles["BulletText"]))
            i += 1
        else:
            para = [line]
            i += 1
            while i < len(lines) and lines[i].strip() and not re.match(r"^(?:#|\||```|- |\d+\. )", lines[i].strip()):
                para.append(lines[i].strip())
                i += 1
            story.append(Paragraph(inline(" ".join(para)), styles["Text"]))
    Report(TARGET).multiBuild(story)
    print(json.dumps({"pdf": str(TARGET), "bytes": TARGET.stat().st_size}))


if __name__ == "__main__":
    build()
