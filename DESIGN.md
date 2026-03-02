# Design System: Gluco iOS-First Health Dashboard

## 1. Visual Theme & Atmosphere
**Liquid Glass**
The atmosphere should feel effortlessly fluid, deeply layered, and intrinsically native to iOS. It relies heavily on soft blurs, translucent layered cards, subtle hairline borders, and atmospheric depth rather than harsh contrast. The visual density should be breathable (reducing cognitive load) with clear focal points. Tone must feel supportive, medically clear but non-alarming, and incredibly premium.

## 2. Color Palette & Roles
* **Primary Teal:** (`#2DD4BF`) - Used for primary constructive actions, positive ongoing data trends, and main brand elements.
* **Success Mint:** (`#34D399`) - Used for completed goals, "in-range" glucose readings, and highly positive immediate feedback.
* **Momentum Blue:** (`#60A5FA`) - Used for informational indicators, ongoing activities, and neutral-positive data tracking (e.g., experiments).
* **Warning Amber:** (`#FFB380`) - Used for cautionary data (e.g., glucose approaching limits) but kept soft to remain non-alarming.
* **Error:** (`#F87171`) - Used strictly for critical out-of-bounds readings or failed system states.
* **Base Background:** (`#F2F2F7`) - The core iOS grouped-list background color. Provides a neutral canvas for glassy cards to float above.
* **Text Primary:** (`#1C1C1E`) - Core legible dark tone for main typography.
* **Text Secondary:** (`#8E8E93`) - Used for tertiary data, timestamps, and subtle support text.

## 3. Typography Rules
* **Font Family:** System font (San Francisco) to maintain strict iOS native feel.
* **Headers:** Semibold to Bold weights. High high-contrast but tight leading.
* **Body/Data:** Regular to Medium weights. Highly legible, often using monospaced numerals for tabular data or dynamic health metrics.
* **Accessibility Readiness:** Typography should natively support Dynamic Type scale.

## 4. Component Stylings
* **Cards/Containers:** Subtly rounded corners (think iOS standard `16pt` to `24pt`), translucent backgrounds (like `rgba(255, 255, 255, 0.7)` with background blur), very subtle white or light-gray inner and outer hairline borders (`0.5pt`) to create a "glass edge" effect.
* **Buttons:** All action buttons must use the same consistent style — no per-screen variations.
  * *Action/CTA (Save, Submit, Confirm, Continue, Log):* Dark fill (`#1C1C1E`), white text (`#FFFFFF`), `borderRadius: 16`, `paddingVertical: 16`. Use `Colors.buttonAction` / `Colors.buttonActionText`. Disabled state uses `Colors.buttonDisabled` (gray).
  * *Secondary:* Translucent or softly tinted backgrounds (`Colors.buttonSecondary`).
  * *Destructive:* Red fill (`Colors.buttonDestructive`), white text.
  * **Rule:** Never use teal, white, or gray as a primary CTA background. All save/submit/confirm buttons are dark.
* **Charts/Graphs:** Soft gradients, smooth curves (no sharp jagged lines). Trends should feel "liquid" and instantly readable.
* **Icons:** Strict use of SG Symbols with semantic coloring.

## 5. Layout Principles
* **Structure:** Deeply hierarchical. The "Today" screen must instantly answer "What does my data mean right now?" followed by "What should I do next?" (Clear primary CTA).
* **Spacing:** Generous padding within cards (Standard iOS margins, 16pt/20pt). Less spacing between tightly coupled data points, larger gaps separating distinct sections.
* **Motion & Interaction:** Restrained motion. Focus on native-feeling haptic interactions, smooth sheet presentations, and frictionless transitions.

## 6. Design System Notes for Stitch Generation
When generating screens, use the "Liquid Glass" standard. Elements should feature frosted textures (backdrop-filter blurs), `.bg-white/70`, very subtle borders, and smooth shadows. Use the specific hex codes for semantic meaning. Keep layouts iOS-proportioned with clear visual hierarchy guiding the eye to the single "next best action" CTA.
