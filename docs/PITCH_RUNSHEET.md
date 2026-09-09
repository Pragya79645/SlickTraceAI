# SlickTrace — Judge Pitch Run-Sheet

**Runtime: 10:00 + Q&A**

Lines in `>` blockquotes are **spoken**. Lines marked **DO:** are **actions on screen**.
The demo is the spine — everything before it is setup, everything after is proof.
If you are running short, cut *Impact*. **Never cut Scenario 3.**

**Two scenes are loaded, in this order and for different reasons.** The real Copernicus
product goes first to establish that this is genuine ESA data and that the system is willing
to say "nothing here". The ground-truth scene follows, and carries the detection and
attribution story. Don't blur them — the honesty of the first is what buys belief in the second.

### The one-liner

> A ship flushes its tanks at night and sails on. The satellite sees the slick six hours
> later — by then that ship is eighty nautical miles away. **SlickTrace closes those six hours.**

---

## 00:00 — The hook `0:20`

> "Last night, somewhere off the Indian coast, a ship flushed its tanks into the sea and
> kept going. Nobody watched it happen."

> "A satellite will photograph that slick about six hours from now. By then the ship is
> eighty nautical miles away and indistinguishable from two hundred others. *That six-hour
> gap is why almost nobody is ever prosecuted for this.*"

> "We built SlickTrace to close it. One satellite image in — a named vessel, its MMSI, its
> flag, and the evidence behind every point we award, out."

---

## 00:20 — The problem is routine, not dramatic `0:50`

> "When you hear 'oil spill' you picture a tanker breaking apart. That's the rare case. The
> everyday case is deliberate — tank washings, bilge water, sludge — discharged at night,
> far offshore, because it is cheaper than paying for port reception facilities."

> "It is a MARPOL Annex I violation. It is also routine. India has a 7,500-kilometre
> coastline and some of the busiest tanker lanes on earth, and our enforcement problem is
> not the law — it is evidence."

*Keep this under a minute. Judges know the problem; you are establishing that you know
which version of it matters.*

---

## 01:10 — Detection is solved. Attribution isn't. `0:35`

> "Systems already exist that spot a slick from radar — Europe runs CleanSeaNet exactly
> this way. They detect, and they raise an alert. Then a human analyst is handed a dark
> patch and a list of ships and asked to connect them by hand."

> "That handoff is the gap. Everything we built lives on the far side of it."

---

## 01:45 — Live demo — the spine `4:30`

> "Rather than describe it, let me run a real investigation. Nothing here is pre-computed."

### 01 · Establish that this is real ESA data — `~40s`

**DO:** Open `/investigate`, drop in **`S1A_RTC_MUMBAI_OFFSHORE_VV.tif`**, click **ANALYZE SCENE**.

> "Before anything else — this is an actual Copernicus Sentinel-1 scene, acquired over the
> Mumbai approaches on the 19th of February. Terrain-corrected ESA data, not a picture we made."

**DO:** Point at the first HUD line as it lands: `EPSG:32643 · 4466×3379 px at 10.0 m/px`.

> "The image tells us where it is. Coordinate system, pixel size and acquisition time come
> straight out of the file — nobody types a latitude."

**DO:** Let it finish. It returns **no detections**.

> "And it says clean water. There *was* no spill here on that date — so that is the correct
> answer. What's underneath it matters more: eighteen dark patches were flagged by the
> network and every one was rejected by our physical gate. Sheltered bays and wind shadows
> damp the sea by about two decibels. Oil damps it by four to ten. **We would rather return
> 'nothing here' than hand an officer a false lead.**"

> "Now let me show you one where there *is* a slick and we know the ground truth."

### 02 · Drop the scene with a known slick

**DO:** Load the ground-truth scene, click **ANALYZE SCENE**.

> "Same pipeline, same settings. Nothing changes but the image."

### 03 · The pipeline executes in front of them — your strongest 20 seconds

**DO:** Say nothing for two seconds. Let the log start streaming, then narrate it as it lands.

> "Every line is the backend reporting a stage it actually finished, timed on the server.
> Nothing is scripted — on a full scene the tiled inference genuinely takes five seconds,
> and you're watching it advance."

> "Seventy-seven tiles, because the detector was trained on 256-pixel crops. That's
> Open-Meteo returning the real surface current for that hour. Five hundred particles going
> backwards six hours. And there — the suspect."

```
[00:00.65] SATELLITE I/O     : GeoTIFF parsed via rasterio · EPSG:32643 · 3000×2000 px at 10.0 m/px
[00:00.85] NEURAL ENGINE     : YOLOv8n-seg forward pass over a 2048×1365 px frame
[00:05.55] TILED INFERENCE   : tile 77/77 · 6 masks kept, 6 rejected by the dark-spot gate
[00:05.63] MASK EXTRACT      : 6.0881 km² at 87.02% confidence · +28.7 dB vs surrounding water
[00:05.77] OCEAN FORCING     : open-meteo + ERA5 · current u=+0.099 v=+0.050 m/s
[00:05.77] LAGRANGIAN DRIFT  : 500-particle ensemble back 6 h → 19.0586°N 72.9300°E
[00:06.11] PRIMARY SUSPECT   : MV KONKAN EXPRESS · MMSI 419003104 · 87.3/100 (HIGH)
```

### 04 · The verdict line

**DO:** Switch to the dashboard. Point at the strip under the header.

> "Read that one line and you have the whole case: slick observed here, origin reconstructed
> six hours earlier there, and this vessel was 0.06 kilometres away when it happened."

### 05 · Replay the reconstruction

**DO:** Press **replay**. Let it run −6 h → observation → +6 h without talking over the first pass.

> "Watch the shaded band. That is not decoration — it is a 500-particle ensemble, and those
> are the 50, 80 and 95 per cent probability bands for where the oil entered the water. It
> is tightest at the sighting and widens the further back we go, which is exactly how
> uncertainty should behave."

### 06 · Why this ship

**DO:** Click the top vessel. Show the four factor bars and the evidence list.

> "Every score breaks into four weighted factors, and every factor hands back the sentence
> that earned it — 'passed within 0.06 kilometres of the reconstructed origin', 'speed
> reduced by 79 per cent near the spill window'. There is no step in this where you have to
> take our word for it."

### 07 · The one that hides — **do not skip this**

**DO:** Switch to **Scenario 3**. Let the ranking settle before speaking.

> "Now the interesting case. In this scenario the guilty vessel never reports a position
> anywhere near the origin — because it switched its transponder off for three hours.
> Switching off AIS *is* the signature of a deliberate discharge."

> "We measure that silence against each ship's own reporting rhythm, so a vessel that simply
> reports rarely is not accused. Then we interpolate where it must have been — and we
> discount that evidence 15 per cent, because an inferred position is weaker than a measured one."

> "MT Jaldhara still ranks first, above a decoy that had perfect AIS coverage three and a
> half kilometres away. A proximity-only system ranks the decoy and loses the culprit entirely."

### 08 · Hand them something they can act on

**DO:** Click **Dossier**. Show the PDF's first page.

> "And the output is not a screenshot. It is a four-page dossier — findings, the map, ranked
> candidates with their evidence, method and limitations — ready to attach to a MARPOL
> Annex I notice."

---

## 06:15 — What actually sets this apart `1:20`

> "Four things, and I'd ask you to hold us to all of them."

| | |
|---|---|
| **Complete chain** | **We don't stop at the dark patch.** Detection, self-georeferencing, drift physics, attribution, ecological exposure, dossier. Most work in this space ends at step one. |
| **Honest uncertainty** | **The origin is an area, not a dot.** A single backtrack line is false precision. We draw the 50/80/95 % probability bands a 500-particle ensemble actually produces. |
| **Explainability** | **Every point traces to a sentence.** Four weighted factors, each returning the human-readable reason it awarded what it did. Nothing in the ranking is a black box. |
| **Dark vessels** | **We catch the ships trying not to be caught.** Cadence-relative silence detection, interpolated position across the gap, and that inference explicitly discounted as weaker evidence. |

---

## 07:35 — We validated it as an experiment `0:55`

> "We didn't just assert the engine works. We held the slick and the reconstructed origin
> fixed and changed only the AIS traffic — so the scorer is the single variable."

| Scenario | What it tests | Ranked first | Score |
|---|---|---|---|
| Baseline | Proximity plus a 79 % speed drop | MV Ocean Star | 91.9 |
| Multi-vessel | Correct pick against six decoys | MV Western Pearl | 92.0 |
| Dark vessel | Culprit findable *only* via transponder silence | MT Jaldhara | 80.0 |

*If you only say one number, say this: in Scenario 3 the continuous-AIS decoy scored **68.8**
and came second. The silence is what separated them.*

---

## 08:30 — Deployable, not a science project `0:40`

> "The model is 6.7 megabytes and runs on CPU. The backend is stateless FastAPI. A full
> scene resolves in about six seconds on a laptop — so this runs on a Coast Guard
> workstation, not a cluster."

> "And it is built for Indian waters specifically: MMSIs resolve to flag states, and the
> ecological layer is the official MoEFCC Ramsar wetland geometry — 99 protected sites,
> intersected as real polygons rather than circles on a map."

---

## 09:10 — What we'd want you to know `0:30`

**DO:** Say this before they ask. Volunteering it is what makes the rest credible.

> "Three honest limits. Our detector's recall is 0.56 — it misses faint slicks, and we put
> that number on screen rather than hide it. The real Copernicus scene we just ran had no
> spill in it, so our detection performance is still evidenced on data where we control the
> ground truth, not on a confirmed real-world incident. And nothing here is proof — it is a
> ranked lead. Confirmation still needs oil fingerprinting and a boarding."

---

## 09:40 — Close `0:20`

> "Detection tells you a crime happened. **SlickTrace tells you who to go and ask.**"

---

# Q&A preparation

Items marked **⚠ TRAP** are the ones that sink teams. Answer in one breath, then stop —
over-explaining a limitation reads as defensiveness.

### Q. Where do the coordinates come from?

Out of the file. A Sentinel-1 GeoTIFF carries its own coordinate system and affine
transform; we read them with rasterio and every mask vertex lands in real WGS84. **Nobody
types a latitude.** For a plain PNG we ask the operator, and we say so on screen.

### Q. Which ocean model are you using?

Open-Meteo Marine for surface currents and ERA5 reanalysis for wind, queried for the actual
date and position, with the valid time shown next to the vectors. If the network is down we
fall back to a calibrated regional field — **and the interface labels it as a fallback**
rather than passing it off as live data.

### ⚠ TRAP — Q. How accurate is your detector, really?

Mask mAP50 of 0.66, precision 0.78, recall 0.56 — read live from the checkpoint, on screen,
in the app. **Recall 0.56 means we miss roughly four in ten faint slicks.** We tuned for
precision over recall deliberately: a false accusation costs an investigator far more than a
missed faint sheen, and the physical dark-spot gate exists to stop sea texture becoming a
false slick.

### Q. Have you run this on a real Sentinel-1 scene?

Yes — you saw it. **Sentinel-1A, 19 February 2026, terrain-corrected, over the Mumbai
approaches**, 45 by 34 kilometres at 10-metre resolution. It georeferenced itself from the
embedded transform and the whole chain completed in ten seconds. That scene had no spill in
it, and the system said so.

*If pushed on how you got it:* Copernicus Sentinel-1 RTC via Microsoft's Planetary Computer,
which serves ESA data already terrain-corrected as cloud-optimised GeoTIFFs — so we read a
45 km window straight out of a 1.8 GB product without downloading the whole thing.

### ⚠ TRAP — Q. What about false positives? Dark patches aren't always oil.

Correct, and that's the hardest part of SAR oil detection. Wind shadows, sheltered bays,
biogenic films and low-wind zones all look like slicks. **We gate on physics, not just on the
network's confidence:** a candidate must be at least 4 dB darker than the water around it.
On the real Mumbai scene the network proposed eighteen dark patches — all of them coastal,
all around 2 dB — and **the gate rejected every one.** That threshold was calibrated on that
scene precisely because we wanted a real-world false-positive population to tune against.

### ⚠ TRAP — Q. Did running real data change anything, or did it just work?

It exposed two bugs, and both are fixed. **First**, calibrated backscatter ships as linear
power; our stretch was being dominated by Mumbai's urban return, which crushed the entire
ocean into about two of 255 grey levels — the model was effectively looking at a black
rectangle. We now convert to decibels and reference the stretch to the water's own modal
backscatter. **Second**, our damping gate was set at 2 dB and let coastal look-alikes
through; real data let us calibrate it to 4. Neither of those was visible on synthetic
imagery, which is exactly why we went and got a real scene.

### Q. What stops a ship simply turning AIS off?

Nothing — which is why we treat the silence as evidence rather than an absence. Scenario 3 in
the demo is exactly this case. We measure a gap against that vessel's own reporting cadence so
sparse reporters aren't accused, interpolate the position across it, and discount that
inference 15 per cent.

### Q. How is this different from CleanSeaNet?

CleanSeaNet detects and alerts, and it does that well. It does not run the drift backwards,
does not score AIS traffic against a reconstructed origin, and does not quantify how uncertain
that origin is. **We start where it stops** — and our ecological layer is Indian Ramsar
geometry, which no European system carries.

### ⚠ TRAP — Q. Would this stand up in court?

No, and we don't claim it would. **It is an investigative prioritisation, not proof of
responsibility** — every screen and the exported dossier say exactly that. What it does is
turn an unrankable list of two hundred ships into three worth boarding, with the reasoning
attached.

### Q. Why six hours?

It matches the typical revisit-to-analysis lag and keeps the drift model inside the window
where holding forcing constant is defensible. Push it further and the uncertainty band grows
faster than the answer is worth — which you can watch happen on the replay.

---

# Figures cheat-sheet

Every number below is one the system reports on screen. If you can't remember one, point at
where the interface shows it rather than guessing.

| Figure | What it is |
|---|---|
| **0.66** | Mask mAP50 · precision 0.78 · recall 0.56 |
| **500** | Monte Carlo particles → 50/80/95 % bands |
| **35 / 20 / 30 / 15** | Proximity · timing · trajectory · behaviour weights |
| **99** | Official MoEFCC Ramsar polygons |
| **6 h** | Hindcast horizon, 30-minute steps |
| **3 %** | Wind-drift factor on surface current |
| **~6 s** | Full scene, 17 pipeline stages, on CPU |
| **419** | India's MMSI prefix — flags resolve from it |
| **4 dB** | Damping gate. Oil damps 4–10 dB; look-alikes 1–3 |
| **18 → 0** | Dark patches proposed vs kept on the real Mumbai scene |
| **19 Feb 2026** | Real scene date · Sentinel-1A · EPSG:32643 · 45 × 34 km |

### The real scene, if you're asked for specifics

`S1A_IW_GRDH_1SDV_20260219T010312` — Copernicus Sentinel-1A, RTC (terrain-corrected),
UTM zone 43N, 10 m/px, sourced via Microsoft Planetary Computer. Local file:
`backend/data/demo/S1A_RTC_MUMBAI_OFFSHORE_VV.tif` (53 MB window of a 1.84 GB product).

---

*SlickTrace AI · Smart India Hackathon 2026 · SAR detection, Lagrangian hindcast, Monte Carlo
uncertainty and AIS attribution. Attribution scores rank consistency with the reconstructed
discharge — they are an investigative prioritisation, not proof of responsibility.*
