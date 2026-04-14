"""
Build county-to-county patient flow data for COVID treatment visualization.
Run from covid-viz/: python scripts/process_flow.py
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

# ── Load patients ─────────────────────────────────────────────────────────────
print("Loading patients...")
patients = {}
county_coords = defaultdict(list)   # county -> [(lat, lon)]

with open(os.path.join(DATA_DIR, "patients.csv")) as f:
    for row in csv.DictReader(f):
        if not row["LAT"] or not row["LON"] or not row["COUNTY"]:
            continue
        lat = float(row["LAT"])
        lon = float(row["LON"])
        county = row["COUNTY"].replace(" County", "").strip()
        patients[row["Id"]] = {"county": county, "lat": lat, "lon": lon}
        county_coords[county].append((lat, lon))

# County centroids (mean of patient positions — good approximation)
county_centroids = {}
for county, coords in county_coords.items():
    county_centroids[county] = {
        "lat": sum(c[0] for c in coords) / len(coords),
        "lon": sum(c[1] for c in coords) / len(coords),
        "patients": len(coords),
    }
print(f"  {len(county_centroids)} counties")

# ── Load organizations ────────────────────────────────────────────────────────
print("Loading organizations...")
orgs = {}   # org_id -> county

with open(os.path.join(DATA_DIR, "organizations.csv")) as f:
    for row in csv.DictReader(f):
        if not row["LAT"] or not row["LON"]:
            continue
        # Snap org to nearest county centroid by matching city/state or brute-force nearest
        # Use the CITY column to look up county via a quick nearest-centroid approach
        lat = float(row["LAT"])
        lon = float(row["LON"])
        # Find closest county centroid (Euclidean OK for small region)
        best_county = min(
            county_centroids.keys(),
            key=lambda c: (county_centroids[c]["lat"] - lat)**2 + (county_centroids[c]["lon"] - lon)**2
        )
        orgs[row["Id"]] = best_county

print(f"  {len(orgs)} organizations mapped to counties")

# ── COVID patient set ─────────────────────────────────────────────────────────
print("Loading conditions...")
covid_pids = set()
with open(os.path.join(DATA_DIR, "conditions.csv")) as f:
    for row in csv.DictReader(f):
        if "COVID" in row["DESCRIPTION"].upper():
            covid_pids.add(row["PATIENT"])
print(f"  {len(covid_pids)} COVID patients")

# ── Build county→county flows ─────────────────────────────────────────────────
print("Building flows...")
# flow[(src_county, dst_county)][encounter_class] += count
flows = defaultdict(lambda: defaultdict(int))

with open(os.path.join(DATA_DIR, "encounters.csv")) as f:
    for row in csv.DictReader(f):
        pid = row["PATIENT"]
        if pid not in covid_pids:
            continue
        p = patients.get(pid)
        org_county = orgs.get(row["ORGANIZATION"])
        if not p or not org_county:
            continue
        src = p["county"]
        dst = org_county
        cls = row["ENCOUNTERCLASS"]
        flows[(src, dst)][cls] += 1

# Flatten into list
ALL_CLASSES = ["emergency", "inpatient", "urgentcare", "outpatient", "ambulatory", "wellness"]

flow_list = []
for (src, dst), class_counts in flows.items():
    if src not in county_centroids or dst not in county_centroids:
        continue
    total = sum(class_counts.values())
    entry = {
        "src": src, "dst": dst, "total": total,
        **{cls: class_counts.get(cls, 0) for cls in ALL_CLASSES}
    }
    flow_list.append(entry)

# Sort by total descending
flow_list.sort(key=lambda x: -x["total"])
print(f"  {len(flow_list)} county→county flow pairs")

# Cross-county only (for clarity, separate intra from inter)
cross = [f for f in flow_list if f["src"] != f["dst"]]
intra = [f for f in flow_list if f["src"] == f["dst"]]
print(f"  {len(cross)} cross-county, {len(intra)} intra-county")

# ── Top treatment orgs for COVID patients ────────────────────────────────────
print("Finding top treatment organizations...")
org_covid_counts = defaultdict(lambda: defaultdict(int))   # org_id -> class -> count
org_meta = {}

with open(os.path.join(DATA_DIR, "encounters.csv")) as f:
    for row in csv.DictReader(f):
        if row["PATIENT"] not in covid_pids:
            continue
        oid = row["ORGANIZATION"]
        org_covid_counts[oid][row["ENCOUNTERCLASS"]] += 1

with open(os.path.join(DATA_DIR, "organizations.csv")) as f:
    for row in csv.DictReader(f):
        oid = row["Id"]
        if oid not in org_covid_counts:
            continue
        total = sum(org_covid_counts[oid].values())
        org_meta[oid] = {
            "name":   row["NAME"],
            "lat":    float(row["LAT"]),
            "lon":    float(row["LON"]),
            "county": orgs.get(oid, ""),
            "total":  total,
            **{cls: org_covid_counts[oid].get(cls, 0) for cls in ALL_CLASSES},
        }

# Top 80 organizations by COVID encounter volume
top_orgs = sorted(org_meta.values(), key=lambda x: -x["total"])[:80]
print(f"  {len(top_orgs)} top orgs")

# ── Save ──────────────────────────────────────────────────────────────────────
save("patient_flow.json", {
    "centroids":  county_centroids,
    "flows":      flow_list,
    "crossFlows": cross,
    "classes":    ALL_CLASSES,
})

save("top_orgs.json", top_orgs)

print("\nDone.")
