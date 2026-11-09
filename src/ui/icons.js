/** Inline SVG icons (hand-drawn style, no external assets). */

export const heartSVG = (full) => `
<svg viewBox="0 0 32 30" class="heart ${full ? 'full' : 'empty'}" aria-hidden="true">
  <path d="M16 27.5 C 7 21, 2.2 15.5, 3 9.6 C 3.7 4.6, 9.6 2.4, 13.2 5.6 C 14.6 6.8, 15.4 8, 16 9.2 C 16.7 7.9, 17.6 6.6, 19.1 5.5 C 22.9 2.6, 28.6 4.9, 29 10 C 29.5 15.9, 24.6 21.3, 16 27.5 Z"
    stroke="#232838" stroke-width="2.2" stroke-linejoin="round"/>
  ${full ? '<path d="M8 9.5 C 8.6 7.4, 10.6 6.6, 12 7.4" stroke="rgba(255,255,255,0.55)" stroke-width="1.6" fill="none" stroke-linecap="round"/>' : ''}
</svg>`;

export const hourglassSVG = `
<svg viewBox="0 0 24 24" class="hourglass" aria-hidden="true">
  <path d="M6 3 H18 M6 21 H18 M7 3 C 7 9, 11 10, 12 12 C 13 14, 17 15, 17 21 M17 3 C 17 9, 13 10, 12 12 C 11 14, 7 15, 7 21"
    stroke="#232838" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M9.2 18.6 C 10.5 16.8, 13.5 16.8, 14.8 18.6 Z" fill="#556080"/>
</svg>`;

export const pageSVG = `
<svg viewBox="0 0 24 24" class="page-ico" aria-hidden="true">
  <path d="M6 3 H15 L19 7 V21 H6 Z" fill="#f3f4ef" stroke="#232838" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M15 3 V7 H19" fill="none" stroke="#232838" stroke-width="1.4"/>
  <path d="M8.5 11 H16 M8.5 14 H16 M8.5 17 H13" stroke="#556080" stroke-width="1.2" stroke-linecap="round"/>
</svg>`;

export const pauseSVG = `
<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5 V18.5 M15.5 5.5 V18.5" stroke="#232838" stroke-width="3" stroke-linecap="round"/></svg>`;

export const undoSVG = `
<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 L4.5 11 L9 15 M5 11 H14.5 C 17.5 11, 19.5 13, 19.5 16 C 19.5 18, 18.5 19.2, 17.5 20" stroke="#232838" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const compassSVG = `
<svg viewBox="0 0 64 64" aria-hidden="true">
  <circle cx="32" cy="32" r="27" fill="none" stroke="#232838" stroke-width="2.5"/>
  <circle cx="32" cy="32" r="21" fill="none" stroke="#556080" stroke-width="1"/>
  <path d="M32 6 L37 32 L32 58 L27 32 Z" fill="#232838"/>
  <path d="M6 32 L32 27 L58 32 L32 37 Z" fill="#c95450"/>
  <circle cx="32" cy="32" r="3.5" fill="#f3f4ef" stroke="#232838" stroke-width="1.5"/>
</svg>`;
