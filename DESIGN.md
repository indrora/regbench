---
name: RegBench
description: Picking regulators from JLCPCB shelf stock made simpler
colors:
  oxide-rust: "#af2e1b"
  faded-olive: "#6b631c"
  instrument-slate: "#3b4b59"
  signal-red: "#bf1b1b"
  dial-amber: "#975105"
  graphite-ink: "#262420"
  weathered-taupe: "#6a6253"
  linen-hairline: "#c8bfa9"
  putty-panel: "#efeae0"
  warm-putty: "#e7e1d3"
  rust-wash: "#f1e2dc"
  paper-white: "#ffffff"
  schematic-line: "#9a9078"
typography:
  display:
    fontFamily: "ui-monospace, \"SF Mono\", \"Cascadia Code\", Consolas, monospace"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.06em"
  headline:
    fontFamily: "ui-sans-serif, system-ui, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "ui-sans-serif, system-ui, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "ui-sans-serif, system-ui, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.1em"
  mono:
    fontFamily: "ui-monospace, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  monoLarge:
    fontFamily: "ui-monospace, Consolas, monospace"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  caption:
    fontFamily: "ui-sans-serif, system-ui, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  micro:
    fontFamily: "ui-sans-serif, system-ui, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
  subscript:
    fontFamily: "ui-sans-serif, system-ui, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
rounded:
  none: "0px"
  edge: "2px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "16px"
  xl: "20px"
  xxl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.oxide-rust}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.edge}"
    padding: "7px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.edge}"
    padding: "5px 11px"
  button-ghost-hover:
    backgroundColor: "transparent"
    textColor: "{colors.oxide-rust}"
    rounded: "{rounded.edge}"
    padding: "5px 11px"
  input:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.graphite-ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.edge}"
    padding: "8px 9px"
  card:
    backgroundColor: "{colors.putty-panel}"
    rounded: "{rounded.edge}"
    padding: "16px"
---

# Design System: RegBench

## Overview

**Creative North Star: "The Interactive Manual"**

This is an instrument, not a website. The system reads like a piece of Braun/Rams-era test equipment married to the page of a datasheet it's helping you avoid hand-calculating: one control surface on the left, one readout up top, and everything below it laid out like the numbered sections of a service manual — schematic, then formula, then the ranked table of resistor combinations, then the bill of materials. Warm putty and card-stock tones stand in for the enameled steel and cream plastic of a Braun product; rust, olive, and slate stand in for the few colored controls on an otherwise monochrome fascia. Nothing is decorative. Every color, weight, and piece of emphasis exists to answer a question an engineer would actually ask while checking the math: does this part fit, does this resistor pair land in tolerance, is this part Basic or Extended tier.

The system rejects three defaults it started from and corrected against: the "default AI app" look of cool blue/green accents on white cards, pill-shaped status badges, and a page built entirely out of stacked bordered boxes. It also explicitly rejects drop shadows, glassmorphism/translucency, and icon-font or emoji UI chrome — the only non-text graphic in the whole system is the inline SVG divider schematic and the sparing ⚠ warning glyph.

**Key Characteristics:**
- Two boxes only: the sidebar control panel and the hero schematic+formula readout. Every other section is a plain block separated by a hairline rule.
- Status is color-coded text, never a colored pill or badge.
- Numeric/verifiable content (equations, tables, part codes, resistor values) is always monospace; descriptive UI chrome is always sans-serif. The switch between the two fonts *is* the visual language for "this is data" vs. "this is a label."
- Near-sharp corners (2px) everywhere a corner exists at all; several elements are fully square.
- No shadows, no blur, no translucency — depth comes from a hairline border and a flat background-color shift, nothing else.

## Colors

A warm, matte, putty-and-card palette (bare steel and cream plastic, not screen-glow) carries a small set of saturated, single-purpose accent colors borrowed from the labeled knobs on Braun-era hardware.

### Primary
- **Oxide Rust** (`#af2e1b`): the one interactive/selection color — focus outlines, selected-row highlight, active navigation state, primary button fill, hover state on links and ghost buttons. Used sparingly and only to mean "this is active or actionable."

### Secondary
- **Faded Olive** (`#6b631c`): "this is good" — passing tolerance checks, Basic-tier part labels, the `ok` state in the divider-error readout.

### Tertiary
- **Instrument Slate** (`#3b4b59`): part-number/LCSC code links and family/sibling links — a quieter, more technical blue-gray reserved for "this is a reference to more data," distinct from Oxide Rust's "this is an action."

### Neutral
- **Graphite Ink** (`#262420`): primary text. A warm near-black, never pure `#000`.
- **Weathered Taupe** (`#6a6253`): secondary/dim text — captions, meta lines, disabled-feeling content.
- **Linen Hairline** (`#c8bfa9`): every border, divider, and rule in the system. There is exactly one border color.
- **Putty Panel** (`#efeae0`): the fill for the two boxed elements (sidebar, hero readout) and table-row hover.
- **Warm Putty** (`#e7e1d3`): the page background, and — doubling as an inset tone — the nested "worst case" sub-box background inside the hero readout.
- **Rust Wash** (`#f1e2dc`): selected-row background tint (a pale wash of Oxide Rust, not a new hue).
- **Paper White** (`#ffffff`): input backgrounds and primary-button text only — the single place in the system that's genuinely white rather than putty-toned, deliberately reading as "paper" for data entry against the warmer surfaces around it.
- **Schematic Line** (`#9a9078`): the stroke color for the inline SVG divider diagram — muted well below Linen Hairline's border contrast so the schematic reads as a technical background drawing, not a UI element with its own borders.

### Status (used only for the two divider-result/part-fit states, never as a background)
- **Signal Red** (`#bf1b1b`): failing tolerance, over-current warnings, error banners. Same role Oxide Rust would play if this weren't already meaning "active" — kept as a separate hue so "selected" and "failing" are never visually confusable.
- **Dial Amber** (`#975105`): Extended-tier part labels and needs-review markers — "proceed, but this costs more or isn't verified yet," distinct from both "good" (olive) and "failing" (red). Deepened from an earlier, brighter orange after an audit found the original failed WCAG AA text contrast (2.1:1 against 4.5:1 required) — read as a burnt, aged-dial-paint amber rather than a bright warning orange, which fits the material world better anyway.

### Named Rules
**The One Border Rule.** There is exactly one border/hairline color in the entire system (`#c8bfa9`). No component invents a second gray. Depth and separation come from *whether* a border is drawn, never from *which* border color.

**The Status-Is-Text Rule.** Pass/fail, tier, and pairing state are conveyed by colored text (and, for pass/fail, a small leading `●`), never by a colored background/pill. If a status needs a background to be legible, it's the wrong pattern for this system.

## Typography

**Display/Mono Font:** `ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace`
**Body Font:** `ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif`

**Character:** A hard split, not a pairing in the usual sense — monospace is reserved for anything a reader would want to verify or copy (part names in the header, formulas, table cells, LCSC codes, resistor values), and the humanist sans handles everything that's UI chrome describing that data (labels, section heads, buttons, prose). A reader should be able to tell which font a piece of text is in and know, without reading it, whether it's a number/fact or a label.

### Hierarchy
- **Display** (700, 19px, tracked +0.06em, monospace): the app name in the header (`.hname`) — the one place display-weight monospace appears.
- **Headline** (700, 16–19px, sans): part/section titles (`.rd-name`, `.ptitle`) — the regulator's name, "Solutions", "Around the regulator."
- **Body** (400, 15px, line-height 1.5, sans): default running text, everywhere no other rule applies.
- **Label** (600, 14px, tracked +0.1em, uppercase, sans, dim color): section-header eyebrows (`.secHead`) — "Requirements", "Regulator" — and field labels above inputs.
- **Mono/data** (400, 14px, monospace): table cells, LCSC/part codes, resistor values, schematic labels.
- **Mono Large** (400, 20px, monospace): the substituted divider formula's result line (`.eq.subst`) — the single largest text in the system besides the header, reserved for the one number the whole readout exists to produce.
- **Caption** (13px, sans, weight varies 400–700 by use): table column headers, tier/status badges, and the part picker's secondary meta lines (`.rp-pn`, `.rp-meta`, `.famhead`) — dense, secondary metadata, not primary content.
- **Micro** (12px, sans): the series/parallel resistor-pairing tag (`.pairtag`) and the sourcing table's column headers (`.skutable th`).
- **Subscript** (10px, sans): the OUT/IN unit subscripts inside sidebar field labels (`.lbl sub`) — exempt from the body floor below by typographic convention, the same way the inline equation's own subscripts (`.eq sub`, sized relatively at `.6em`) are.

### The 14px floor, and where it doesn't apply
Readable content — anything a user reads as a sentence, a value, or a primary label — holds a 14px floor: body, label, and mono/data all sit at 14px or above. Two categories are the sanctioned exceptions, not drift: **subscripts** (10px — a subscript rendered at body size stops being a subscript) and **fine print** (12–13px, the Caption/Micro roles above) — table headers, status badges, and secondary meta lines that are deliberately quieter than the content they annotate. If new UI needs text below 14px for a reason that isn't one of these two, that's a real floor violation, not a new exception.

**Known inconsistency, not yet fixed:** the main Solutions table's column headers (`th`, 13px/Caption) and the sourcing table's column headers (`.skutable th`, 12px/Micro) are the same semantic role — "table column header" — at two different sizes. A `/impeccable typeset` pass should unify these to one.

### Named Rules
**The Verifiable-Content-Is-Mono Rule.** If a piece of text is a number, a formula, a part code, or anything the user might paste into a search box or a BOM, it renders in the monospace family. If it's prose describing that content, it renders in the sans family. No exceptions, no third font.

**The Fine-Print Exception Rule.** Readable content holds a 14px floor, no exceptions. Text below it is only ever a subscript (10px) or dense secondary metadata — table headers, badges, meta lines (12–13px, Caption/Micro). If new text needs to go smaller for any other reason, that's a floor violation, not a new exception.

## Layout

Two-column shell: a 352px sticky sidebar (`.controls`, the "control panel") and a fluid main column (`.results`) that stacks its sections vertically with a 20px rhythm, collapsing to a single column under 820px. Every field in the sidebar's forms is a full-width, single row with its label directly above it (no side-by-side label/input, no multi-field grid rows) — that's a deliberate fix for label text wrapping awkwardly at this system's larger type sizes.

Inside the hero readout, a 28px-gapped two-column grid (`.heroGrid`, roughly 1 : 1.3) puts the schematic on the left and the formula stack on the right, collapsing to one column under 900px of *available* width. The BOM section uses the same logic at a 1.2 : 1 ratio (`.bomGrid`) for the parts list versus the sourcing/SKU table. Both collapse via a CSS container query on `.results` (`container-type: inline-size`), not a viewport media query — with the 352px sidebar showing, the viewport can be well over 900px while the main column itself is far narrower, so the grids respond to the space they're actually given rather than the window.

Plain sections (everything that isn't the sidebar or the hero) are separated by a 1.5px top hairline with 14px of padding above the content — no box, no background change, just a rule. The first section in the main column skips its own top rule.

### Named Rules
**The Label-Above-Input Rule.** Every form field is its own full-width row: label text on one line, its input directly beneath it. Multi-field grid rows are banned specifically because they caused label text to wrap at this system's type sizes.

## Elevation & Depth

Flat, deliberately. There are no shadows anywhere in the system — no `box-shadow`, no blur, no glassmorphism/translucency. The only exception is the native `<dialog>` element's backdrop, which uses a plain semi-transparent dark scrim (`rgba(38,36,32,.35)`) rather than a blurred one, and a single soft shadow on the dialog itself (`0 12px 32px rgba(38,36,32,.18)`) because a native modal needs to visually separate from the page behind it — that shadow is the one sanctioned exception, not a precedent to extend elsewhere. Depth everywhere else is conveyed by two flat cues only: a background-color step (`warm-putty` page → `putty-panel` box) and a hairline border. Selected states add a third cue — an inset left accent bar in Oxide Rust — never a shadow or lift.

### Named Rules
**The Flat-By-Default Rule.** No shadow, blur, or translucency on any in-page element. The dialog backdrop/shadow is the sole exception, justified by it being the one native, truly-overlapping surface in the system.

## Shapes

Near-sharp throughout: a single 2px radius (`rounded.edge`) on every element that has a radius at all — panels, inputs, buttons, the dialog. A few elements (`.regpick` list rows) are fully square (0px). Nothing in the system uses a pill/fully-rounded radius; that shape is reserved, and banned, for status indicators specifically (see Components → Status text below). Borders are 1–1.5px hairlines in the single system border color; selected/active states add a left accent bar (2–3px, solid Oxide Rust or Dial Amber for needs-review) rather than a full outline or fill change.

### Named Rules
**The No-Pill Rule.** Nothing in this system is fully rounded. If a shape wants to read as "pill," replace it with plain colored text instead.

## Components

### Buttons
- **Shape:** 2px radius, hairline border where present (ghost variant only).
- **Primary** (`.dlgActions button`, the dialog's "Done"): solid Oxide Rust fill, white text, no border, `7px 16px` padding.
- **Ghost** (`.filterBtn`, "⚙ Filters"): transparent background, hairline border, Graphite Ink text, `5px 11px` padding.
- **Hover/Focus:** ghost buttons swap border color and text to Oxide Rust on hover; all inputs and selects get a solid 2px Oxide Rust outline on focus (no glow, no shadow).

### Status text (the system's replacement for chips/badges)
- **Style:** bold colored text, no background, no border, no padding. Pass/fail additionally prefixes a small `●` in the same color.
- **State:** Faded Olive = pass/Basic-tier/good. Signal Red = fail/error. Dial Amber = Extended-tier/needs-review. Instrument Slate is never used for status — it's reserved for links.

### Cards / Containers
- **Corner Style:** 2px radius.
- **Background:** Putty Panel (`#efeae0`) against the Warm Putty (`#e7e1d3`) page.
- **Shadow Strategy:** none — see Elevation & Depth.
- **Border:** 1.5px, Linen Hairline.
- **Internal Padding:** 16px.
- **Where used:** exactly two places — the sidebar control panel and the hero schematic+formula readout. No other section is boxed; see the Do's and Don'ts below.

### Inputs / Fields
- **Style:** Paper White background, 1.5px Linen Hairline border, 2px radius, monospace type, `8px 9px` padding, full width.
- **Focus:** solid 2px Oxide Rust outline, no offset, no shadow.
- **Label:** always a full-width row above the input (sans, 14px, dim, 600 weight) — never beside it.

### Navigation / Part Picker
- **Style:** flat list rows (`.regpick`), no card, no radius (0px). A 2px left border, transparent at rest, turns Oxide Rust for the selected part and Dial Amber for a needs-review part. Hover adds the Rust Wash background tint with no border change.

### Interactive table rows (resistor-solution picker)
Each row in the Solutions table is a real `role="button"`, keyboard-focusable, with a computed `aria-label` describing that row's values and `aria-pressed="true"` on whichever solution is currently loaded — not just a click handler on an inert `<tr>`. Because a full outline on a table row can get visually clipped by adjacent cell borders, its focus ring uses a small negative offset (`outline-offset:-2px`) rather than the standard inputs' zero-offset ring — same Oxide Rust color and 2px weight, just inset to stay inside the row.

### Sourcing table (Signature Component)
`.skutable` — a plain borderless-except-row-dividers table listing every known LCSC SKU (package, manufacturer, tier) for the selected part, always paired inline with the BOM it sources in a two-column layout rather than living in its own boxed section. It uses the same status-text tier styling as everywhere else (no pill), reinforcing that sourcing data is just more data, not a separate UI mode.

## Do's and Don'ts

### Do:
- **Do** keep every border in the system on the single Linen Hairline color (`#c8bfa9`); never introduce a second gray.
- **Do** render anything numeric, verifiable, or copy-pasteable (formulas, part codes, table data, resistor values) in the monospace family, and everything else in the sans family.
- **Do** use flat background-color + hairline-border for depth; never a shadow, blur, or translucent surface (the one native `<dialog>` exception aside).
- **Do** keep status (pass/fail/tier/needs-review) as colored text with, at most, a small leading `●` — never a background pill.
- **Do** put every form field on its own full-width row, label directly above the input.

### Don't:
- **Don't** add a third boxed/`.panel` section. The sidebar and the hero readout are the only two; everything else is a hairline-separated plain block.
- **Don't** reach for cool blue or green as an accent — this system's active/selection color is Oxide Rust, its "good" color is Faded Olive, and neither is a default-framework blue or green.
- **Don't** use a fully-rounded (pill) shape anywhere, for any purpose.
- **Don't** add a drop shadow, backdrop blur, or any glassmorphism/translucency effect outside the one sanctioned native-dialog shadow.
- **Don't** use icon fonts, emoji, or decorative iconography as UI chrome. The only permitted non-text graphics are the inline SVG divider schematic and the sparing ⚠ warning glyph.
