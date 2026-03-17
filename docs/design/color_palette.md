# Gluco App Color Palette

This document defines the new color palette for the app, focusing on a "Glass Effect" aesthetic with deep charcoal backgrounds, subtle transparency, and semantic colors for metabolic tracking.

## 1. Backgrounds & Surfaces (The Glass Effect)

-   **App Background**: Keep existing photographic background with dark overlay.
-   **Card / Surface Background**: `#1A1A1C` (Set to 85% - 90% opacity).
    -   *Usage*: All main containers (Metabolic Score, Next Best Action, and bottom grid cards).
    -   *Purpose*: Provides a deep, neutral charcoal base that doesn't compete with the background photo.
-   **Card Borders (Strokes)**: `rgba(255, 255, 255, 0.08)`
    -   *Usage*: A 1px inside stroke on all cards to create a crisp "glass" edge instead of a solid color line.

## 2. Typography & Icons

-   **Primary Text**: `#FFFFFF` (Pure White)
    -   *Usage*: Main headers ("GLUCO"), data values ("40", "--"), and primary card titles ("METABOLIC SCORE", "ACTIVITY").
-   **Secondary Text / Subtitles**: `#9CA3AF` (Cool Slate Grey)
    -   *Usage*: Descriptive text ("From sleep, activity...", "Avg active minutes/day"), empty state text, and unselected bottom navigation icons.

## 3. Semantic Status Colors (Metabolic & Glucose Tracking)

-   **Needs Attention (Score 0-50)**: `#FFB380` (Warm Peach / Amber)
    -   *Usage*: Progress rings, status pills, and warnings. Signals attention is needed without inducing anxiety. Matches the current mascot design.
-   **Building Momentum (Score 51-79)**: `#60A5FA` (Calm Blue) to indicate progress.
    -   *Note*: User suggested Soft Muted Gold `#FCD34D` or Calm Blue `#60A5FA`.
    -   *Usage*: For intermediate progress and transitional states.
-   **On Target / Optimal (Score 80+)**: `#34D399` (Vibrant Mint Green)
    -   *Usage*: Reserved strictly as a visual reward for excellent scores and completed streaks.

## 4. Interactive Elements (Calls to Action)

-   **Primary CTA Button Background**: `#2DD4BF` (Electric Teal) or `#FFFFFF` (Pure White)
    -   *Usage*: The "Open action loop" button. It must be the highest-contrast item in the middle of the screen to drive user engagement.
-   **Primary CTA Text**: `#042F2E` (Deep Teal/Black)
    -   *Usage*: Text inside the Primary CTA button for maximum legibility.
-   **Secondary Interactive Elements**: `rgba(255, 255, 255, 0.12)`
    -   *Usage*: Background for secondary buttons (like "See more steps in Daily Focus" or the "Days" pills).
-   **Floating Action Button (FAB)**: `#1A1A1C` (Solid, 100% opacity)
    -   *Border*: `rgba(255, 255, 255, 0.15)`
    -   *Icon*: `#FFFFFF` (White)
