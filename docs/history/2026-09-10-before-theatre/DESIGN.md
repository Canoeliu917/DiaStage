---
name: "咫台"
description: "AI Dramaturgy & Spatial Previs"
colors:
  stage: "#111111"
  brand-bar: "#101010"
  control: "#202020"
  control-raised: "#2b2b2b"
  control-hover: "#3b3b3b"
  control-border: "#494949"
  stage-text: "#ededed"
  muted-text: "#b5b5b5"
  selection: "#e5e5e5"
  selection-ink: "#141414"
  workspace-selection: "#f0f0f0"
  archive: "#f2f2f2"
  archive-ink: "#1a1a1a"
  archive-action: "#191919"
  identity-text: "#f5f5f5"
typography:
  brand:
    fontFamily: 'var(--font-diastage)'
    fontSize: "28px"
    fontWeight: 600
    letterSpacing: ".06em"
  display:
    fontFamily: 'var(--font-diastage)'
    fontSize: "42px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: ".04em"
  title:
    fontFamily: 'var(--font-diastage)'
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: ".03em"
  body:
    fontFamily: 'var(--font-diastage)'
    fontSize: "13px"
    lineHeight: 1.6
  label:
    fontFamily: 'var(--font-diastage)'
    fontSize: "12px"
    lineHeight: 1.5
rounded:
  archive-action: "3px"
  control: "4px"
  overlay: "6px"
spacing:
  tight: "6px"
  control-gap: "8px"
  inset: "12px"
  panel-inline: "18px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.archive-action}"
    textColor: "{colors.identity-text}"
    rounded: "{rounded.archive-action}"
    padding: "12px 22px"
  button-secondary:
    backgroundColor: "{colors.control-raised}"
    textColor: "{colors.stage-text}"
    rounded: "{rounded.control}"
    padding: "7px 10px"
  input-camera:
    backgroundColor: "{colors.control}"
    textColor: "{colors.stage-text}"
    rounded: "{rounded.control}"
    padding: "7px 8px"
  nav-workspace:
    backgroundColor: "{colors.workspace-selection}"
    textColor: "{colors.stage}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  chip-status:
    rounded: "{rounded.archive-action}"
    padding: "3px 6px"
  card-shot:
    backgroundColor: "{colors.control}"
    textColor: "{colors.stage-text}"
    rounded: "{rounded.control}"
    padding: "12px"
  brand-lockup:
    textColor: "{colors.identity-text}"
---

# Design System: 咫台

## Overview

**Creative North Star: "The Director's Prompt Desk"**

咫台 pairs a dark working stage with a light scene archive. Courier New Latin lettering and Source Han Sans SC Chinese text give the director a calm, legible desk; the live scene remains the dominant creative surface.

The brand is 咫台, with the fixed subtitle AI Dramaturgy & Spatial Previs. Interface copy is Chinese. The geometric corner mark is authored SVG; no generated raster media was introduced.

**Key Characteristics:**

- Black, white and gray interface chrome.
- Three explicit workspaces — 搭台, 看台 and 复台 — with labeled tools and clear pressed states.
- Rectangular controls, fine dividers and restrained motion.

## Colors

Neutral contrast carries hierarchy. The frontmatter records reused values from the implemented 咫台 surfaces.

- **Primary:** pale selection and dark archive actions identify the current workspace or a principal action.
- **Neutral:** stage and brand-bar anchor the editor; raised controls and gray borders separate operations; archive and archive-ink provide the light scene library.
- Existing semantic colors in inherited editor controls remain outside the brand palette. Model, material and scene-thumbnail colors are content and remain unchanged.

**The Content Color Rule.** Keep interface chrome monochrome; preserve the colors of the scene itself.

## Typography

The user specifies Courier New for all English and Source Han Sans SC for all Chinese. One shared stack serves controls, headings, timings and labels. Source Han Sans SC v2.005 is bundled as a variable WOFF2 (250–900) through next/font/local with display:swap; the Adobe SIL OFL license ships beside it. Courier New uses the installed system face. Geist, Barlow and Pixel are no longer loaded.

The Chinese wordmark is 28px / 600; its English subtitle is 10px with .055em tracking. Camera and rehearsal titles use the title token; the picture-panel title is 21px. Helper text is 12px, while the archive uses 14px explanatory copy and 25px scene names. Numeric fields and transport output use tabular figures.

## Layout

The workspace is a full-height column (100dvh): brand/navigation bar, working region and wrapping transport dock. The desktop navigation starts at 88px minimum height with 14px 24px padding. A labeled tool rail and resizable inspector sit beside the live viewport. 搭台 contains modeling and object placement; 看台 separates 舞台 (scene tree), 画面 (lighting and display), 机位 (camera position and movement), and 编排 (sequence tracks and playback); 复台 handles venue transfer. The shared 三维 / 二维 / 分屏 controls stay in the top bar and describe viewport layouts, not camera shots. 监看 displays the selected camera shot's framing.

The scene archive has a 1280px maximum container, 68px 48px 24px padding, and ruled rows with a 16:9 thumbnail, scene details and an opening link. **1280px is a container limit, not a breakpoint.**

| Threshold | Implemented behavior |
| --- | --- |
| ≤1100px | Navigation wraps; workspace choices take a full-width row. Dock gaps reduce to 8px, timeline to 100px and select width to 130px. |
| <768px | The inherited editor hook selects its mobile layout, with mobile tool navigation and panel sheet. |
| ≤700px | Brand mark becomes 28px, Chinese wordmark 25px, project name hides; workspace buttons are 38px minimum height. Panel horizontal padding becomes 16px and timeline 85px. Archive padding becomes 40px 20px 16px; rows use a 110px thumbnail and a second-column opening link. |
| ≤460px | Identity and action groups each occupy a full row; workspace choices return to normal flow order. |

## Elevation & Depth

Large work surfaces are flat, separated by tonal changes and thin borders. The viewer has no decorative corner clipping or shadow. The modeling action menu retains a small shadow (0 6px 18px #0002) and no backdrop blur; it is hidden in Director. Selected shot rows use an inset 3px white edge. Video dialogs use a dark backdrop (#000c).

Motion is limited to state changes: navigation and archive rows use 180ms color transitions; sidebar width uses 150ms ease when not dragging. The global reduced-motion rule reduces animation and transition duration to 0.01ms and disables smooth scrolling.

## Shapes

Controls use compact rectangles with the control radius; archive actions and status chips use the smaller radius, and dialogs use the overlay radius. Fine rules organize sections. The mark combines two open corners and a triangular stage plane; reuse `apps/editor/public/diastage-mark.svg`.

## Components

- **Wordmark:** 咫台 has one uninterrupted white rectangle with black text, 34px high and 4px inline padding. Screen readers receive the complete name once. The English slogan and shared font stack are preserved. Mobile-specific refinement is paused at the user's request.

- **Buttons:** pale pressed states on dark panels; black primary action in the archive; neutral hover changes. Disabled camera controls use .4 opacity, workspace choices .5.
- **Fields:** dark fill, a 1px gray border, compact padding and native input/select behavior. Camera fields have a 2px pale focus outline with 2px offset; workspace navigation uses 3px offset and archive controls 4px.
- **Navigation:** always retain the three labeled workspace choices and their `aria-pressed` state. Tool selection opens its inspector; camera, rehearsal and picture entry disarms modeling.
- **Shot cards:** full-width selectable rows with index, wrapping title and duration. Selection adds the inset edge and a brighter border rather than relying on color alone.
- **Status chips:** text plus an outlined circular marker at rest; recording uses a filled square. Active transport uses pale fill and dark text.
- **Rehearsal:** six numbered, collapsible sections with 44px section headers. Busy operation locks the body while exposing the stop action.
- **Scene archive:** ruled linked rows, real thumbnails when present and a scan-line fallback when absent. No invented thumbnail imagery.

## Do's and Don'ts

- Do use Courier New for English and bundled Source Han Sans SC for Chinese, with one continuous white background behind 咫台.
- Do preserve visible focus, text labels, pressed states and reduced-motion support.
- Do use the existing model, material and scene-thumbnail colors without recoloring their content.

- Don't introduce a decorative accent palette, gradients or glass panels into the 咫台 chrome.
- Don't add modeling overlays to 看台 or merge the three workspace tool groups.
- Don't invent raster imagery or replace the authored geometric SVG identity.

