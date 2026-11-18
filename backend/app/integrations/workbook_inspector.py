import re
from datetime import date, datetime
from io import BytesIO
from pathlib import PurePosixPath
from openpyxl import load_workbook

MONTHS = {"JAN":1,"FEB":2,"MAR":3,"APR":4,"MAY":5,"JUN":6,"JUL":7,"AUG":8,"SEP":9,"OCT":10,"NOV":11,"DEC":12}

def _json_value(value):
    if isinstance(value, (datetime, date)): return value.isoformat()
    if value is None or isinstance(value, (str, int, float, bool)): return value
    return str(value)

def parse_sheet_date(name: str, fallback_year=None, fallback_month=None):
    match = re.match(r"^\\s*(\\d{1,2})\\s+([A-Z]{3,9})\\s+(\\d{2,4})\\s*$", name, re.I)
    if not match: return None
    day, token, year_token = match.groups()
    month = MONTHS.get(token[:3].upper(), fallback_month)
    year = int(year_token)
    year = year + 2000 if year < 100 else year
    if not month: return None
    try: return date(year, month, int(day))
    except ValueError: return None

def identify_path(path: str):
    parts = [p for p in PurePosixPath(path).parts if p not in ("/", "")]
    filename = parts[-1] if parts else path
    year = next((int(p) for p in parts if re.fullmatch(r"20\\d{2}", p)), None)
    month = next((MONTHS[p[:3].upper()] for p in parts if p[:3].upper() in MONTHS), None)
    station = parts[1] if len(parts)>1 and parts[0].lower()=="logix retail" else (parts[0] if len(parts)>1 else None)
    return {"file_name":filename,"station_name":station,"year":year,"month":month}

def _value(ws, coord):
    value=ws[coord].value
    if isinstance(value,str) and value.startswith("="):
        return None
    return value

def _number(ws, coord):
    value=_value(ws,coord)
    if value is None or value=="": return None
    if isinstance(value,(int,float)): return float(value)
    try: return float(str(value).replace(",","").replace("GMD","").strip())
    except (ValueError,TypeError): return None

def extract_sukuta_day(ws, wsv):
    # Sukuta's verified Jan-2025 template: meter shifts D/E, F/G, H/I;
    # stock control O:Q; cash reconciliation O:P; deliveries rows 22:25 and 30:33.
    pumps=[]
    for row in list(range(5,13)):
        label=_value(ws,f"C{row}")
        if not label: continue
        product="AGO" if "AGO" in str(label).upper() else ("PMS" if "PMS" in str(label).upper() else "UNKNOWN")
        meters={}
        for shift, col in (("morning",("D","E")),("afternoon",("F","G")),("night",("H","I"))):
            a,b=col
            opening=_number(ws,f"{a}{row}")
            closing=_number(ws,f"{b}{row}")
            if opening is not None or closing is not None:
                meters[shift]={"opening":opening,"closing":closing,"throughput":(closing-opening) if opening is not None and closing is not None else None}
        pumps.append({"pump_label":str(label),"product":product,"island":str(_value(ws,f"A{row-1}") or _value(ws,f"A{row}") or ""),"shifts":meters})
    deliveries=[]
    for start,end,product in ((22,25,"PMS"),(30,33,"AGO")):
        for row in range(start,end+1):
            vals={k:_value(ws,f"{col}{row}") for k,col in (("dn","A"),("origin","B"),("destination","D"),("direct","F"),("diversion","G"),("shortage","H"),("received","I"))}
            if any(v is not None for v in vals.values()):
                vals["product"]=product
                for k in ("direct","diversion","shortage","received"):
                    vals[k]=_number(ws,f"{ {'direct':'F','diversion':'G','shortage':'H','received':'I'}[k] }{row}")
                deliveries.append(vals)
    def n(coord): return _number(ws,coord)
    pms_shift={s:n(f"{c}17") for s,c in (("morning","D"),("afternoon","F"),("night","H"))}
    ago_shift={s:n(f"{c}17") for s,c in (("morning","E"),("afternoon","G"),("night","I"))}
    pms_sales=sum(x or 0 for x in pms_shift.values()) if any(x is not None for x in pms_shift.values()) else None
    ago_sales=sum(x or 0 for x in ago_shift.values()) if any(x is not None for x in ago_shift.values()) else None
    return {
      "template":"sukuta_jan2025_v1",
      "station_name":_value(ws,"S2"),
      "report_date":_json_value(_value(ws,"B3")),
      "pump_meters":pumps,
      "meter_totals":{"closing":{"pms":n("D13"),"ago":n("E13")},"opening":{"pms":n("D14"),"ago":n("E14")},"throughput":{"pms":n("D15"),"ago":n("E15")},"return_to_tank":{"pms":n("D16"),"ago":n("E16")},"sales":{"pms":n("D17"),"ago":n("E17")}},
      "shift_sales_litres":{"pms":pms_shift,"ago":ago_shift,"pms_total":pms_sales,"ago_total":ago_sales},
      "sales_revenue":{"pms_price":n("P16"),"pms_gmd":n("Q16"),"ago_price":n("P17"),"ago_gmd":n("Q17"),"total_gmd":n("Q18")},
      "stock_control":{"pms":{"opening":n("P5"),"receipts":n("P6"),"total":n("P7"),"sales":n("P8"),"theoretical":n("P9"),"closing":n("P10"),"difference":n("P11"),"control_ratio":n("P12")},"ago":{"opening":n("Q5"),"receipts":n("Q6"),"total":n("Q7"),"sales":n("Q8"),"theoretical":n("Q9"),"closing":n("Q10"),"difference":n("Q11"),"control_ratio":n("Q12")}},
      "credit_sales":{"amount":n("K18"),"entries":[{"amount":n(f"K{r}"),"details":_value(ws,f"L{r}"),"customer":_value(ws,f"M{r}")} for r in range(5,18) if n(f"K{r}") is not None or _value(ws,f"L{r}") is not None or _value(ws,f"M{r}") is not None]},
      "deliveries":deliveries,
      "delivery_totals":{"pms":{"direct":n("F26"),"diversion":n("G26"),"shortage":n("H26"),"received":n("I26")},"ago":{"direct":n("F34"),"diversion":n("G34"),"shortage":n("H34"),"received":n("I34")}},
      "cheques":{"total":n("K34"),"entries":[{"amount":n(f"K{r}"),"number":_value(ws,f"L{r}"),"customer":_value(ws,f"M{r}")} for r in range(22,34) if n(f"K{r}") is not None or _value(ws,f"L{r}") is not None or _value(ws,f"M{r}") is not None]},
      "cash_reconciliation":{"sales":n("P25"),"coupons":n("P26"),"qmoney":n("P27"),"waychit":n("P28"),"cheques":n("P29"),"credit_sales":n("P30"),"generator_refuel":n("P31"),"cash":n("P32"),"banked":n("P33"),"difference":n("P34")},
      "generator":{"runtime_minutes":n("P20"),"refuel_gmd":n("P31")},
      "cashpower":{"kwh":n("P21"),"purchase_gmd":n("P22")},
      "notes":_value(ws,"A36"),
      "formula_calculated_values_source":"Excel cached values; formulas retained in raw cell archive"
    }

def inspect_workbook(content: bytes, source_path: str):
    keep_vba=source_path.lower().endswith(".xlsm")
    wb=load_workbook(BytesIO(content),data_only=False,keep_vba=keep_vba)
    wb_values=load_workbook(BytesIO(content),data_only=True,keep_vba=keep_vba)
    meta=identify_path(source_path)
    daily,warnings,summaries=[],[],[]
    summary_cells={}
    station_from_sheet=None
    for name in wb.sheetnames:
        ws,wsv=wb[name],wb_values[name]
        cells,no_cache={},[]
        for row in ws.iter_rows():
            for cell in row:
                if cell.value is None: continue
                raw=cell.value
                if isinstance(raw,str) and raw.startswith("="):
                    cached=wsv[cell.coordinate].value
                    cells[cell.coordinate]={"formula":raw,"value":_json_value(cached)}
                    if cached is None: no_cache.append(cell.coordinate)
                else: cells[cell.coordinate]={"value":_json_value(raw)}
        summaries.append({"name":name,"max_row":ws.max_row,"max_column":ws.max_column,"populated_cells":len(cells),"hidden":ws.sheet_state!="visible"})
        if name.strip().upper()=="SUMMARY":
            summary_cells=cells
            continue
        report_date=parse_sheet_date(name,meta["year"],meta["month"])
        if report_date and cells:
            station_name=_value(ws,"S2")
            if station_name: station_from_sheet=str(station_name)
            daily.append({"date":report_date.isoformat(),"worksheet":name,"cells":cells,
                "extracted_data":extract_sukuta_day(wsv,wsv) if station_name and str(station_name).strip().upper()=="SUKUTA" else {},
                "formula_cells_without_cached_value":no_cache})
            if no_cache: warnings.append({"worksheet":name,"severity":"warning","message":f"{len(no_cache)} formula cells have no cached calculated value.","cells":no_cache[:100]})
        elif cells: warnings.append({"worksheet":name,"severity":"info","message":"Populated non-daily worksheet retained in inspection report."})
    wb.close(); wb_values.close()
    if station_from_sheet: meta["station_name"]=station_from_sheet
    if not daily: warnings.append({"worksheet":"Workbook","severity":"error","message":"No populated daily worksheets matching the supported date naming pattern were found."})
    if daily and not any(x["extracted_data"] for x in daily):
        warnings.append({"worksheet":"Workbook","severity":"warning","message":"Daily sheets retained as raw cells; no validated station template mapping matched."})
    return {"identity":meta,"sheet_summaries":summaries,"daily_sheets":daily,"summary_cells":summary_cells,"warnings":warnings,"workbook_sheet_count":len(summaries)}
