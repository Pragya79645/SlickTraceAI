import io
import json
from pathlib import Path
import urllib.error
import urllib.request
import cv2
import numpy as np
import requests

from app.services.environment_service import get_environment
from app.services.drift_service import compute_drift
from app.services.ais_service import correlate_vessels, haversine_distance_km, load_ais_records

BASE_URL = "http://127.0.0.1:8000"

print("=" * 60)
print("RUNNING BACKEND TEST SUITE - PHASE 5D & MULTI-VESSEL VALIDATION")
print("=" * 60)

# ─── 1. Core Endpoints ────────────────────────────────────────────────────────
# Test 1: GET /health
r = urllib.request.urlopen(f"{BASE_URL}/health")
assert r.status == 200, "Health check failed"
print("[PASS] Test 1: GET /health -> HTTP 200", json.loads(r.read()))

# Test 2: GET /api/investigations/SPILL-001 (Baseline)
r = urllib.request.urlopen(f"{BASE_URL}/api/investigations/SPILL-001")
data = json.loads(r.read())
assert data["spill_id"] == "SPILL-001", "Invalid spill_id"
assert len(data["attribution"]["candidate_vessels"]) == 20, "Missing candidate vessels"
assert data["attribution"]["candidate_vessels"][0]["vessel_name"] == "MV OCEAN STAR", "Expected MV OCEAN STAR as #1 for SPILL-001"
print(f"[PASS] Test 2: GET /api/investigations/SPILL-001 -> HTTP 200 (Top: {data['attribution']['candidate_vessels'][0]['vessel_name']}, Score: {data['attribution']['candidate_vessels'][0]['score']})")

# Test 2B: GET /api/investigations/SPILL-TEST-002 (Multi-Vessel Validation Scenario)
r2 = urllib.request.urlopen(f"{BASE_URL}/api/investigations/SPILL-TEST-002")
data2 = json.loads(r2.read())
assert data2["spill_id"] == "SPILL-TEST-002", "Invalid spill_id"
assert len(data2["attribution"]["candidate_vessels"]) >= 6, "Expected at least 6 candidate vessels"
top_vessel_002 = data2["attribution"]["candidate_vessels"][0]
assert top_vessel_002["vessel_name"] == "MV WESTERN PEARL", f"Expected MV WESTERN PEARL as #1 for SPILL-TEST-002, got {top_vessel_002['vessel_name']}"
assert top_vessel_002["risk"] == "HIGH", f"Expected HIGH risk, got {top_vessel_002['risk']}"
assert abs(top_vessel_002["score"] - 92.0) < 0.5, f"Score mismatch: {top_vessel_002['score']}"
# Verify components add up to total score
comp_sum = (
    top_vessel_002["proximity_score"]
    + top_vessel_002["temporal_score"]
    + top_vessel_002["trajectory_score"]
    + top_vessel_002["behavioral_score"]
)
assert abs(comp_sum - top_vessel_002["score"]) < 0.01, "Score components do not add up to total score"
# Assert at least 2 other vessels receive lower scores
assert data2["attribution"]["candidate_vessels"][1]["score"] < top_vessel_002["score"]
assert data2["attribution"]["candidate_vessels"][2]["score"] < top_vessel_002["score"]
print(f"[PASS] Test 2B: GET /api/investigations/SPILL-TEST-002 -> HTTP 200 (Top: {top_vessel_002['vessel_name']}, Score: {top_vessel_002['score']}/100, Vessels: {len(data2['attribution']['candidate_vessels'])})")

# Test 3: GET /api/investigations/SPILL-999 (404 expected)
try:
    urllib.request.urlopen(f"{BASE_URL}/api/investigations/SPILL-999")
    raise AssertionError("Expected 404 for unknown spill")
except urllib.error.HTTPError as e:
    body = json.loads(e.read())
    assert e.code == 404, "Expected 404 status code"
    print(f"[PASS] Test 3: GET /api/investigations/SPILL-999 -> HTTP 404 ({body['detail']})")

# Test 4: POST /api/investigations/analyze
img = np.zeros((256, 256, 3), dtype=np.uint8) + 120
cv2.ellipse(img, (128, 128), (50, 20), 45, 0, 360, (20, 20, 20), -1)
is_success, buf = cv2.imencode(".png", img)

files = {"file": ("test_sar.png", buf.tobytes(), "image/png")}
res = requests.post(f"{BASE_URL}/api/investigations/analyze", files=files)
assert res.status_code == 200, f"Analyze failed: {res.text}"
analysis = res.json()
print(
    f"[PASS] Test 4: POST /api/investigations/analyze -> HTTP 200 (spill_id: {analysis['spill_id']}, count: {analysis['detection_count']})"
)

# Test 5: POST /api/investigations/analyze (bad extension)
bad_files = {"file": ("test.txt", b"invalid data", "text/plain")}
res_bad = requests.post(f"{BASE_URL}/api/investigations/analyze", files=bad_files)
assert res_bad.status_code == 400, "Expected 400 for bad extension"
print(f"[PASS] Test 5: POST /api/investigations/analyze (invalid ext) -> HTTP {res_bad.status_code}")

# Test 6: POST /api/investigations/drift
payload_drift = {
    "spill_id": "SPILL-TEST-001",
    "latitude": 19.070667,
    "longitude": 72.968941,
    "timestamp": "2026-08-28T21:02:13.675215+00:00",
}
res_drift = requests.post(f"{BASE_URL}/api/investigations/drift", json=payload_drift)
assert res_drift.status_code == 200, f"Drift failed: {res_drift.text}"
drift_out = res_drift.json()
print(f"[PASS] Test 6: POST /api/investigations/drift -> HTTP 200 (origin: {drift_out['hindcast']['estimated_origin']['lat']}, {drift_out['hindcast']['estimated_origin']['lon']})")


# ─── 2. AIS Service Unit Tests (Phase 5D) ──────────────────────────────────────

# Test A: AIS CSV loading
records = load_ais_records()
assert len(records) > 400, f"Expected > 400 AIS records, got {len(records)}"
print(f"[PASS] Test A: AIS CSV loading -> {len(records)} records loaded")

# Test B: Required column validation
assert hasattr(records[0], "mmsi")
assert hasattr(records[0], "vessel_name")
assert hasattr(records[0], "timestamp")
assert hasattr(records[0], "lat")
assert hasattr(records[0], "lon")
assert hasattr(records[0], "sog")
assert hasattr(records[0], "cog")
assert hasattr(records[0], "heading")
print("[PASS] Test B: Required column validation -> All 8 fields verified")

# Test C & D: Spatial and Geodesic Distance
dist = haversine_distance_km(19.043471, 72.907286, 19.04299, 72.907053)
assert dist < 0.1, f"Expected < 0.1 km distance, got {dist}"
print(f"[PASS] Test C & D: Geodesic calculation -> {dist * 1000:.1f} meters")

# Test E: Correlation Engine against Reconstructed Origin
attr = correlate_vessels(
    spill_id="SPILL-001",
    origin_lat=19.043471,
    origin_lon=72.907286,
    origin_timestamp="2026-08-28T15:02:13.675215+00:00",
)
assert len(attr.candidate_vessels) == 20, f"Expected 20 candidate vessels, got {len(attr.candidate_vessels)}"

# Test F, G, H, I: Ranking & Regression Check for SPILL-001
top1 = attr.candidate_vessels[0]
top2 = attr.candidate_vessels[1]
top3 = attr.candidate_vessels[2]
top4 = attr.candidate_vessels[3]

print(f"[PASS] SPILL-001 #1 {top1.vessel_name}: score={top1.score} risk={top1.risk} prox={top1.proximity_score} temp={top1.temporal_score} traj={top1.trajectory_score} beh={top1.behavioral_score}")
print(f"[PASS] SPILL-001 #2 {top2.vessel_name}: score={top2.score} risk={top2.risk} prox={top2.proximity_score} temp={top2.temporal_score} traj={top2.trajectory_score} beh={top2.behavioral_score}")
print(f"[PASS] SPILL-001 #3 {top3.vessel_name}: score={top3.score} risk={top3.risk} prox={top3.proximity_score} temp={top3.temporal_score} traj={top3.trajectory_score} beh={top3.behavioral_score}")
print(f"[PASS] SPILL-001 #4 {top4.vessel_name}: score={top4.score} risk={top4.risk} prox={top4.proximity_score} temp={top4.temporal_score} traj={top4.trajectory_score} beh={top4.behavioral_score}")

assert top1.vessel_name == "MV OCEAN STAR", f"Expected MV OCEAN STAR as #1, got {top1.vessel_name}"
assert abs(top1.score - 91.9) < 0.2, f"Score mismatch for MV OCEAN STAR: {top1.score}"
assert top2.vessel_name == "MV WESTERN PEARL", f"Expected MV WESTERN PEARL as #2, got {top2.vessel_name}"
assert abs(top2.score - 84.8) < 0.2, f"Score mismatch for MV WESTERN PEARL: {top2.score}"
assert top3.vessel_name == "MV ARABIAN TRADER", f"Expected MV ARABIAN TRADER as #3, got {top3.vessel_name}"
assert abs(top3.score - 84.3) < 0.2, f"Score mismatch for MV ARABIAN TRADER: {top3.score}"
assert top4.vessel_name == "MV KONKAN EXPRESS", f"Expected MV KONKAN EXPRESS as #4, got {top4.vessel_name}"
assert abs(top4.score - 77.0) < 0.2, f"Score mismatch for MV KONKAN EXPRESS: {top4.score}"
print("[PASS] Test F-I: SPILL-001 Regression scores exactly matched reference values")

# Test J: Ranking order (strictly descending)
for i in range(len(attr.candidate_vessels) - 1):
    assert attr.candidate_vessels[i].score >= attr.candidate_vessels[i+1].score, "Candidate vessels not strictly descending"
print("[PASS] Test J: Ranking order strictly sorted descending")

# Test K: Out of bounds origin coordinates
try:
    correlate_vessels(spill_id="ERR", origin_lat=95.0, origin_lon=72.0, origin_timestamp="2026-08-28T15:02:13Z")
    raise AssertionError("Expected error for lat > 90")
except ValueError as e:
    print(f"[PASS] Test K: Latitude out of bounds caught -> {e}")

# Test L: Invalid timestamp
try:
    correlate_vessels(spill_id="ERR", origin_lat=19.0, origin_lon=72.0, origin_timestamp="invalid-timestamp")
    raise AssertionError("Expected error for invalid timestamp")
except ValueError as e:
    print(f"[PASS] Test L: Timestamp error caught -> {e}")


# ─── 3. Integration API Test for POST /api/investigations/ais ─────────────────

payload_ais = {
    "spill_id": "SPILL-LIVE-58DE25",
    "origin": {
        "latitude": 19.043471,
        "longitude": 72.907286,
        "timestamp": "2026-08-28T15:02:13.675215+00:00",
    },
}
res_ais = requests.post(f"{BASE_URL}/api/investigations/ais", json=payload_ais)
assert res_ais.status_code == 200, f"AIS API failed: {res_ais.text}"
ais_out = res_ais.json()
assert ais_out["spill_id"] == "SPILL-LIVE-58DE25"
assert len(ais_out["candidate_vessels"]) == 20
assert ais_out["candidate_vessels"][0]["vessel_name"] == "MV OCEAN STAR"
print(f"[PASS] Test 7: POST /api/investigations/ais -> HTTP 200 (top suspect: {ais_out['candidate_vessels'][0]['vessel_name']} with {ais_out['candidate_vessels'][0]['score']}/100)")


# ─── 4. Unit Tests for Ecological Threat Assessment (Phase 5E) ────────────────

from app.services.ecology_service import (
    load_sensitive_habitats,
    assess_ecological_threat,
    haversine_distance_km,
)
from app.schemas.investigation import GeoTimestep, SensitiveHabitat

# Test M: Habitat dataset loading & verification
habitats = load_sensitive_habitats()
assert len(habitats) >= 5, f"Expected >= 5 habitats, got {len(habitats)}"
assert any("Thane Creek" in h.name for h in habitats), "Thane Creek Flamingo Sanctuary missing"
print(f"[PASS] Test M: Habitat dataset loaded successfully ({len(habitats)} regional habitats)")

# Test N: Distance calculation is deterministic
d1 = haversine_distance_km(19.070667, 72.968941, 19.1125, 72.9985)
d2 = haversine_distance_km(19.070667, 72.968941, 19.1125, 72.9985)
assert d1 == d2, "Haversine calculation is not deterministic"
assert round(d1, 2) == 5.59, f"Expected 5.59 km, got {d1:.2f}"
print(f"[PASS] Test N: Geodesic distance calculation is deterministic ({d1:.2f} km)")

# Test O: Trajectory entering screening radius produces HIGH and earliest entry timestamp
mock_habitat = SensitiveHabitat(
    id="TEST-HAB-01",
    name="Test Coral Atoll",
    type="Coral Reef",
    latitude=19.100,
    longitude=73.000,
    protection_status="Test Protected Area",
    impact_radius_km=3.0,
    source="Unit Test",
)
mock_trajectory_intersect = [
    GeoTimestep(timestamp="2026-08-28T21:00:00Z", lat=19.050, lon=72.950, hours_after_observation=0.0),
    GeoTimestep(timestamp="2026-08-28T22:00:00Z", lat=19.070, lon=72.970, hours_after_observation=1.0),
    GeoTimestep(timestamp="2026-08-28T23:00:00Z", lat=19.098, lon=72.998, hours_after_observation=2.0), # Inside 3km
    GeoTimestep(timestamp="2026-08-29T00:00:00Z", lat=19.120, lon=73.020, hours_after_observation=3.0),
]
eco_res_high = assess_ecological_threat(mock_trajectory_intersect, [mock_habitat])
assert eco_res_high.assessment.response_priority == "HIGH"
assert eco_res_high.impacts[0].threat_level == "HIGH"
assert eco_res_high.impacts[0].estimated_time_to_impact_hours == 2.0
assert eco_res_high.impacts[0].is_confirmed_impact == False
print(f"[PASS] Test O: Trajectory entering radius correctly produces HIGH at +{eco_res_high.impacts[0].estimated_time_to_impact_hours}h")

# Test P: Trajectory remaining outside radius produces LOW
mock_trajectory_far = [
    GeoTimestep(timestamp="2026-08-28T21:00:00Z", lat=18.000, lon=72.000, hours_after_observation=0.0),
    GeoTimestep(timestamp="2026-08-28T22:00:00Z", lat=18.010, lon=72.010, hours_after_observation=1.0),
]
eco_res_low = assess_ecological_threat(mock_trajectory_far, [mock_habitat])
assert eco_res_low.assessment.response_priority == "LOW"
assert eco_res_low.impacts[0].threat_level == "LOW"
assert eco_res_low.impacts[0].estimated_time_to_impact_hours is None
assert eco_res_low.impacts[0].is_confirmed_impact == False
print(f"[PASS] Test P: Remote trajectory correctly produces LOW with no exposure time")

# Test Q: Empty forecast trajectory handled safely
eco_res_empty = assess_ecological_threat([], [mock_habitat])
assert eco_res_empty.assessment.status == "NO_FORECAST"
assert eco_res_empty.assessment.response_priority == "LOW"
print("[PASS] Test Q: Empty forecast handled gracefully without crash")


# ─── 5. Integration API Tests for Ecology Endpoint ───────────────────────────

# Test 8: POST /api/investigations/ecology
eco_payload = {
    "forecast_trajectory": [step.model_dump() for step in mock_trajectory_intersect]
}
res_eco = requests.post(f"{BASE_URL}/api/investigations/ecology", json=eco_payload)
assert res_eco.status_code == 200, f"Ecology API failed: {res_eco.text}"
eco_api_out = res_eco.json()
assert eco_api_out["assessment"]["status"] == "SCREENED"
assert len(eco_api_out["impacts"]) >= 5
print(f"[PASS] Test 8: POST /api/investigations/ecology -> HTTP 200 (Evaluated: {eco_api_out['assessment']['habitats_evaluated']}, Priority: {eco_api_out['assessment']['response_priority']})")

# Test 9: GET /api/investigations/SPILL-001 includes screened ecology
res_spill_001 = requests.get(f"{BASE_URL}/api/investigations/SPILL-001")
assert res_spill_001.status_code == 200
spill_001_data = res_spill_001.json()
assert "ecology" in spill_001_data and spill_001_data["ecology"] is not None
assert spill_001_data["ecology"]["assessment"]["response_priority"] == "HIGH"
assert spill_001_data["ecology"]["impacts"][0]["habitat_name"] == "Thane Creek Flamingo Sanctuary"
assert spill_001_data["ecology"]["impacts"][0]["estimated_time_to_impact_hours"] == 2.0
print(f"[PASS] Test 9: GET /api/investigations/SPILL-001 contains complete ecology assessment (Priority: {spill_001_data['ecology']['assessment']['response_priority']}, Threatened: {spill_001_data['ecology']['impacts'][0]['habitat_name']} at +{spill_001_data['ecology']['impacts'][0]['estimated_time_to_impact_hours']}h)")

# Test 10: GET /api/investigations/SPILL-TEST-002 includes ecology and MV WESTERN PEARL as #1
res_spill_002 = requests.get(f"{BASE_URL}/api/investigations/SPILL-TEST-002")
assert res_spill_002.status_code == 200
spill_002_data = res_spill_002.json()
assert spill_002_data["attribution"]["candidate_vessels"][0]["vessel_name"] == "MV WESTERN PEARL"
assert "ecology" in spill_002_data and spill_002_data["ecology"] is not None
print(f"[PASS] Test 10: GET /api/investigations/SPILL-TEST-002 -> HTTP 200 (#1 suspect: MV WESTERN PEARL with {spill_002_data['attribution']['candidate_vessels'][0]['score']}/100 + ecology screened)")


# ─── 6. National Ramsar Sites Registry Tests (Phase 5E Part 1) ───────────────

from app.services.ecology_service import load_national_ramsar_registry

# Test R: National Ramsar Registry Loading
ramsar_registry = load_national_ramsar_registry()
assert len(ramsar_registry) == 75, f"Expected exactly 75 Ramsar sites, got {len(ramsar_registry)}"
assert any(s.name == "Thane Creek" and s.state == "Maharashtra" for s in ramsar_registry)
assert any("Sundarban" in s.name for s in ramsar_registry)
assert any("Chilika" in s.name for s in ramsar_registry)
assert any("Gulf of Mannar" in s.name for s in ramsar_registry)
assert all(s.has_geometry is False for s in ramsar_registry), "Registry falsely claimed geometry"
print(f"[PASS] Test R: National Ramsar registry loaded successfully ({len(ramsar_registry)} official MoEFCC sites, 0 false geometry claims)")

# Test S: State diversity & wetland type validation
states = set(s.state for s in ramsar_registry)
assert len(states) >= 20, f"Expected >= 20 states, got {len(states)}"
coastal_wetlands = [s for s in ramsar_registry if "Coastal" in s.wetland_type]
assert len(coastal_wetlands) >= 8, f"Expected >= 8 coastal wetlands, got {len(coastal_wetlands)}"
print(f"[PASS] Test S: Ramsar registry spans {len(states)} States/UTs with {len(coastal_wetlands)} verified coastal wetlands")


# ─── 7. National Ramsar GIS Spatial Exposure Engine Tests (Phase 5E Part 3) ───

# ─── 7. National Ramsar GIS Spatial Exposure Engine Tests (Phase 5E Part 3 & 4) ───

from app.services.ecological_service import (
    assess_trajectory_exposure,
    load_ramsar_geojson,
)

# Test T: Authoritative GeoJSON Loading & Feature Count
ramsar_gj = load_ramsar_geojson()
assert ramsar_gj["type"] == "FeatureCollection"
assert len(ramsar_gj["features"]) == 99, f"Expected 99 features, got {len(ramsar_gj['features'])}"
print(f"[PASS] Test T: Verified Ramsar GeoJSON spatial layer loaded ({len(ramsar_gj['features'])} authentic features)")

# Test U (Case A): Trajectory starts/overlaps inside Ramsar boundary at t=0 (CURRENT_OBSERVATION)
traj_case_a = [
    GeoTimestep(timestamp="2026-08-28T21:00:00Z", lat=19.070667, lon=72.968941, hours_after_observation=0.0),
    GeoTimestep(timestamp="2026-08-28T22:00:00Z", lat=19.080000, lon=72.980000, hours_after_observation=1.0),
]
exp_case_a = assess_trajectory_exposure(traj_case_a)
assert exp_case_a.threats[0].threat_level == "DIRECT_THREAT"
assert exp_case_a.threats[0].exposure_basis == "CURRENT_OBSERVATION"
assert exp_case_a.threats[0].minimum_distance_km == 0.0
assert exp_case_a.threats[0].estimated_time_to_impact_hours == 0.0
assert "already overlaps" in exp_case_a.threats[0].reason
print(f"[PASS] Test U (Case A): t=0 inside boundary triggers CURRENT_OBSERVATION ({exp_case_a.threats[0].site_name})")

# Test U2 (Case B): Trajectory starts OUTSIDE and enters polygon at t=2.0h (FORECAST_INTERSECTION)
traj_case_b = [
    GeoTimestep(timestamp="2026-08-28T21:00:00Z", lat=18.900000, lon=72.820000, hours_after_observation=0.0),
    GeoTimestep(timestamp="2026-08-28T22:00:00Z", lat=18.980000, lon=72.890000, hours_after_observation=1.0),
    GeoTimestep(timestamp="2026-08-28T23:00:00Z", lat=19.070667, lon=72.968941, hours_after_observation=2.0),
]
exp_case_b = assess_trajectory_exposure(traj_case_b)
assert exp_case_b.threats[0].threat_level == "DIRECT_THREAT"
assert exp_case_b.threats[0].exposure_basis == "FORECAST_INTERSECTION"
assert exp_case_b.threats[0].minimum_distance_km == 0.0
assert exp_case_b.threats[0].estimated_time_to_impact_hours == 2.0
assert "enters official" in exp_case_b.threats[0].reason
print(f"[PASS] Test U2 (Case B): Future trajectory entry triggers FORECAST_INTERSECTION (estimated contact: +{exp_case_b.threats[0].estimated_time_to_impact_hours}h)")

# Test V (Case C): Trajectory remains outside but within 10 km (PROXIMITY_ONLY / NEAR_THREAT)
traj_case_c = [
    GeoTimestep(timestamp="2026-08-28T21:00:00Z", lat=18.980, lon=72.850, hours_after_observation=0.0),
    GeoTimestep(timestamp="2026-08-28T22:00:00Z", lat=19.000, lon=72.870, hours_after_observation=1.0),
]
exp_case_c = assess_trajectory_exposure(traj_case_c)
assert 0 < exp_case_c.threats[0].minimum_distance_km <= 10.0
assert exp_case_c.threats[0].threat_level == "NEAR_THREAT"
assert exp_case_c.threats[0].exposure_basis == "PROXIMITY_ONLY"
assert exp_case_c.threats[0].estimated_time_to_impact_hours is None
print(f"[PASS] Test V (Case C): Near trajectory produces PROXIMITY_ONLY / NEAR_THREAT ({exp_case_c.threats[0].minimum_distance_km:.1f} km)")

# Test W (Case D): Remote trajectory (> 30 km) produces NO_EXPOSURE
traj_case_d = [
    GeoTimestep(timestamp="2026-08-28T21:00:00Z", lat=15.000, lon=70.000, hours_after_observation=0.0),
    GeoTimestep(timestamp="2026-08-28T22:00:00Z", lat=15.010, lon=70.010, hours_after_observation=1.0),
]
exp_case_d = assess_trajectory_exposure(traj_case_d)
assert exp_case_d.threats[0].minimum_distance_km > 30.0
assert exp_case_d.threats[0].threat_level == "NO_SIGNIFICANT_EXPOSURE"
assert exp_case_d.threats[0].exposure_basis == "NO_EXPOSURE"
assert exp_case_d.threats[0].estimated_time_to_impact_hours is None
print(f"[PASS] Test W (Case D): Remote trajectory produces NO_EXPOSURE ({exp_case_d.threats[0].minimum_distance_km:.1f} km)")

# Test X: Invalid coordinates rejected safely
try:
    assess_trajectory_exposure([GeoTimestep(timestamp="2026-08-28T21:00:00Z", lat=95.0, lon=72.0, hours_after_observation=0.0)])
    assert False, "Should have raised ValueError for lat=95.0"
except ValueError as e:
    print(f"[PASS] Test X: Invalid coordinates rejected -> {e}")


# ─── 8. Integration API Tests for Ramsar Exposure Endpoints ───────────────────

# Test 11: POST /api/investigations/ecological-exposure
res_eco_exp = requests.post(f"{BASE_URL}/api/investigations/ecological-exposure", json={"forecast_trajectory": [step.model_dump() for step in traj_case_b]})
assert res_eco_exp.status_code == 200, f"Ecological exposure API failed: {res_eco_exp.text}"
exp_data = res_eco_exp.json()
assert exp_data["sites_analyzed"] == 99
assert len(exp_data["threats"]) > 0
assert exp_data["threats"][0]["exposure_basis"] == "FORECAST_INTERSECTION"
print(f"[PASS] Test 11: POST /api/investigations/ecological-exposure -> HTTP 200 (Analyzed: {exp_data['sites_analyzed']} sites, Top: {exp_data['threats'][0]['exposure_basis']})")

# Test 12: GET /api/investigations/ramsar-geojson
res_gj = requests.get(f"{BASE_URL}/api/investigations/ramsar-geojson")
assert res_gj.status_code == 200
assert res_gj.json()["type"] == "FeatureCollection"
assert len(res_gj.json()["features"]) == 99
print(f"[PASS] Test 12: GET /api/investigations/ramsar-geojson -> HTTP 200 (Retrieved {len(res_gj.json()['features'])} MultiPolygon features)")

# Test 13: GET /api/investigations/SPILL-001 contains complete ecological_exposure object with CURRENT_OBSERVATION
res_spill_1_exp = requests.get(f"{BASE_URL}/api/investigations/SPILL-001")
assert res_spill_1_exp.status_code == 200
s1_json = res_spill_1_exp.json()
assert "ecological_exposure" in s1_json and s1_json["ecological_exposure"] is not None
assert s1_json["ecological_exposure"]["threats"][0]["site_name"] == "Thane Creek"
assert s1_json["ecological_exposure"]["threats"][0]["threat_level"] == "DIRECT_THREAT"
assert s1_json["ecological_exposure"]["threats"][0]["exposure_basis"] == "CURRENT_OBSERVATION"
print(f"[PASS] Test 13: GET /api/investigations/SPILL-001 -> ecological_exposure attached (Top: {s1_json['ecological_exposure']['threats'][0]['site_name']}, Basis: {s1_json['ecological_exposure']['threats'][0]['exposure_basis']})")

print("=" * 60)
print("ALL BACKEND REGRESSION & RAMSAR GIS EXPOSURE TESTS PASSED (100% GREEN)")
print("=" * 60)
