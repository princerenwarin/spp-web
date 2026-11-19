---
name: Peta Course SPP
description: A measured, premium operations interface led by a four-stage SPP course.
colors:
  course-violet: "#6253c7"
  action-violet: "#5547bc"
  ink-plum: "#29263d"
  body-ink: "#292738"
  muted-ink: "#656374"
  map-ground: "#f3f2ee"
  surface-white: "#ffffff"
  surface-parchment: "#f8f7f3"
  divider: "#dfdee5"
  success-green: "#34745f"
  warning-ochre: "#a56d13"
  danger-cranberry: "#b34d55"
typography:
  display:
    fontFamily: "Barlow Condensed, Source Sans 3, sans-serif"
    fontSize: "clamp(2rem, 5vw, 2.5rem)"
    fontWeight: 600
    lineHeight: 1
  headline:
    fontFamily: "Barlow Condensed, Source Sans 3, sans-serif"
    fontSize: "clamp(1.7rem, 2.4vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1
  title:
    fontFamily: "Barlow Condensed, Source Sans 3, sans-serif"
    fontSize: "1.55rem"
    fontWeight: 600
    lineHeight: 1.05
  body:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
  label:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
  metricLabel:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.25
  metricValue:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "clamp(1.25rem, 1.8vw, 1.5rem)"
    fontWeight: 700
    lineHeight: 1.05
  metricSupporting:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.35
rounded:
  sm: "9px"
  md: "14px"
  lg: "15px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action-violet}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "11px 16px"
  button-primary-hover:
    backgroundColor: "#493ca9"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
  button-ghost:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.body-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "9px 13px"
  input-field:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.body-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    height: "42px"
  surface-card:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.body-ink}"
    rounded: "{rounded.md}"
    padding: "22px"
---

# Design System: Peta Course SPP

## Overview

**Creative North Star: "The SPP Orienteering Course"**

The interface treats routine SPP work as a clear course through four checkpoints: Dashboard, Data Siswa, Pembayaran, and Laporan. A quiet map ground and restrained contour drawing give the route a specific visual identity, while the actual work stays legible, familiar, and operational.

The system favors a calm hierarchy over decoration. Roles only see destinations they are allowed to use; existing payment states keep their own semantic colors, and no sample financial claims are introduced. The course line is the signature interaction: it advances to the selected checkpoint and settles immediately for reduced-motion preferences.

**Key Characteristics:**
- Pale, map-like ground with a restrained contour asset.
- One violet route linking the current workflow stage.
- Condensed display lettering paired with readable sans-serif controls.
- Existing access scope and payment-status colors remain distinct.

## Colors

The palette pairs warm neutral surfaces with a restrained violet route, while green, ochre, and cranberry remain reserved for meaningful statuses.

### Primary
- **Course Violet**: The active route and current numbered checkpoint.
- **Action Violet**: Primary actions and keyboard focus accents.

### Secondary
- **Success Green**: Paid status and positive financial states.

### Tertiary
- **Warning Ochre**: Unpaid or attention-needed status.
- **Danger Cranberry**: Destructive actions and errors.

### Neutral
- **Map Ground**: The app canvas and login backdrop.
- **White Surface**: Forms, panels, and cards.
- **Parchment Surface**: Quiet secondary groupings.
- **Ink Plum**: Headings and high-emphasis text.
- **Body Ink**: General content and control text.
- **Muted Ink**: Supporting labels and metadata.
- **Divider**: Borders, table separators, and neutral outlines.

### Named Rules
**The Status Separation Rule.** Keep paid, unpaid, and destructive states semantically distinct from the violet workflow route.

## Typography

**Display Font:** Barlow Condensed (with Source Sans 3, sans-serif fallback)
**Body Font:** Source Sans 3 (with sans-serif fallback)
**Label/Mono Font:** Source Sans 3; no mono voice is used.

**Character:** Barlow Condensed gives page titles a confident, compact profile; Source Sans 3 keeps dense school, student, and payment controls easy to scan.

### Hierarchy
- **Display** (600, `clamp(2rem, 5vw, 2.5rem)`, line-height 1): Login title.
- **Headline** (600, `clamp(1.7rem, 2.4vw, 2.25rem)`, line-height 1): Page title.
- **Title** (600, `1.55rem`, line-height 1.05): Panel, report, and student-section headings.
- **Body** (400, `0.9375rem`): Data, descriptions, and form content.
- **Label** (600, `0.75rem`): Field labels and compact supporting text.
- **Compact metric** (700, `clamp(1.25rem, 1.8vw, 1.5rem)`): Values in supporting report metrics, with `0.875rem` labels and captions.

### Named Rules
**The Two-Voice Rule.** Use Barlow Condensed for headings and Source Sans 3 for controls, labels, and body copy.

## Layout

The desktop shell keeps the brand, four-stage course, and account actions together in a sticky header; the school and year scope stays beside the active page title. The dashboard presents four metrics before a wide payment chart and a narrower activity list. Main content is capped at `1520px`, with generous outer padding that contracts at smaller widths.

At `1100px`, navigation moves below the brand row. At `900px`, dashboard metrics use two columns and the chart/activity pair stacks. On narrow screens the course can scroll horizontally; metrics remain two-up until `380px`, then become one column. The spacing rhythm is built from compact `8–12px` groups and wider `18–24px` section gaps.

The student directory is designed for large school populations: it stays paginated at 25 rows, keeps search and school/year scope immediately available, and collapses fee components behind a per-student disclosure so the list remains scannable. Expanding a row reveals the existing full breakdown without changing amounts or payment history.

## Elevation & Depth

The system uses thin neutral borders with low, offset shadows to separate white work surfaces from the map ground. Depth stays quiet; the navigation route, type scale, and spacing carry more hierarchy than elevation.

### Shadow Vocabulary
- **Header** (`0 8px 26px rgba(36, 33, 54, 0.055)`): Light separation for the sticky app header.
- **Work Surface** (`0 8px 24px rgba(36, 33, 54, 0.045)`): Dashboard and report panels.
- **Login Surface** (`0 14px 26px rgba(36, 33, 54, 0.13)`): Foreground login form.
- **Modal** (`0 16px 28px rgba(30, 27, 47, 0.24)`): Focused student editing surface.

### Named Rules
**The Quiet Elevation Rule.** Reserve stronger depth for login and modal layers; ordinary panels use only a soft lift.

## Shapes

Controls use gently rounded corners (`9px`); panels are slightly more open (`14px`), while the login card uses a `15px` radius. Status pills and report badges are fully rounded. Borders stay thin and neutral, and the contour illustration remains a line drawing rather than a clipped panel shape.

## Components

### Buttons
- **Shape:** Gently rounded (`9px`).
- **Primary:** Solid action violet with white text and `11px 16px` padding.
- **Hover / Focus:** A modestly darker primary on hover; a visible violet outline with offset for keyboard focus.
- **Secondary / Ghost:** White surface, neutral border, and dark text; ghost actions use `9px 13px` padding.

### Chips
- **Style:** Existing status labels retain compact pill shapes and distinct semantic colors.
- **State:** Paid stays green; unpaid stays ochre; destructive actions stay cranberry.

### Cards / Containers
- **Corner Style:** Gently rounded (`14px`).
- **Background:** White work surfaces over the map ground; parchment for quiet secondary groupings.
- **Shadow Strategy:** Low, offset shadows as described in Elevation & Depth.
- **Border:** Thin neutral outline.
- **Internal Padding:** Common panel padding is `22px`, reduced on mobile.

### Inputs / Fields
- **Style:** White fill, neutral stroke, gently rounded corners (`9px`), and a `42px` minimum height.
- **Focus:** Violet border and a visible, soft focus ring.
- **Error / Disabled:** Existing validation and disabled states remain in place; do not make a disabled field resemble an available action.

### Navigation
- **Style:** Four numbered stages share one horizontal course. The current stage fills its checkpoint with violet, and a single line advances from the first stage to the selection. Admin settings remain visually separate from the operational route.
- **Motion:** The line uses a transform-based `420ms` ease-out; reduced-motion preferences remove the transition. On mobile the stage row scrolls horizontally instead of compressing labels into unreadable text.

## Do's and Don'ts

### Do:
- **Do** keep the four operational stages in their confirmed order.
- **Do** keep payment statuses visually distinct from workflow progress.
- **Do** preserve visible keyboard focus and the existing role-scoped destinations.
- **Do** use the supplied partner marks without recoloring or redrawing them.

### Don't:
- **Don't** add unconfirmed financial examples, claims, or parent-facing language.
- **Don't** use the course accent to recast payment statuses as navigation states.
- **Don't** turn hidden destinations into reachable controls for users without access.
