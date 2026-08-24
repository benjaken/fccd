from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT = Path("output/pdf/sample-frozen-supplier-quote.pdf")
FONT = "C:/Windows/Fonts/simhei.ttf"

pdfmetrics.registerFont(TTFont("CJK", FONT))

styles = getSampleStyleSheet()
title = ParagraphStyle("TitleCJK", parent=styles["Title"], fontName="CJK", fontSize=19,
                       leading=24, textColor=colors.HexColor("#123B5D"), spaceAfter=5 * mm)
body = ParagraphStyle("BodyCJK", parent=styles["BodyText"], fontName="CJK", fontSize=9.5,
                      leading=14, textColor=colors.HexColor("#263746"))
small = ParagraphStyle("SmallCJK", parent=body, fontSize=8, leading=11, textColor=colors.HexColor("#536878"))
label = ParagraphStyle("LabelCJK", parent=body, fontSize=8.5, leading=12, textColor=colors.white,
                       alignment=TA_CENTER)
cell = ParagraphStyle("CellCJK", parent=body, fontSize=7.7, leading=10, alignment=TA_LEFT)
cell_center = ParagraphStyle("CellCenterCJK", parent=cell, alignment=TA_CENTER)
cell_right = ParagraphStyle("CellRightCJK", parent=cell, alignment=TA_RIGHT)


def p(text, style=cell):
    return Paragraph(text, style)


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("CJK", 7.5)
    canvas.setFillColor(colors.HexColor("#718493"))
    canvas.drawString(18 * mm, 12 * mm, "模拟测试文件 - 非真实报价 / SAMPLE ONLY")
    canvas.drawRightString(192 * mm, 12 * mm, f"Page {doc.page}")
    canvas.restoreState()


doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=16 * mm, leftMargin=16 * mm,
                        topMargin=14 * mm, bottomMargin=20 * mm, title="模拟冻货供应商报价单")

story = [
    Paragraph("北海冷冻食品有限公司", title),
    Paragraph("FROZEN FOOD SUPPLIER QUOTATION", ParagraphStyle(
        "Subtitle", parent=body, fontSize=11, leading=15, textColor=colors.HexColor("#2E779A"),
        spaceAfter=4 * mm)),
]

meta = [
    [p("报价编号", small), p("DEMO-2026-0823", body), p("报价日期", small), p("2026-08-23", body)],
    [p("客户", small), p("FCCD 测试客户", body), p("有效日期", small), p("2026-08-23 至 2026-09-06", body)],
    [p("币种", small), p("HKD", body), p("价格说明", small), p("未含特别配送附加费", body)],
]
meta_table = Table(meta, colWidths=[22 * mm, 61 * mm, 22 * mm, 69 * mm])
meta_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EAF2F6")),
    ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#EAF2F6")),
    ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#AABBC7")),
    ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C7D3DB")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
story += [meta_table, Spacer(1, 7 * mm)]

headers = ["货号", "产品名称", "产地", "规格", "包装", "单价", "状态"]
rows = [
    ["FS-001", "三文鱼柳<br/>Salmon Fillet", "挪威", "去皮 1.4-1.8kg", "10kg/箱", "HKD 98.00/kg", "有货"],
    ["FS-002", "法国鸭胸<br/>Duck Breast", "法国", "300-350g/件", "5kg/箱", "HKD 72.50/kg", "有货"],
    ["FS-003", "牛肋条<br/>Beef Short Rib", "美国", "切片 2mm", "20 x 500g/箱", "TBA", "待报价"],
    ["FS-004", "带子肉 U10<br/>Scallop Meat U10", "日本", "U10", "10 x 1kg/箱", "HKD 168.00/kg", "缺货"],
    ["FS-005", "鸡中翼<br/>Chicken Mid Joint", "巴西", "35-45g/件", "4 x 2.5kg/箱", "HKD 36.80/kg", "有货"],
    ["FS-006", "黑鳕鱼切片<br/>Black Cod Portion", "加拿大", "180-220g/件", "5kg/箱", "HKD 145.00/kg", "有货"],
]
table_data = [[p(h, label) for h in headers]]
for row in rows:
    table_data.append([
        p(row[0], cell_center), p(row[1]), p(row[2], cell_center), p(row[3]), p(row[4]),
        p(row[5], cell_right), p(row[6], cell_center),
    ])

quote_table = Table(table_data, repeatRows=1,
                    colWidths=[17 * mm, 42 * mm, 18 * mm, 31 * mm, 31 * mm, 27 * mm, 18 * mm])
quote_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#176B87")),
    ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#9DB0BC")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 4),
    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#F3F7F9")),
    ("BACKGROUND", (0, 4), (-1, 4), colors.HexColor("#F3F7F9")),
    ("BACKGROUND", (0, 6), (-1, 6), colors.HexColor("#F3F7F9")),
    ("TEXTCOLOR", (5, 3), (5, 3), colors.HexColor("#9A6700")),
    ("TEXTCOLOR", (6, 4), (6, 4), colors.HexColor("#B42318")),
]))
story += [quote_table, Spacer(1, 7 * mm)]

conditions = [
    [p("报价条件", label), ""],
    [p("最低订单", small), p("每次订单总额不少于 HKD 3,000。", body)],
    [p("配送", small), p("九龙区满 HKD 5,000 免费配送；其他地区另议。", body)],
    [p("付款", small), p("月结 30 天，经审批客户适用。", body)],
    [p("备注", small), p("价格及库存以订单确认时为准；TBA 项目不得按零价处理。", body)],
]
conditions_table = Table(conditions, colWidths=[29 * mm, 145 * mm])
conditions_table.setStyle(TableStyle([
    ("SPAN", (0, 0), (1, 0)),
    ("BACKGROUND", (0, 0), (1, 0), colors.HexColor("#176B87")),
    ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#EAF2F6")),
    ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#AABBC7")),
    ("INNERGRID", (0, 1), (-1, -1), 0.35, colors.HexColor("#C7D3DB")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
story += [conditions_table, Spacer(1, 5 * mm), Paragraph(
    "此文件仅用于测试 FCCD 供应商报价 PDF 识别功能，不代表任何真实交易或市场价格。", small)]

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT.resolve())
