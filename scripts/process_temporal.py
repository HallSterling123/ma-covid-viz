"""
Build day-by-day ambulatory encounter data for temporal animation.
Run from covid-viz/: python scripts/process_temporal.py
"""
import csv, json, os
from collections import defaultdict

DATA_DIR = os.path.join(os.path.dirname(__file__), "../../10k_synthea_covid19_csv 2")
OUT_DIR  = os.path.join(os.path.dirname(__file__), "../public/data")
os.makedirs(OUT_DIR, exist_ok=True)

def save(name, obj):
    path = os.path.join(OUT_DIR, name)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    print(f"  {path}  ({os.path.getsize(path)//1024} KB)")

START_DATE = "2019-01-01"
END_DATE   = "2020-05-31"
ALL_CLASSES = ["ambulatory", "wellness", "outpatient", "inpatient", "emergency", "urgentcare"]

# ── Patients ──────────────────────────────────────────────────────────────────
print("Loading patients...")
patients = {}
with open(os.path.join(DATA_DIR, "patients.csv")) as f:
    for row in csv.DictReader(f):
        if row["LAT"] and row["LON"]:
            patients[row["Id"]] = [round(float(row["LAT"]), 4), round(float(row["LON"]), 4)]

# ── Organizations ─────────────────────────────────────────────────────────────
print("Loading organizations...")
orgs = {}
with open(os.path.join(DATA_DIR, "organizations.csv")) as f:
    for row in csv.DictReader(f):
        if row["LAT"] and row["LON"]:
            orgs[row["Id"]] = [round(float(row["LAT"]), 4), round(float(row["LON"]), 4)]

# ── COVID patients ────────────────────────────────────────────────────────────
print("Loading COVID patients...")
# 0 = confirmed only, 1 = suspected only, 2 = both
confirmed  = set()
suspected  = set()
with open(os.path.join(DATA_DIR, "conditions.csv")) as f:
    for row in csv.DictReader(f):
        desc = row["DESCRIPTION"].upper()
        if "SUSPECTED COVID" in desc:
            suspected.add(row["PATIENT"])
        elif "COVID" in desc:
            confirmed.add(row["PATIENT"])

both_pids  = confirmed & suspected
conf_only  = confirmed - both_pids
susp_only  = suspected - both_pids
covid_pids = confirmed | suspected

def patient_status(pid):
    if pid in both_pids:  return 2  # both
    if pid in conf_only:  return 0  # confirmed only
    return 1                         # suspected only

print(f"  Confirmed only: {len(conf_only)}, Suspected only: {len(susp_only)}, Both: {len(both_pids)}")

# ── All encounter classes, grouped by day ─────────────────────────────────────
print("Processing encounters (all classes)...")
# daily[day][class] = [[plat,plon,olat,olon], ...]
daily = defaultdict(lambda: defaultdict(list))
total_by_class = defaultdict(int)

with open(os.path.join(DATA_DIR, "encounters.csv")) as f:
    for row in csv.DictReader(f):
        if row["PATIENT"] not in covid_pids:
            continue
        cls = row["ENCOUNTERCLASS"]
        if cls not in ALL_CLASSES:
            continue
        day = row["START"][:10]
        if day < START_DATE or day > END_DATE:
            continue
        p = patients.get(row["PATIENT"])
        o = orgs.get(row["ORGANIZATION"])
        if not p or not o:
            continue
        daily[day][cls].append([p[0], p[1], o[0], o[1], patient_status(row["PATIENT"])])
        total_by_class[cls] += 1

# Build sorted list of days — store per-class lines per day
days = sorted(daily.keys())
timeline = []
for day in days:
    entry = {"d": day}
    for cls in ALL_CLASSES:
        lines = daily[day][cls]
        if lines:
            entry[cls] = lines
    timeline.append(entry)

print(f"  {len(days)} days  |  date range: {days[0]} → {days[-1]}")
for cls in ALL_CLASSES:
    print(f"  {cls}: {total_by_class[cls]} encounters")
print(f"  Total: {sum(total_by_class.values())}")

save("ambulatory_temporal.json", {
    "days":    timeline,
    "classes": ALL_CLASSES,
    "counts":  dict(total_by_class),
})
print("Done.")
