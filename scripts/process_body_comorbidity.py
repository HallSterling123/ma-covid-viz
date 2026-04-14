"""
Generate co-morbidity data mapped to body regions, grouped by patient travel distance.
Run from covid-viz/: python scripts/process_body_comorbidity.py
"""
import csv, json, os
from collections import defaultdict
from math import radians, sin, cos, sqrt, atan2

DATA_DIR = os.path.join(os.path.dirname(__file__), "../../10k_synthea_covid19_csv 2")
OUT_DIR  = os.path.join(os.path.dirname(__file__), "../public/data")

def save(name, obj):
    path = os.path.join(OUT_DIR, name)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    print(f"  {path}  ({os.path.getsize(path)//1024} KB)")

def haversine_miles(lat1, lon1, lat2, lon2):
    R = 3958.8
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    a = sin((lat2-lat1)/2)**2 + cos(lat1)*cos(lat2)*sin((lon2-lon1)/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1-a))

# ── Body region definitions ────────────────────────────────────────────────────
REGIONS = [
    {
        "id":       "brain",
        "label":    "Brain & Mental Health",
        "color":    "#bc8cff",
        "keywords": ["anxiety", "depression", "dementia", "alzheimer", "seizure",
                     "stroke", "mental", "bipolar", "schizophrenia", "panic",
                     "stress", "ptsd", "psychosis"],
    },
    {
        "id":       "lungs",
        "label":    "Respiratory",
        "color":    "#58a6ff",
        "keywords": ["copd", "asthma", "pulmonary", "bronchitis", "respiratory",
                     "emphysema", "fibrosis", "pneumonia", "dyspnea", "apnea"],
    },
    {
        "id":       "heart",
        "label":    "Cardiovascular",
        "color":    "#f78166",
        "keywords": ["hypertension", "coronary", "heart", "atrial fibrillation",
                     "cardiac", "angina", "artery", "ischemia", "myocardial",
                     "infarction", "aortic", "stenosis", "heart failure"],
    },
    {
        "id":       "liver",
        "label":    "Liver & GI",
        "color":    "#ffa657",
        "keywords": ["liver", "hepatic", "cirrhosis", "hepatitis", "fatty liver",
                     "gallstone", "pancreatitis", "ulcer", "crohn", "colitis",
                     "diverticulitis", "bowel"],
    },
    {
        "id":       "pancreas",
        "label":    "Metabolic",
        "color":    "#e3b341",
        "keywords": ["diabetes", "prediabetes", "obesity", "metabolic",
                     "hyperlipidemia", "cholesterol", "glucose", "insulin",
                     "hyperglycemia", "lipid", "triglyceride", "bmi"],
    },
    {
        "id":       "kidneys",
        "label":    "Renal",
        "color":    "#3fb950",
        "keywords": ["kidney", "renal", "nephropathy", "glomerular",
                     "chronic kidney", "urinary", "bladder", "creatinine"],
    },
    {
        "id":       "joints",
        "label":    "Musculoskeletal",
        "color":    "#94a3b8",
        "keywords": ["arthritis", "osteoporosis", "joint", "bone", "fibromyalgia",
                     "musculoskeletal", "gout", "lupus", "back pain", "scoliosis",
                     "tendon", "ligament"],
    },
]

def classify(description):
    d = description.lower()
    for r in REGIONS:
        if any(kw in d for kw in r["keywords"]):
            return r["id"]
    return None

# ── Load patients ──────────────────────────────────────────────────────────────
print("Loading patients…")
patient_loc = {}
with open(os.path.join(DATA_DIR, "patients.csv")) as f:
    for row in csv.DictReader(f):
        if row["LAT"] and row["LON"]:
            patient_loc[row["Id"]] = (float(row["LAT"]), float(row["LON"]))

# ── Load organizations ─────────────────────────────────────────────────────────
print("Loading organizations…")
org_loc = {}
with open(os.path.join(DATA_DIR, "organizations.csv")) as f:
    for row in csv.DictReader(f):
        if row["LAT"] and row["LON"]:
            org_loc[row["Id"]] = (float(row["LAT"]), float(row["LON"]))

# ── COVID patient IDs ──────────────────────────────────────────────────────────
print("Finding COVID patients…")
covid_pids = set()
with open(os.path.join(DATA_DIR, "conditions.csv")) as f:
    for row in csv.DictReader(f):
        if "COVID" in row["DESCRIPTION"].upper():
            covid_pids.add(row["PATIENT"])
print(f"  {len(covid_pids)} COVID patients")

# ── Max travel distance per patient ───────────────────────────────────────────
print("Computing travel distances…")
max_dist = defaultdict(float)
with open(os.path.join(DATA_DIR, "encounters.csv")) as f:
    for row in csv.DictReader(f):
        pid = row["PATIENT"]
        if pid not in covid_pids: continue
        oid = row["ORGANIZATION"]
        if pid not in patient_loc or oid not in org_loc: continue
        plat, plon = patient_loc[pid]
        olat, olon = org_loc[oid]
        d = haversine_miles(plat, plon, olat, olon)
        if d > max_dist[pid]:
            max_dist[pid] = d

dist_values = sorted(max_dist.values())
print(f"  Distance range: {min(dist_values):.1f} – {max(dist_values):.1f} miles")
print(f"  Median: {dist_values[len(dist_values)//2]:.1f} miles")

# Define close vs far thresholds
CLOSE_THRESH = 5.0   # ≤ 5 miles = close
FAR_THRESH   = 15.0  # ≥ 15 miles = far

close_pids = {p for p, d in max_dist.items() if d <= CLOSE_THRESH}
far_pids   = {p for p, d in max_dist.items() if d >= FAR_THRESH}
print(f"  Close (≤{CLOSE_THRESH}mi): {len(close_pids)} patients")
print(f"  Far (≥{FAR_THRESH}mi):  {len(far_pids)} patients")

# ── Co-morbidities ─────────────────────────────────────────────────────────────
print("Computing co-morbidity rates by region…")

# Conditions per patient (excluding COVID itself)
patient_conditions = defaultdict(set)
region_conditions  = defaultdict(lambda: defaultdict(int))  # region → condition → count

with open(os.path.join(DATA_DIR, "conditions.csv")) as f:
    for row in csv.DictReader(f):
        pid  = row["PATIENT"]
        desc = row["DESCRIPTION"]
        if pid not in covid_pids: continue
        if "COVID" in desc.upper(): continue

        region = classify(desc)
        if not region: continue
        patient_conditions[pid].add(region)
        # Track top conditions per region for tooltip
        region_conditions[region][desc] += 1

def compute_rates(pids, label):
    n = len(pids)
    result = {}
    for r in REGIONS:
        rid    = r["id"]
        count  = sum(1 for p in pids if rid in patient_conditions.get(p, set()))
        top    = sorted(region_conditions[rid].items(), key=lambda x: -x[1])[:4]
        result[rid] = {
            "prevalence": round(count / n, 4) if n else 0,
            "count":      count,
            "total":      n,
            "topConditions": [{"name": name, "count": cnt} for name, cnt in top],
        }
    print(f"  {label} (n={n}):")
    for r in REGIONS:
        p = result[r["id"]]["prevalence"]
        print(f"    {r['id']:12s}  {p*100:5.1f}%")
    return result

overall = compute_rates(covid_pids,   "Overall")
close   = compute_rates(close_pids,   "Close")
far     = compute_rates(far_pids,     "Far")

save("body_comorbidity.json", {
    "regions":  [{"id": r["id"], "label": r["label"], "color": r["color"]} for r in REGIONS],
    "thresholds": { "close": CLOSE_THRESH, "far": FAR_THRESH },
    "counts":   { "overall": len(covid_pids), "close": len(close_pids), "far": len(far_pids) },
    "overall":  overall,
    "close":    close,
    "far":      far,
})
print("Done.")
