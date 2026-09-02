# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is the developer/maintainer themselves, designing PCBs that get assembled through JLCPCB's SMT service. Secondary audience: other electronics hobbyists/professionals sourcing through JLCPCB who face the same problem. Built for personal use first; shareable/public use (the Justfile has a `gh-deploy` target for GitHub Pages) is an explicit possibility, not a committed near-term goal.

## Product Purpose

Given a target output voltage, input voltage, and output current, the tool picks a voltage regulator (adjustable or fixed) from JLCPCB's shelf stock and — for adjustable parts — solves the feedback-divider resistor pair (Ra/Rb) against real, in-stock JLCPCB resistor values. It reports the resulting output voltage, error, and worst-case tolerance band, and lists the supporting BOM (input/output caps, catch diode, inductor) with LCSC part codes. Success means a user can go from "I need a 5 V rail at 1 A" to a shoppable, JLCPCB-sourceable BOM without hand-computing divider math or manually cross-referencing stock.

## Positioning

The differentiator is JLCPCB Basic-tier-first sourcing: unlike a generic resistor-divider or regulator calculator, every part and resistor value it surfaces is checked against real JLCPCB stock and tier (Basic vs. Extended), and solutions are ranked/labeled to steer designs toward Basic-tier parts. Basic-tier parts are already loaded on JLCPCB's pick-and-place lines, so favoring them avoids Extended-tier per-part assembly fees and stock-availability risk — a generic calculator with no sourcing awareness cannot make that trade-off for the user.

## Operating Context

- Data pipeline: `data/catalog.json` (regulator family/variant definitions) + `data/resistor-values.json` (canonical E-series values) are merged with a live JLCPCB stock snapshot by the `updater` tool (Python, uv-managed) into `dist/data.json`, which the running app fetches at load time.
- Build: `just build` copies `app/` into `dist/` and regenerates `dist/data.json`; `just test` serves `dist/` locally; `just gh-deploy` builds and deploys to GitHub Pages.
- The stock snapshot ultimately derives from yaqwsx/jlcparts' `cache.sqlite3` (fetched via `just fetchdb`), reassembled from a chunked archive in `tmp/`.
- Runtime has no server component beyond a static file host — `regulator-solver` (`app/components/regulator-solver.js`) fetches `data.json` and does all solving client-side.

## Capabilities and Constraints

- Handles both adjustable regulators (solves the Ra/Rb divider, with optional series/parallel resistor-pair combos) and fixed-output regulators (fit-checks current/power/Vin against the target rail).
- Topology-aware: buck, boost, linear/LDO, shunt-reference parts each have different divider/headroom math; the tool warns when a boost topology can't reach the target (Vin ≥ Vout) or when a fixed part can't produce the requested rail.
- Surfaces worst-case output voltage given resistor tolerance and reference-voltage tolerance, not just nominal.
- Suggests supporting passives (input/output caps, catch diode, inductor sized from ripple/saturation current) and lists them with JLCPCB LCSC codes and tier.
- "needsReview" variants (auto-discovered from stock data, not datasheet-verified) are flagged and deliberately excluded from solving until confirmed.
- Stack: plain static HTML/CSS/JS using native Web Components (Custom Elements) and a small in-repo Mustache-style templating helper (`app/lib/mustache.js`) — no framework, no `package.json`, no build tool beyond the `just` copy/data-merge step. State/URL history live in `regulator-solver.js` (hash-based, so the current selection/solution/requirements are copy-paste shareable).
- Not a git repository at the project root as of this writing (no remote), despite the `gh-deploy` Justfile target — deployment is aspirational/manual rather than wired to CI.

## Brand Commitments

Name: "RegBench" (originally "RegulatorToy" internally; renamed to something closer to the finished tool while keeping the same informal, personal-project register — the DESIGN.md "Interactive Manual"/workbench world it already lived in made "Bench" a more literal fit than "Toy"). No logo or other locked brand assets. Visual direction was set collaboratively toward a Dieter Rams/Braun industrial aesthetic (warm putty background, muted rust/olive/slate accents, minimal card usage, sharp corners, no pill badges), recorded in DESIGN.md.

## Evidence on Hand

No testimonials, case studies, or press — this is a personal/small-audience tool. Real data on hand: `data/catalog.json`, `data/resistor-values.json`, and the JLCPCB stock snapshot merged into `dist/data.json` are genuine sourced data, not placeholders. Future work must not fabricate part numbers, stock/tier claims, or pricing beyond what the data pipeline provides.

## Product Principles

- Every part or value shown must be traceable to real JLCPCB stock/tier data — no fabricated LCSC codes, stock, or pricing.
- Default to Basic-tier parts; make Extended-tier and needs-review parts visually distinct rather than hiding the cost/risk trade-off.
- Show the worst case, not just the nominal result — tolerance stacking is the whole point of a divider calculator.
- Keep the tool usable with zero setup: static files, no account, no server, no build step required to just view it.
- Prefer plain, verifiable engineering output (schematic, formula, worst-case band) over decorative UI — the audience is engineers who want to check the math.
