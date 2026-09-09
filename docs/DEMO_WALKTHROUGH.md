# SlickTrace — Screen-by-Screen Demo Walkthrough

**The companion to `PITCH_RUNSHEET.md`.** The run-sheet is the timed script. This is the
click-by-click guide: what's on screen, what to point at, and what to say in plain language.

**Golden rule: never say a technical word without immediately saying what it means.**
Judges are smart but they are not oceanographers. A judge who understands you will vote for
you; a judge who feels lectured will not.

---

## ⚠ Read this before you present — two things that will bite you

**1. Do not open a bookmarked live-upload URL.**
Your screenshot shows this:

> `Case "SPILL-LIVE-342916" could not be loaded (404 Not Found). Showing SPILL-001 instead.`

Live uploads are stored on a rolling basis and older ones drop off. **Always upload fresh
during the demo** — never navigate to a saved `?case=SPILL-LIVE-…` link. The fallback works
gracefully, but a red error banner is not what you want a judge reading.

**2. On the SPILL-001 demo case the map panel reads `source: prototype_local_vector_field`.**
That is honest — the saved demo case uses stored ocean values so it is reproducible offline.
**Live uploads fetch real Open-Meteo data.** If a judge is reading closely and asks, say:

> "Good catch. The saved demo case uses stored values so it runs identically every time,
> including with no internet. When we upload live, it queries the real ocean data — you saw
> that in the log a minute ago."

**Never claim the demo case is using live ocean data.** It says otherwise right on screen.

**Setup checklist**
- Backend running, frontend running, browser at `localhost:3000`
- Browser zoom at ~90% so the whole dashboard fits without scrolling
- Both images ready on the desktop with obvious names:
  - `1-CLEAN-OCEAN.tif` (the real Copernicus scene)
  - `2-OIL-SPILL.png` (the scene with a slick)
- Close every other tab. Notifications off.

---

# PART 1 · The landing page — 45 seconds

**Goal: curiosity, not information.** Do not read the page aloud. Let them read while you
say three sentences.

**DO:** Open `localhost:3000`. Let the animated background settle for a beat.

> "This is SlickTrace. The one-line version is at the top."

**DO:** Point at the headline.

> "A dark patch on a radar image. Six hours back — a name and an MMSI. An MMSI is a ship's
> licence plate."

**DO:** Scroll slowly to *How it works*. Don't stop on it long.

> "Four steps. We find the oil, we run the ocean backwards to work out where it came from,
> we check which ships were there, and we check what it's about to hit."

**DO:** Scroll to the model numbers.

> "And every number our system claims about itself is on this page. We didn't put our best
> figure up and hide the rest — that recall number of 0.56 means we miss some faint slicks,
> and we'd rather you know that from us."

**Then stop scrolling and say:**

> "Rather than talk about it — let me run it."

*Why this works: you've promised honesty before showing anything. Everything after this
lands differently.*

---

# PART 2 · The clean ocean image — proving it doesn't cry wolf

**This is the trust-builder. Most teams skip it. Do not skip it.**

**DO:** Click **Upload** (top right) → drag in `1-CLEAN-OCEAN.tif`.

> "First, a real satellite image. This is genuine European Space Agency data — a Sentinel-1
> radar pass over the sea outside Mumbai, taken on the 19th of February."

**DO:** Click **ANALYZE SCENE**. As the log starts streaming:

> "Now, radar doesn't take photographs — it measures roughness. Wind puts tiny ripples on
> the sea, radar bounces off those ripples and comes back bright. **Oil flattens those
> ripples.** So a slick shows up as a dark, calm patch on a rough bright sea. That's the
> physics the whole system rests on."

**DO:** Point at the first line of the log.

> "Watch this. It's reading the coordinate system out of the image file itself. The picture
> knows where on Earth it was taken — we never type in a location."

**DO:** Let the tile counter run. This takes a few seconds — fill it.

> "It's cutting the scene into small tiles and checking each one, because that's the size
> the model was trained on."

**DO:** It finishes with **no detections**.

> "And it says: clean water. There was no spill there that day, so that is the right answer."

**Now deliver the actual point — this is the line that wins the section:**

> "Here's what matters underneath that. The network *did* flag eighteen dark patches in this
> image — bays, harbour corners, sheltered water where the wind can't reach. And our system
> threw out every single one, because it checks the physics: **oil makes water four to ten
> times darker than the sea around it. A wind shadow only makes it about twice as dark.**"

> "A system that shouts 'oil spill' at every dark patch is useless to a Coast Guard officer.
> We would rather say 'nothing here' than send someone out on a false alarm."

---

# PART 3 · The oil spill image — the full chain

**DO:** Click **Upload Another Scene** → drag in `2-OIL-SPILL.png` → **ANALYZE SCENE**.

> "Same system, same settings. Only the picture changes."

**DO:** As the log streams, narrate — but only the interesting lines. Don't read all of them.

| When you see | Say |
|---|---|
| `MASK EXTRACT … 87% confidence` | "There it is — it's found a slick, and it's 87 per cent sure." |
| `SCENE ANCHOR` | "It's placed that slick at a real latitude and longitude." |
| `OCEAN FORCING` | "That's it going out and fetching the actual ocean current and wind for that place, on that date." |
| `LAGRANGIAN DRIFT` | "And now it's running five hundred simulations backwards through the water." |
| `PRIMARY SUSPECT` | "**And there's the ship.**" |

**Pause after the suspect line lands.** Let it sit for two seconds. That silence is worth
more than another sentence.

> "That took six seconds. Everything you just watched was the system actually working —
> that's a live log, not an animation."

---

# PART 4 · The seven stages — what to say at each

**DO:** Click through to the dashboard (**Story** view). You'll see seven numbered tabs
across the top. Walk them left to right. **Roughly 20 seconds each.**

*Framing line before you start:*

> "The system lays out its reasoning as a seven-step story, so anyone can follow how it got
> from a dark patch to a named ship."

### 1 · Detection — "what did we see?"

**Map shows:** the orange slick outline on the sea.

> "Step one. This orange shape is the oil, exactly as the model outlined it. Everything from
> here on is built on this one shape."

### 2 · Characterisation — "how big, and how old?"

**Panel shows:** area in km², perimeter, shape, an age estimate.

> "How big is it, and roughly how fresh? A long thin slick is usually a moving ship
> discharging as it goes. A round blob is usually something stationary. The shape tells you
> what kind of event you're looking at."

### 3 · Drift Hindcast — "where did it come from?" **(your best stage — slow down here)**

**Map shows:** the dashed backward path, and a red shaded blob at the end of it.
**Panel shows:** `RECONSTRUCTED SPILL ORIGIN CORRIDOR · 19.04347°N, 72.90729°E` and three
probability bands.

> "This is the heart of it. The oil we can see has been drifting for six hours. We know how
> the current and the wind were moving. So we **press rewind on the ocean**."

**DO:** Point at the red blob.

> "And this red area is where the oil entered the water."

**DO:** Now point at the three band figures — `50% · 10.85 km²`, `80% · 25.19 km²`,
`95% · 46.89 km²`. **This is your credibility moment.**

> "Notice we don't give you a single dot on the map. We can't know the current perfectly, so
> instead of guessing once, the system releases **five hundred** simulated oil particles,
> each with slightly different assumptions, and sees where they cluster."

> "The result is three rings of confidence. There's a 50 per cent chance the source is in
> the small area, 80 per cent in the medium, 95 per cent in the large. **A single line on a
> map would be a lie of precision** — and the panel actually says that."

*If you say only one thing all demo, say that last sentence.*

### 4 · AIS Search — "who was there?"

**Map shows:** numbered ship markers and their tracks.
**Panel shows:** `AIS SEARCH: ±6H · 30 KM RADIUS — 20 VESSELS`

> "Every large ship is legally required to broadcast its identity and position continuously
> — think of it as a number plate that shouts. So we ask a simple question: **which ships
> were inside that red zone, around that time?**"

> "Twenty of them. That's the haystack. Now we find the needle."

### 5 · Evidence Scoring — "why that one?"

**Panel shows:** four bars — Proximity, Timing, Trajectory, Behaviour.

> "We score every ship on four things, and every one is something a human investigator would
> check anyway."

**DO:** Point at each bar as you say it.

> "How close did it pass. Was it there at the right time. Did its course actually cross the
> source area, or did it just clip the edge. And **did it behave oddly** — did it slow down,
> did it stop broadcasting."

> "Nothing here is a black box. Every point the system awards, it tells you why in a plain
> English sentence."

### 6 · Vessel Lead — "the answer"

**Map shows:** the *WHY MV OCEAN STAR RANKS #1* card — Min Distance 0.06 km, Temporal
Offset 0h, Origin Probability Band **inside 50%**, score **91.9 / 100 (HIGH)**.

> "MV Ocean Star. It passed **sixty metres** from where we calculated the oil entered the
> water, at exactly the right time — and it's inside the tightest confidence ring, the 50
> per cent one. It scores 91.9 out of 100."

**DO:** Point at the small grey line at the bottom of that card.

> "And read that line — 'analytical ranking, not proof of responsibility'. We're handing an
> investigator a strong lead, not a conviction. That line is on every screen and in the
> report."

### 7 · Habitat Threat — "who does this hurt?"

**Map shows:** green protected-area shapes and screening circles.

> "Last question — and the one that decides how fast anyone has to move. Where is this oil
> going next, and what does it hit?"

> "These green areas are India's official protected wetlands — the real government
> boundaries, not circles we drew. The system checks the forecast path against all
> ninety-nine of them and tells you which ones are at risk and how many hours you have."

---

# PART 5 · The map, in plain words

If a judge asks "what am I looking at?", walk the legend bottom-left. **Colour = time.**

| On the map | Say |
|---|---|
| **Orange shape** | "The oil, where the satellite saw it." |
| **Dashed line going back** | "Where it drifted *from* over six hours." |
| **Red shaded blob** | "Where it was dumped. Not a dot — an area, because we're honest about uncertainty." |
| **Numbered diamonds** | "Ships that were nearby. Number one is our lead." |
| **The line from ship to red zone** | "How close that ship came — sixty metres." |
| **Red dashed gap in a track** | "**That ship stopped broadcasting.** More on that in a moment." |
| **Green areas** | "Protected wetlands the oil is drifting towards." |
| **Faint rings around the red zone** | "The 50, 80 and 95 per cent confidence rings." |

### The Replay button — use it

**DO:** Press **REPLAY INVESTIGATION** (`−6h → Now → +6h`). Say nothing for the first pass.

> "That's the whole event played forward — from where it was dumped, to where the satellite
> caught it, to where it's heading. Watch the shaded area **shrink** as it approaches the
> sighting: that's our uncertainty getting smaller as we get closer to something we actually
> observed. That's how confidence is supposed to behave."

*This is the single most impressive ten seconds of the demo. Don't talk over it.*

---

# PART 6 · Scenario 3 — the ship that hides **(never skip)**

**DO:** Click **SCENARIO 3 · DARK** in the top bar.

> "One more. Now put yourself in the position of someone actually dumping oil illegally.
> What's the very first thing you'd do?"

**Pause. Let a judge answer — they'll say it.**

> "Exactly. You'd switch off the thing broadcasting your position."

**DO:** Point at the red dashed gap on the map — `AIS SILENT … (3.0 h)`.

> "This ship went silent for three hours — and those three hours cover exactly the moment
> the oil went in the water. It never reports a position anywhere near the source, so a
> normal system would never even look at it."

> "We treat that silence as evidence. We work out where it must have been while it was dark
> — and then we **deliberately count that as weaker proof** than an actual reported position,
> because it's an inference, not a measurement."

> "It still comes out top, above a ship that was three and a half kilometres away with
> perfect coverage. **A system that only looks at who was nearby would have blamed the wrong
> ship.**"

---

# PART 7 · The dossier — finish here

**DO:** Click **Dossier**. Open the PDF, scroll the first page.

> "And this is what an officer actually gets. Not a screenshot — a four-page report."

**DO:** Scroll through, naming each part in two words.

> "The finding. The map. Every ship we considered and why we ranked them that way. How we
> did it. What we can't be sure of. And the disclaimer — that this is a lead, not proof."

> "That's a document you can attach to an international pollution notice. **That's the point
> of the whole thing** — not a pretty screen, something someone can act on tomorrow morning."

---

# PART 8 · Counter-questions

Answer in **one breath**, then stop. Over-explaining reads as nervousness.

### On trust and validation

**"How do you know it actually works?"**
> "We tested it as a controlled experiment. We kept the oil spill identical and only changed
> which ships were in the water. Three different scenarios, three different guilty ships —
> and it found the right one every time. Same system, no tuning between them."

**"Couldn't it just be guessing the nearest ship?"**
> "That's exactly what Scenario 3 rules out. There, the guilty ship was never the nearest
> one — it was invisible on paper. A system that guessed 'nearest' would have picked the
> wrong ship. Ours didn't."

**"What if it's wrong?"**
> "Then an officer boards a ship and finds nothing, which costs a few hours. That's why we
> tuned it to be cautious — we would rather miss a faint slick than accuse the wrong vessel.
> And we never present it as proof. It's a lead with its reasoning attached."

**"How accurate is the detection?"**
> "It's right about two thirds of the time on the standard measure, and when it does flag
> something it's correct about 78 per cent of the time. It misses roughly four in ten faint
> slicks. Those numbers are on our website and in the app — we didn't hide the weak one."

**"Is this real data or did you make it up?"**
> "The satellite image you saw first is genuine European Space Agency data. The ocean
> currents come from a real weather service. The protected-area boundaries are the official
> Indian government dataset. The ship movements in the demo are simulated, because live ship
> tracking is a paid commercial feed — but the system reads the standard format, so it plugs
> into a real feed unchanged."

*Be straight about the AIS. Trying to imply it's live traffic is the one thing that could
sink you.*

### On novelty

**"Doesn't this already exist? Europe has CleanSeaNet."**
> "CleanSeaNet finds the slick and raises an alert — and it does that well. Then a human
> being is handed a dark patch and a list of ships and asked to connect them by hand. That
> connecting step is the entire thing we built. **We start where they stop.**"

**"What's genuinely new here?"**
> "Three things. We show uncertainty as an area rather than pretending we know a single
> point. We explain every single point of every score in plain English. And we catch ships
> that switch off their transponder — which is the specific behaviour of someone dumping
> deliberately, and the case everyone else misses."

**"Isn't this just YOLO on satellite images?"**
> "Detecting the slick is maybe a fifth of it, and it's the part that already existed.
> The hard part is what comes after — running the ocean backwards, being honest about how
> uncertain that is, and turning twenty ships into one defensible lead."

### On practicality

**"Could this actually be deployed?"**
> "The whole model is under seven megabytes and runs on an ordinary laptop processor in
> about six seconds. This is a Coast Guard desktop application, not a supercomputer job."

**"What does it cost to run?"**
> "Sentinel-1 satellite data is free and public. The ocean forecast we use is free. The only
> commercial piece is live ship tracking. Everything else runs on hardware a port office
> already owns."

**"Who would use it?"**
> "The Indian Coast Guard and the pollution control boards. Today, when a slick is spotted,
> the investigation usually stops because nobody can link it to a ship. This produces the
> missing link — as a document, in about ten seconds."

### If you get stuck

**If you don't know an answer:**
> "I don't want to guess at that — let me tell you what we do know, and I'll follow up on
> the rest."

That answer costs you nothing. A confident wrong answer costs you the round.

---

## The five sentences to memorise

If everything goes wrong and you have thirty seconds, these five carry the whole pitch.

1. **"Oil flattens the sea, and radar sees flat water as dark — that's how we spot it."**
2. **"The oil has been drifting for hours, so we press rewind on the ocean to find where it started."**
3. **"We don't give a single dot — we give a confidence area, because a single dot would be a lie of precision."**
4. **"If you were dumping oil illegally, you'd switch off your transponder. We treat that silence as evidence."**
5. **"It's a lead with its reasoning attached, not a conviction — and we say so on every screen."**
