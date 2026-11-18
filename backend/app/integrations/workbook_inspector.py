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
    match = re.match(r"^\s*(\d{1,2})\s+([A-Z]{3,9})\s+(\d{2,4})\s*$", name, re.I)
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
    year = next((int(p) for p in parts if re.fullmatch(r"20\d{2}", p)), None)
    month = next((MONTHS[p[:3].upper()] for p in parts if p[:3].upper() in MONTHS), None)
    station = parts[1] if len(parts)>1 and parts[0].lower()=="logix retail" else (parts[0] if len(parts)>1 else None)
    return {"file_name":filename,"station_name":station,"year":year,"month":month}

def inspect_workbook(content: bytes, source_path: str):
    keep_vba = source_path.lower().endswith(".xlsm")
    wb_formula = load_workbook(BytesIO(content), data_only=False, keep_vba=keep_vba)
    wb_values = load_workbook(BytesIO(content), data_only=True, keep_vba=keep_vba)
    meta = identify_path(source_path)
    daily, warnings, summaries = [], [], []
    summary_cells = {}
    for name in wb_formula.sheetnames:
        ws, wsv = wb_formula[name], wb_values[name]
        cells, no_cache = {}, []
        for row in ws.iter_rows():
            for cell in row:
                if cell.value is None: continue
                raw = cell.value
                if isinstance(raw, str) and raw.startswith("="):
                    cached = wsv[cell.coordinate].value
                    cells[cell.coordinate] = {"formula":raw,"value":_json_value(cached)}
                    if cached is None: no_cache.append(cell.coordinate)
                else:
                    cells[cell.coordinate] = {"value":_json_value(raw)}
        summaries.append({"name":name,"max_row":ws.max_row,"max_column":ws.max_column,"populated_cells":len(cells),"hidden":ws.sheet_state!="visible"})
        if name.strip().upper()=="SUMMARY":
            summary_cells=cells
            continue
        report_date=parse_sheet_date(name,meta["year"],meta["month"])
        if report_date and cells:
            daily.append({"date":report_date.isoformat(),"worksheet":name,"cells":cells,"formula_cells_without_cached_value":no_cache})
            if no_cache: warnings.append({"worksheet":name,"severity":"warning","message":f"{len(no_cache)} formula cells have no cached calculated value.","cells":no_cache[:100]})
        elif cells:
            warnings.append({"worksheet":name,"severity":"info","message":"Populated non-daily worksheet retained in inspection report."})
    wb_formula.close(); wb_values.close()
    if not daily: warnings.append({"worksheet":"Workbook","severity":"error","message":"No populated daily worksheets matching the supported date naming pattern were found."})
    return {"identity":meta,"sheet_summaries":summaries,"daily_sheets":daily,"summary_cells":summary_cells,"warnings":warnings,"workbook_sheet_count":len(summaries)}
