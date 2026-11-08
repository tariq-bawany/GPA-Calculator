# SZABIST GPA Calculator — HCI / UX Redesign Plan

**Product:** SZABIST Undergraduate GPA Calculator (tool website)  
**Audience:** SZABIST students — primarily Karachi, Pakistan  
**Branch:** `arena/3abcc4c5-gpa-calculator`  
**Status:** Plan (draft for alignment)  
**Existing stack:** Single-file HTML (`index.html`), vanilla JS (`script.js`), CSS (`style.css`), Tailwind CSS v4 (CDN), Umami analytics (Vercel), `localStorage` persistence.

---

## 1. Executive Summary

We are **redesigning, not rebuilding**, the current GPA calculator. The calculation engine and grading scale are already SZABIST-aligned (A+ 90–100 = 4.00 … F 0–54 = 0.00). The redesign applies HCI concepts and UX principles to fix usability friction, make the tool mobile-first for students, and lay a scalable foundation for:

1. **Audience growth** — shareable results, offline use, fast load times.
2. **Future monetization** — ad slots reserved by design so layout never needs to change when ads go live.
3. **User tracking** — privacy-friendly, event-based analytics ready for scale.

---

## 2. Current State Audit

### What works (keep)
- Grading scale matches SZABIST policy exactly.
- Semester GPA + Cumulative GPA (max 8 semesters) in one tool.
- Grade ↔ Percentage input toggle.
- `localStorage` auto-save (students won't lose data on refresh).
- Result classification badges (Dean's List, Good Standing, Probation, etc.).
- Distinctive "scholarly desk" visual theme (mahogany / parchment / brass / leather).

### What needs redesign (HCI gaps)
| Issue | HCI principle violated | Impact |
|-------|------------------------|--------|
| Calculation only runs on explicit "Calculate" click | Visibility of system status | Students don't see GPA until they hunt for the button |
| No inline validation (negative credits, >100%, empty rows) | Error prevention | Invalid inputs silently produce wrong GPA |
| Everything hidden until calculate; no state while typing | Feedback | Uncertainty whether input registered |
| Delete = native `confirm()` dialog | Match between system and real world | Jarring, non-contextual interruption |
| No keyboard support | Flexibility & efficiency of use | Slow for power users entering many courses |
| Results not shareable | — | Missed viral loop for audience growth |
| No ad-ready layout placeholders | Scalability | Retrofit later = full redesign |
| Tracking limited to page views | User tracking | No insight into behavior/funnels |

---

## 3. Audience & Context: SZABIST Students (Karachi / Pakistan)

| Attribute | Design implication |
|-----------|-------------------|
| Mostly mobile-first (phones on campus, commute, hostels) | Mobile-first responsive, ≥44px touch targets, thumb-friendly bottom actions |
| Late-night study sessions | Dark theme retained; low-blue parchment cards; readable contrast |
| Variable connectivity (campus Wi-Fi, mobile data) | Lightweight (no heavy frameworks), service worker / offline capable |
| English-medium instruction, some Urdu fluency | English UI first; simple academic terminology; Urdu localization later |
| Goal: quick GPA check before registration/advising | Real-time calculation, one-tweet/share result, <3 taps to answer |
| Monetization tolerance | Non-intrusive ads reserved in fixed slots; no pop-ups/interstitials that block calculation |

---

## 4. HCI / UX Principles to Apply

| Principle | Application in this tool |
|-----------|--------------------------|
| **Visibility of system status** (Nielsen #1) | Debounced real-time GPA recalculation on every input change; live credit/GPA summary; loading micro-interactions |
| **Match between system and real world** | Academic terms: "Credit Hours," "Semester," "CGPA," "Grade Points"; semester cards look like register entries |
| **User control & freedom** | Undo/Toast after delete; clear-all with confirmation + toast; back navigation always visible |
| **Consistency & standards** | Identical components across Semester & CGPA modes; same input styles, buttons, toggles |
| **Error prevention** | Numeric guards: credits 0–6, percentage 0–100; disable Calculate when invalid; inline messages |
| **Recognition over recall** | Labels always visible; grade dropdowns show letter + GPA value; no hidden modes |
| **Flexibility & efficiency** | Keyboard Enter/Tab support; quick duplicate course; semester name presets ("Fall 2024") |
| **Aesthetic & minimalist** | One task per screen; no decoration that competes with the result |
| **Error recognition/diagnosis/recovery** | Inline validation with suggested fixes; toast messages instead of alerts |
| **Gestalt: proximity & common region** | Course rows visually grouped inside semester cards; whitespace separates sections |
| **Hick's Law** | Progressive disclosure: advanced options (percentage mode, custom credits) behind toggles |
| **Fitts's Law** | Primary actions (Calculate, Add Course) large and within thumb zone on mobile |
| **Miller's Law** | Chunk courses into semester cards; max 8 semesters shown with pagination feel |
| **Zeigarnik / Goal-gradient** | Show "Semesters complete: X of 8"; progress toward full degree GPA |

---

## 5. Design Direction (Refine, Don't Replace)

Keep the **"Scholarly Desk"** aesthetic — it is memorable and differentiated from generic calculator sites. Refine it:

- **Palette (retained & tokenized):** Mahogany `#1a1410` (bg), Parchment `#f5f0e6` (cards), Brass `#c9a227` (primary/accents), Leather `#8b2635` (destructive/secondary), Ink `#1a1a1a`, Ivory `#e8e0d5`, Warm Gray `#6b6560`, Slate Green `#4a6741`.
- **Typography:** Keep Playfair Display (headings), Source Sans 3 (body), JetBrains Mono (numbers/inputs). Improve scale and line-height for readability.
- **Motion:** Keep page-flip entrance; add subtle slide-in for results, toast notifications, and brass-button press states.
- **Dark-first:** The dark mahogany base stays; a light/parchment mode can be added later via a theme toggle (ad-ready, no layout impact).

---

## 6. Design System (tokens → components)

All values moved into CSS custom properties in `style.css` so theming and ad-insertion never require hunting through HTML.

### Tokens
- `--color-bg`, `--color-surface`, `--color-primary` (brass), `--color-primary-dark`, `--color-secondary` (leather), `--color-text`, `--color-text-muted`, `--color-border`, `--color-success` (slate green), `--color-warning` (leather), `--color-error`.
- `--radius-sm/md/lg`, `--shadow-sm/md/lg`, `--space-xs/sm/md/lg/xl`.
- `--font-display`, `--font-body`, `--font-mono`.
- `--transition-fast`, `--transition-smooth`.

### Components (reusable, class-based)
- `.card` — parchment container with embossed border.
- `.btn-primary` / `.btn-ghost` / `.btn-danger` — brass, leather-outline, leather-fill.
- `.input-field` — mono numeric/text input with focus ring.
- `.toggle` — grade/percentage switch.
- `.course-row` — one course entry (name, credits, grade/%, remove).
- `.semester-card` — container for course rows (CGPA mode).
- `.result-plaque` — big GPA display + classification badge + credits.
- `.badge` — classification pills (Dean's List, Good Standing, Satisfactory, Probation, Warning).
- `.ad-slot` — reserved, layout-stable placeholder for future ads (see §9).

---

## 7. Information Architecture

```
Home (landing)
├── Semester GPA (single semester)
│   ├── Add course row
│   ├── Grade ↔ Percentage toggle
│   └── Calculate → Result plaque (shareable)
└── CGPA (multi-semester, max 8)
    ├── Add semester card
    ├── Add courses per semester
    └── Calculate → Cumulative result plaque
```

Global: Grading scale reference (always accessible), How it works, Share result, Settings (theme, data export/clear).

---

## 8. Screen-by-Screen Redesign Spec

### A. Homepage
- Hero: SZABIST branding + value prop ("Calculate your semester GPA & CGPA in seconds").
- Two primary cards: Semester GPA / CGPA (large touch targets).
- Quick grading-scale preview (collapsible register).
- Persistent footer: ad slot placeholder + privacy/terms links.

### B. Semester GPA page
- Back to home.
- Grade/Percentage toggle (sticky on mobile).
- Course list: each row = course name + credits + grade/select or percentage input + remove.
- "Add Course" button (sticky bottom on mobile).
- **Real-time GPA badge** updates as you type (debounced 300ms).
- Calculate button → scrolls to result plaque.
- Result plaque: GPA (large), credits, classification badge, "Share result" action.

### C. CGPA page
- Back to home.
- Semester cards (max 8), each with own course rows + semester name input.
- Add semester / remove semester (with undo toast).
- Real-time running CGPA shown at top or after each change.
- Calculate → final CGPA plaque with total credits + semester count.

### D. Result state (both)
- Animation: GPA number counts up.
- Classification badge with color meaning.
- "What-if" editor: tap result to adjust a course and see impact (goal-gradient).
- Share: copy text / generate result card image (simple CSS-to-canvas or text share).

---

## 9. Scalability & Monetization Readiness (Ads Later, No Redesign)

Design decisions made **now** so ads can be turned on without touching layout:

1. **Reserved ad slots** — `.ad-slot` components with fixed min-heights (e.g., 280×250 rectangle, 320×50 sticky bottom banner, leaderboard below hero). Collapse gracefully to zero height when empty so no layout shift (CLS-safe).
2. **Ad placement map** (inactive by default):
   - Below homepage hero (leaderboard).
   - Between Semester and CGPA cards on homepage.
   - Sticky bottom banner on calculator pages (mobile only, dismissible).
   - Mid-content rectangle after result plaque (desktop).
3. **Modular architecture** — calc engine (`script.js`) separated from UI; ads and analytics are independent layers injected via IDs/classes, not coupled to calculation logic.
4. **Performance budget** — keep total page weight < 200 KB gzipped; ad scripts lazy-loaded and deferred so calculation never blocks.
5. **Multi-tool extensibility** — same shell can host future tools (CGPA predictor, grade calculator, attendance tracker) under one ad inventory.

---

## 10. User Tracking & Analytics (Privacy-First)

Already integrated: Umami (page views). Extension plan:

- **Anonymous visitor ID** stored in `localStorage` (no PII, no cookies unless consent given) to track returning vs. new users.
- **Custom Umami events** (fire on client-side):
  - `calculator_started` (semester / cgpa)
  - `course_added`
  - `mode_toggled` (grade ↔ percentage)
  - `calculation_completed` (with GPA range bucket: 0–1.99, 2.0–2.99, 3.0–3.74, 3.75–4.0)
  - `result_shared`
  - `data_cleared`
  - `ad_slot_impression` (when ads go live)
- **Consent banner** (minimal, Pakistan PECA / global GDPR-aligned) before enabling extended event tracking; calculation works without consent.
- **Export / delete my data** button in Settings (localStorage control), building trust for audience growth.

---

## 11. Accessibility (WCAG 2.1 AA)

- Color contrast ≥ 4.5:1 for text (ink on parchment, brass on mahogany verified).
- All controls keyboard operable; visible focus rings (`--color-primary` focus).
- Screen-reader labels on toggles, delete buttons, result badge (`aria-live="polite"` for GPA updates).
- `lang="en"`, semantic `<section>`, `<button>`, `<label>`.
- Reduced-motion support (`prefers-reduced-motion` disables flips).
- Zoom up to 200% without loss of function.

---

## 12. Performance & PWA

- < 1s First Contentful Paint on 3G (CDN fonts + Tailwind already; remove unused CSS).
- `localStorage` persistence works offline.
- Optional Phase 5: service worker for offline calculator use + "Add to Home Screen" PWA manifest.

---

## 13. Implementation Roadmap (Phases)

| Phase | Scope | Goal |
|-------|-------|------|
| **1** | Design system tokens, component refactor, accessibility audit | Stable foundation; no visual regression |
| **2** | Real-time calculation, inline validation, mobile polish, sticky actions | Core UX fixed |
| **3** | Tracking events, consent banner, undo toasts, share result | Audience insight + growth loop |
| **4** | Reserved ad slots (inactive), lazy ad loader, results page | Monetization ready |
| **5** | PWA / offline, data export, light theme, multi-tool shell | Scale & retention |

---

## 14. Open Questions (need your alignment before coding)

1. **Grading policy:** Confirm the current SZABIST scale in `script.js` (A+ 90–100 = 4.00 … F 0–54 = 0.00) is exactly right for Karachi campus, or should we adjust ranges/grade points?
2. **Ad network:** Any preference (Google AdSense, Ezoic, Carbon, direct)? This determines slot sizes but not the design.
3. **Tracking consent:** Show a GDPR/PECA-style consent banner on first visit, or track anonymously by default with an opt-out in Settings?
4. **Single-page vs. multi-page:** Keep the current single-file SPA (page-flip transitions) or split into separate HTML pages for better SEO/ad impressions?
5. **Result sharing:** Simple text/share via Web Share API, or generate a downloadable result card image?
6. **Language:** English-only MVP, or include Urdu labels from the start?

---

## 15. Success Metrics

- Time-to-first-GPA < 30 seconds.
- Real-time calculation used by ≥ 70% of sessions (vs. explicit calculate button).
- Returning visitor rate (via anonymous ID) trending up over 30 days.
- Zero layout-shift when ad slots are enabled (CLS < 0.1).
- Accessibility: no critical WCAG AA violations.

---

**Next step:** Review the plan above, answer the open questions, and I'll begin implementing Phase 1 (design system + component refactor) on this branch.
