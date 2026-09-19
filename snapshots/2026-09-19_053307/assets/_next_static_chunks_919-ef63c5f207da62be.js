"use strict";(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[919],{11692:(a,e,i)=>{i.d(e,{Z:()=>r});var t=i(21967);function r({label:a,onClick:e,disabled:i,testId:n,variant:o}){return(0,t.jsx)("button",{type:"button",className:`aqua-cta${"green"===o?" aqua-cta--green":""}`,"data-testid":n,disabled:i,onClick:e,children:a})}i(31431)},35402:(a,e,i)=>{i.d(e,{FW:()=>t,W0:()=>n,ay:()=>r});let t={accent:"#7B3FE4",accentRgb:"123, 63, 228",surface:"rgba(5, 5, 5, 0.5)",chrome:"transparent",ctaFill:"#14101c",textDim:"rgba(255, 255, 255, 0.5)",radiusPanel:"1rem",radiusCta:"0.75rem",pill:"9999px",tokenIcon:32,flipCircle:48,flipArrows:30,amountLeftPillRight:!0,fontScale:1.15,ctaFontSize:"1.488rem",ctaPadding:"1.25rem 0",ctaWeight:500,labels:{sell:"You Pay",buy:"You Receive"}},r=`
  .aqua-cta {
    margin-top: -2px;
    width: 100%;
    border: 0;
    border-radius: 8px;
    background: rgb(${t.accentRgb});
    color: #fff;
    font-size: 1.294rem;
    font-weight: 600;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    line-height: 1;
    height: 68px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 0.15s ease, transform 0.05s ease;
  }
  .aqua-cta:hover:not(:disabled) { background: rgba(${t.accentRgb}, 0.9); }
  .aqua-cta:active:not(:disabled) { transform: scale(0.98); }
  .aqua-cta:disabled { opacity: 0.5; cursor: default; }
`,n=`
  .aqua-shell { position: relative; width: 100%; color: #fff; opacity: 0; transition: opacity .25s ease; }
  /* A network menu crosses panel and widget boundaries. Raise every stacking
     context in its ancestry so the open picker paints above the whole page. */
  .aqua-shell:has(.aqua-netmenu) { z-index: 2147483647; }
  .aqua-shell--ready { opacity: 1; }
  .aqua-tabs {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    border-radius: ${t.pill};
    background: ${t.surface};
    margin-bottom: 0.5rem;
  }
  .aqua-tab {
    border: 0;
    cursor: pointer;
    padding: 0.45rem 1.1rem;
    border-radius: ${t.pill};
    background: transparent;
    color: ${t.textDim};
    font-size: 0.9rem;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    transition: color .15s, background .15s;
  }
  .aqua-tab:hover { color: #fff; }
  .aqua-tab.on {
    background: ${t.ctaFill};
    color: rgb(${t.accentRgb});
  }
  .aqua-tab img { width: 18px; height: 18px; border-radius: 50%; }
  .aqua-tab--sm { padding: 0.3rem 0.75rem; font-size: 0.8rem; }
  .aqua-tab--sm img { width: 14px; height: 14px; }
  .aqua-tab__ico { width: 16px; height: 16px; display: inline-flex; }
  /* chain squares (classic pond selector style): tinted glyph tiles,
     inactive = grayscale + dimmed. Only the selector-header minis remain —
     the top tab row is gone (the Pay/Receive labels are the network control). */
  .aqua-sq {
    width: 46px;
    height: 46px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    transition: opacity .15s, filter .15s;
  }
  .aqua-sq svg { width: 100%; height: 100%; display: block; }
  .aqua-sq:not(.on) { filter: grayscale(1); opacity: 0.3; }
  .aqua-sq:not(.on):hover { opacity: 0.6; }
  .aqua-sq--sm { width: 28px; height: 28px; }
  .aqua-pane { width: 100%; }
  .aqua-pane--rel { position: relative; }
  /* Jupiter builds its shadow DOM over several paints. Keep that intermediate
     plugin UI masked behind Aqua panel placeholders, then reveal the complete
     styled form once both panels and the mirrored CTA exist. */
  .aqua-solstage > * { transition: opacity 180ms ease; }
  .aqua-solstage:not(.aqua-solstage--ready) {
    min-height: 360px;
    overflow: hidden;
  }
  .aqua-solstage:not(.aqua-solstage--ready) > * {
    opacity: 0;
    pointer-events: none;
  }
  .aqua-solstage:not(.aqua-solstage--ready)::before {
    content: '';
    position: absolute;
    inset: 0 8px auto;
    height: 348px;
    border-radius: 12px;
    background:
      linear-gradient(${t.surface}, ${t.surface}) 0 0 / 100% 132px no-repeat,
      linear-gradient(${t.surface}, ${t.surface}) 0 144px / 100% 132px no-repeat,
      linear-gradient(${t.surface}, ${t.surface}) 0 292px / 100% 56px no-repeat;
    pointer-events: none;
  }
  .aqua-solstage:not(.aqua-solstage--ready)::after {
    content: '';
    position: absolute;
    inset: 0 8px auto;
    height: 348px;
    border-radius: 12px;
    background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.05) 50%, transparent 70%);
    background-size: 250% 100%;
    animation: aqua-panel-shimmer 1.4s infinite linear;
    pointer-events: none;
  }
  /* The terminal wrapper is a plain auto-height flow box — never a scroll
     container (a bounded height at some window sizes put a scrollbar inside
     the widget). If anything ever does scroll here, the bar stays hidden. */
  .aqua-terminal { overflow: visible; scrollbar-width: none; }
  .aqua-terminal::-webkit-scrollbar { display: none; }
  /* network squares on the token-selector's header line (left side; the
     plugin's close X is flex-ordered to the right of the same line) */
  .aqua-chainstrip {
    position: absolute;
    top: 12px;
    left: 16px;
    z-index: 1000; /* above the plugin's internal overlay stack */
    display: flex;
    align-items: center;
    gap: 6px;
  }
  /* curated quick-pick chips under the token-selector search */
  .aqua-quicktokens {
    position: absolute;
    top: 118px;
    left: 16px;
    right: 16px;
    z-index: 1000;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }
  .aqua-qt {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 4px 8px;
    border-radius: ${t.pill};
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: transparent;
    color: rgba(232, 249, 255, 0.75);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background .15s, transform .05s;
  }
  .aqua-qt:hover { background: rgba(255, 255, 255, 0.08); }
  .aqua-qt:active { transform: scale(0.98); }
  .aqua-qt img { width: 24px; height: 24px; border-radius: 50%; }
  .aqua-routescan {
    margin: 3px 8px 5px;
    padding: 6px 14px;
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: flex-start;
    min-height: 32px;
    box-sizing: border-box;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    column-gap: 12px;
    row-gap: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.5);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    text-align: left;
    background: rgba(5, 5, 5, 0.5) !important;
    border-radius: 8px;
    transition: opacity 0.18s ease;
  }
  .aqua-routescan::-webkit-scrollbar { display: none; }
  .aqua-routescan--refreshing { opacity: 0.72; }
  .aqua-routescan--loading { min-height: 32px; }
  .aqua-routescan--empty { opacity: 0.72; }
  .aqua-routescan__quote-skel {
    width: 112px;
    height: 11px;
    flex: none;
  }
  /* each quote is one unbreakable segment — wraps happen BETWEEN quotes */
  .aqua-routescan__q {
    color: rgba(255, 255, 255, 0.68);
    white-space: nowrap;
  }
  .aqua-routescan__label {
    display: inline-flex;
    align-items: center;
    flex: none;
    gap: 5px;
    margin-right: auto;
    color: rgba(255, 255, 255, 0.5);
  }
  .aqua-routescan__ico {
    display: inline-block;
    vertical-align: -2px;
    flex-shrink: 0;
  }
  .aqua-routescan__provider {
    display: inline-block;
    width: auto;
    height: 12px;
    margin: 0 2px;
    vertical-align: -2px;
    color: rgba(255, 255, 255, 0.82);
    object-fit: contain;
    flex-shrink: 0;
  }
  .aqua-routescan__provider--jupiter { width: 38px; height: 12px; }
  .aqua-routescan__provider--okx { width: 30px; height: 10px; vertical-align: -1px; }
  .aqua-routescan__provider--psm { width: 12px; height: 12px; }
  .aqua-routescan__provider--poolvault { width: 13px; height: 13px; border-radius: 2px; }
  .aqua-routescan__provider--trix { width: 14px; height: 14px; border-radius: 3px; }
  .aqua-routescan__provider--debridge { width: 61px; height: 10px; vertical-align: -1px; }
  .aqua-routescan__provider--uniswap { width: 14px; height: 14px; color: #ff37c7; }
  .aqua-routescan__provider-name {
    display: inline-block;
    margin: 0 2px;
    color: rgba(255, 255, 255, 0.82);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  /* Native cross-chain panels already own their horizontal gutter. Keep the
     market strip on the same edge as the input panels and primary CTA. */
  .aqua-cross-pane > .aqua-routescan {
    margin: -6px 0 0;
    padding-right: 16px;
    padding-left: 16px;
  }

  /* ---- native EVM pane (CoW API under aqua chrome) ----
     Pixel-cloned from the live Jup pane's computed styles (2026-08-13):
     Inter; panels 12px radius, 12px 16px padding, rgba(5,5,5,.5) fill;
     labels 13.8px @ 50% #E8F9FF; amounts 23px/600 #E8F9FF; pills #170929
     radius-full 10px 8px with 16px/600 text + 32px icon; flip 48px over a
     circular panel cutout; CTA #14101c radius 12px, 18.4px/500 #7B3FE4. */
  .aqua-evm {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0.25rem 0.25rem 0.75rem;
    text-align: left;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  .aqua-liquidity-pane { gap: 5px; }
  .aqua-panel {
    position: relative;
    background: ${t.surface};
    border-radius: 12px;
    padding: 18px 16px 20px;
  }
  /* pending value: the panel BACKGROUND shimmers while everything stays in
     place — content is never swapped for placeholder bars. The overlay
     rounds ITSELF (no overflow:hidden on the panel — that would clip the
     network dropdown). */
  .aqua-panel--loading::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.05) 50%, transparent 70%);
    background-size: 250% 100%;
    animation: aqua-panel-shimmer 1.4s infinite linear;
  }
  @keyframes aqua-panel-shimmer {
    0% { background-position: 125% 0; }
    100% { background-position: -125% 0; }
  }
  .aqua-panel__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 14px;
    min-height: 22px;
  }
  .aqua-panel__label { font-size: 13.8px; font-weight: 400; color: rgba(232, 249, 255, 0.5); }
  .aqua-panel__balance {
    font-size: 13.8px;
    color: rgba(232, 249, 255, 0.5);
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: transparent;
    border: 0;
    padding: 0;
    font-family: inherit;
  }
  .aqua-panel__balance:hover { color: rgba(232, 249, 255, 0.8); }
  .aqua-panel__balance b { color: rgba(255, 255, 255, 0.78); font-weight: 600; }
  .aqua-balgroup { display: flex; align-items: center; gap: 0.35rem; }
  /* Half / Max quick-fill chips (sell side only) */
  .aqua-chip {
    height: 1.7rem;
    padding: 0 0.55rem;
    border-radius: 0.4rem;
    border: 0;
    background: rgb(255 255 255 / 3%);
    color: rgb(255 255 255 / 15%);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    font-family: inherit;
    cursor: pointer;
    transition: color .15s, border-color .15s, transform .05s;
  }
  .aqua-chip:hover:not(:disabled) { border-color: rgb(${t.accentRgb}); color: rgb(${t.accentRgb}); }
  .aqua-chip:active:not(:disabled) { transform: scale(0.98); }
  .aqua-chip:disabled { opacity: 0.4; cursor: default; }
  .aqua-chip--xs { height: 1.45rem; padding: 0 0.5rem; font-size: 9px; }
  /* Half/Max on the Solana pane: shell overlay floated beside the plugin's
     own balance readout (position measured at runtime). */
  .aqua-halfmax {
    position: absolute;
    z-index: 1000;
    display: flex;
    gap: 4px;
  }
  .aqua-panel__row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
  .aqua-panel__fiat {
    margin-top: 12px;
    text-align: right;
    font-size: 13.8px;
    color: rgba(232, 249, 255, 0.5);
    min-height: 20px;
  }
  .aqua-amount {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    outline: none;
    color: #E8F9FF;
    font-size: 32px;
    letter-spacing: -0.6px;
    font-weight: 600;
    font-family: inherit;
  }
  .aqua-amount::placeholder { color: rgba(232, 249, 255, 0.45); }
  .aqua-amount--out { color: #E8F9FF; }
  .aqua-pill {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 10px 8px;
    border: 0;
    border-radius: ${t.pill};
    background: #170929;
    color: #E8F9FF;
    cursor: pointer;
    font-family: inherit;
  }
  .aqua-pill img { width: ${t.tokenIcon}px; height: ${t.tokenIcon}px; border-radius: 50%; }
  .aqua-pill__sym { font-size: 16px; font-weight: 600; }
  /* Match the Solana terminal's flip seam. Only a background layer is
     masked—not the panel itself—so network menus remain free to overflow. */
  .aqua-evm > .aqua-panel:has(+ .aqua-fliprow),
  .aqua-evm > .aqua-fliprow + .aqua-panel {
    background: transparent;
    z-index: 0;
  }
  .aqua-evm > .aqua-panel:has(+ .aqua-fliprow)::before,
  .aqua-evm > .aqua-fliprow + .aqua-panel::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: ${t.surface};
    pointer-events: none;
  }
  .aqua-evm:has(.aqua-netmenu),
  .aqua-evm > .aqua-panel:has(.aqua-netmenu),
  .aqua-netlabel-seat:has(.aqua-netmenu),
  .aqua-netlabel:has(.aqua-netmenu) { z-index: 2147483647; }
  .aqua-evm > .aqua-panel:has(+ .aqua-fliprow)::before,
  .aqua-evm > .aqua-panel:has(+ .aqua-fliprow).aqua-panel--loading::after {
    -webkit-mask-image: radial-gradient(circle at 50% calc(100% + 2px), transparent 27.5px, #000 28.5px);
    mask-image: radial-gradient(circle at 50% calc(100% + 2px), transparent 27.5px, #000 28.5px);
  }
  .aqua-evm > .aqua-fliprow + .aqua-panel::before,
  .aqua-evm > .aqua-fliprow + .aqua-panel.aqua-panel--loading::after {
    -webkit-mask-image: radial-gradient(circle at 50% -2px, transparent 27.5px, #000 28.5px);
    mask-image: radial-gradient(circle at 50% -2px, transparent 27.5px, #000 28.5px);
  }
  .aqua-fliprow {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 4px;
    margin: -10px 0;
  }
  .aqua-flip {
    width: ${t.flipCircle}px;
    height: ${t.flipCircle}px;
    border-radius: 50%;
    border: 0;
    background: ${t.surface};
    color: rgba(232, 249, 255, 0.8);
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color .15s, background-color .15s;
  }
  .aqua-flip svg { width: ${t.flipArrows}px; height: ${t.flipArrows}px; }
  .aqua-flip:hover { color: rgb(${t.accentRgb}); }
  /* mobile: shrink the control and its matching panel cutout together */
  @media (max-width: 480px) {
    .aqua-evm > .aqua-panel:has(+ .aqua-fliprow)::before,
    .aqua-evm > .aqua-panel:has(+ .aqua-fliprow).aqua-panel--loading::after {
      -webkit-mask-image: radial-gradient(circle at 50% calc(100% + 2px), transparent 23.5px, #000 24.5px);
      mask-image: radial-gradient(circle at 50% calc(100% + 2px), transparent 23.5px, #000 24.5px);
    }
    .aqua-evm > .aqua-fliprow + .aqua-panel::before,
    .aqua-evm > .aqua-fliprow + .aqua-panel.aqua-panel--loading::after {
      -webkit-mask-image: radial-gradient(circle at 50% -2px, transparent 23.5px, #000 24.5px);
      mask-image: radial-gradient(circle at 50% -2px, transparent 23.5px, #000 24.5px);
    }
    .aqua-flip {
      width: 38px;
      height: 38px;
    }
    .aqua-flip svg { width: 28px; height: 28px; }
  }
  .aqua-meta {
    margin-top: 2px;
    text-align: center;
    font-size: 13px;
    color: rgba(232, 249, 255, 0.5);
  }
  .aqua-meta--err { color: #ff7a7a; }
  .aqua-meta--ok { color: #3dd741; }
  .aqua-meta a { color: inherit; text-decoration: underline; }
  /* Paper PSM execution panel — replaces the (hidden) plugin CTA, so it
     borrows .aqua-cta wholesale and only adds spacing. */
  .aqua-psm { margin-top: 2px; }
  /* The PSM amount painted into the terminal's You Receive field (whose own
     value is blanked — the plugin can't quote this route). Clones the
     plugin's amount type: 23px/600 #E8F9FF after the 15% bump. */
  .aqua-psm-out {
    position: absolute;
    z-index: 1000;
    pointer-events: none;
    font-size: 32px;
    letter-spacing: -0.6px;
    font-weight: 600;
    color: #E8F9FF;
    line-height: 1.2;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  ${r}
  /* sol pane: the plugin's panels sit inside an 8px form gutter — inset
     every CTA on this pane (shell mirror + PSM/poolvault takeovers) to sit
     flush with the panel edges. 10px above covers the no-strip case; when
     the market check strip precedes the CTA, ITS 10px bottom margin is the
     gap instead (kept uniform, never doubled). */
  .aqua-pane--rel .aqua-cta {
    width: calc(100% - 16px);
    margin-left: 8px;
    margin-right: 8px;
    margin-top: 10px;
  }
  .aqua-routescan + .aqua-cta { margin-top: 0 !important; }
  /* green variant: the create-vault CTA only — same shape, green fill */
  .aqua-cta--green { background: rgb(34, 197, 94); }
  .aqua-cta--green:hover:not(:disabled) { background: rgba(34, 197, 94, 0.9); }

  /* ---- Pay on / Receive on network labels + menu ----
     One control on every pane (and overlaid onto the terminal's own label
     slots): "Pay" plain, "on" dimmed, network segment clickable. */
  .aqua-netlabel {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 13.8px;
    font-weight: 400;
    color: rgba(232, 249, 255, 0.5);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    white-space: nowrap;
  }
  .aqua-netlabel__on { opacity: 0.55; }
  /* mobile: the label row shares its line with the balance readout — shrink
     so "Pay on Solana" never collides with it */
  @media (max-width: 480px) {
    .aqua-netlabel { font-size: 11.5px; gap: 4px; }
    .aqua-netlabel__net img, .aqua-netlabel__net svg { width: 13px; height: 13px; }
  }
  .aqua-netlabel__net {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 4px;
    margin: -2px 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: rgba(232, 249, 255, 0.85);
    font: inherit;
    cursor: pointer;
    transition: background .15s, color .15s;
  }
  .aqua-netlabel__net:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
  /* network dropdown — wallet-picker language: dark rounded panel, rounded-
     square tiles, bold names, check-circle on the active row. No search. */
  .aqua-netmenu {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 2147483647;
    min-width: 224px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px;
    border-radius: 20px;
    background: #131313;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 10px 15px -3px rgba(19, 19, 19, 0.54), 0 4px 6px -2px rgba(19, 19, 19, 0.4);
  }
  .aqua-netmenu__row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    text-align: left;
  }
  .aqua-netmenu__row:hover { background: rgba(255, 255, 255, 0.07); }
  .aqua-netmenu__name { flex: 1; }
  /* overlay seat for the labels painted onto the terminal's label slots */
  .aqua-netlabel-seat { position: absolute; z-index: 1100; }

  /* ---- unified token selector (EVM pane) ----
     The SAME selector language the Solana pane gets from the jup-plugin
     overrides: near-black surface, unified header line (chain squares left,
     pond X right, no title), quiet search field, quick-pick chips, flat
     compact rows with a soft hover and a "Name \xb7 address" metadata line. */
  .aqua-select {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 0.25rem 0.25rem 0.75rem;
    min-height: 430px;
    text-align: left;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  .aqua-select__head { display: flex; align-items: center; justify-content: space-between; }
  .aqua-select__x {
    background: none;
    border: 0;
    padding: 4px;
    margin-right: 0.5rem;
    color: rgba(232, 249, 255, 0.75);
    cursor: pointer;
    line-height: 0;
  }
  .aqua-select__x:hover { color: #fff; }
  .aqua-select__search {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 12px;
    padding: 10px 14px;
    color: rgba(232, 249, 255, 0.5);
  }
  .aqua-select__search input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    outline: none;
    color: #E8F9FF;
    font-size: 15px;
    font-family: inherit;
  }
  .aqua-select__search input::placeholder { color: rgba(232, 249, 255, 0.45); }
  .aqua-select__quick { display: flex; flex-wrap: wrap; gap: 8px; }
  .aqua-select__rows {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    max-height: 340px;
    scrollbar-width: none;
  }
  .aqua-select__rows::-webkit-scrollbar { display: none; }
  .aqua-selrow {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0.55rem 0.5rem;
    border: 0;
    border-radius: 10px;
    background: transparent;
    cursor: pointer;
    text-align: left;
    color: #fff;
    font-family: inherit;
  }
  .aqua-selrow:hover { background: rgba(255, 255, 255, 0.05); }
  .aqua-selrow img { width: 36px; height: 36px; border-radius: 50%; }
  .aqua-selrow__main { flex: 1; min-width: 0; }
  .aqua-selrow__sym { display: block; font-size: 16px; font-weight: 600; }
  .aqua-selrow__meta {
    display: block;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .aqua-selrow__bal { font-size: 14.5px; font-weight: 500; color: rgba(255, 255, 255, 0.9); }
  .aqua-select__empty {
    padding: 28px 12px;
    color: rgba(232, 249, 255, 0.45);
    font-size: 14px;
    text-align: center;
  }

  /* ---- mode tabs row (Swap / Limit) + the GigaSwap badge ---- */
  .aqua-modes {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px 8px;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  .aqua-mode {
    border: 0;
    background: transparent;
    color: rgba(232, 249, 255, 0.45);
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    padding: 4px 14px;
    border-radius: ${t.pill};
    cursor: pointer;
    transition: color .15s, background .15s;
  }
  .aqua-mode:hover { color: rgba(232, 249, 255, 0.8); }
  .aqua-mode.on {
    background: rgba(5, 5, 5, 0.7) !important;
    color: #CBB1FF;
  }
  /* limit-variant dropdown (grouped: SELL / BUY / COMBOS) */
  .aqua-mode--limit { display: inline-flex; align-items: center; gap: 6px; position: relative; }
  .aqua-limitmenu {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 1300;
    min-width: 232px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px;
    border-radius: 16px;
    background: #131313;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 10px 15px -3px rgba(19, 19, 19, 0.54), 0 4px 6px -2px rgba(19, 19, 19, 0.4);
  }
  .aqua-limitmenu__group {
    padding: 6px 10px 4px;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.45);
  }
  .aqua-limitmenu__rule { height: 1px; margin: 6px 4px; background: rgba(255, 255, 255, 0.08); }
  .aqua-limitmenu__row {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 9px 10px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    text-align: left;
  }
  .aqua-limitmenu__row:hover { background: rgba(255, 255, 255, 0.06); }
  .aqua-limitmenu__row.on { background: rgba(255, 255, 255, 0.07); color: #CBB1FF; }
  .aqua-limitmenu__ico { display: inline-flex; color: rgba(255, 255, 255, 0.55); }
  .aqua-limitmenu__row.on .aqua-limitmenu__ico { color: #CBB1FF; }
  .aqua-limitmenu__name { flex: 1; }

  /* limit pane extras */
  .aqua-limit-receive { display: inline-flex; align-items: baseline; gap: 10px; min-width: 0; }
  .aqua-limit-receive__val { font-size: 18px; font-weight: 600; color: #E8F9FF; }
  .aqua-limit-unit { font-size: 16px; font-weight: 600; color: rgba(232, 249, 255, 0.75); flex: none; }
  .aqua-limit-chips {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
  }
  .aqua-limit-market { font-size: 12px; color: rgba(232, 249, 255, 0.5); white-space: nowrap; }
  .aqua-limit-chips__set { display: inline-flex; gap: 6px; }
  .aqua-chip--on { background: #CBB1FF !important; color: #14101c !important; }
  .aqua-limit-expiry {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 2px 6px 6px;
  }

  /* ---- liquidity pane ---- */
  .aqua-liq-browser {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    overflow: visible;
    background: transparent;
  }
  .aqua-liq-tabs {
    position: relative;
    display: inline-flex;
    align-self: center;
    height: 40px;
    align-items: center;
    user-select: none;
    padding: 3px;
    border: 1px solid rgb(232 249 255 / 7%);
    border-radius: 9999px;
    background: transparent;
    color: #E8F9FF;
    font-size: 15px;
    font-weight: 500;
    line-height: 24px;
    transition: color 75ms ease;
  }
  .aqua-liq-tabs button {
    height: 100%;
    flex: 1;
    border: 0;
    border-radius: 9999px;
    background: transparent;
    padding: 0 16px;
    color: #E8F9FF;
    cursor: pointer;
    font: inherit;
    opacity: 0.4;
    white-space: nowrap;
    transition: color 75ms ease, background-color 75ms ease, opacity 75ms ease;
  }
  .aqua-liq-tabs button:hover { opacity: 1; }
  .aqua-liq-tabs button.on {
    background: rgb(96 91 91 / 59%);
  }
  .aqua-liq-directory {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: visible;
    padding: 8px 0 0;
  }
  .aqua-liq-row {
    display: grid;
    grid-template-columns: 50px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    width: 100%;
    border: 0;
    border-radius: 10px;
    background: transparent;
    padding: 8px;
    color: #E8F9FF;
    cursor: pointer;
    font: inherit;
    text-align: left;
  }
  .aqua-liq-row:hover { background: rgba(255, 255, 255, 0.035); }
  .aqua-liq-row.on {
    background: transparent;
  }
  .aqua-liq-row img {
    width: 50px;
    height: 50px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.05);
    object-fit: cover;
  }
  .aqua-liq-row__main {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
    font-size: 15.5px;
    font-weight: 600;
    line-height: 1.15;
  }
  .aqua-liq-row__main b { font-size: inherit; font-weight: inherit; line-height: inherit; }
  .aqua-liq-row__main i {
    overflow: hidden;
    color: rgba(232, 249, 255, 0.38);
    font-size: 10.5px;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .aqua-liq-status {
    max-width: 210px;
    overflow: hidden;
    color: white;
    font-size: 15.5px;
    font-weight: 600;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .aqua-liq-status.paused { color: #ffcf6b; }
  .aqua-liq-status.first {
    color: rgba(232, 249, 255, 0.55);
    font-size: 13px;
    font-weight: 500;
  }
  .aqua-liq-status__skel {
    display: inline-block;
    width: 74px;
    height: 10px;
    border-radius: 9999px;
    vertical-align: -1px;
  }
  .aqua-liq-empty {
    border: 0;
    background: transparent;
    padding: 18px 12px;
    color: rgba(232, 249, 255, 0.45);
    font: inherit;
    font-size: 11.5px;
    text-align: center;
  }
  .aqua-liq-section { background: rgba(5, 5, 5, 0.78); }
  .aqua-liquidity-pane .aqua-chip {
    background: rgba(255, 255, 255, 0.075);
    color: rgba(255, 255, 255, 0.72);
  }
  .aqua-liquidity-pane .aqua-chip:disabled { opacity: 0.36; }
  .aqua-liq-overview {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0;
    overflow: hidden;
    border-radius: 12px;
    background: rgba(5, 5, 5, 0.78);
  }
  .aqua-liq-metric {
    display: flex;
    min-width: 0;
    min-height: 108px;
    flex-direction: column;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 16px;
    border-radius: 0;
    background: transparent;
    color: white;
  }
  .aqua-liq-metric--balances {
    grid-column: 1 / -1;
    min-height: 136px;
    border-bottom: 1px solid rgba(232, 249, 255, 0.07);
  }
  .aqua-liq-metric:nth-child(n + 3) { border-left: 1px solid rgba(232, 249, 255, 0.07); }
  .aqua-liq-metric__label {
    color: rgba(255, 255, 255, 0.62);
    font-size: 15.5px;
    font-weight: 500;
    line-height: 1.15;
  }
  .aqua-liq-metric__value {
    overflow: hidden;
    color: white;
    font-size: clamp(20px, 3.8vw, 28px);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.035em;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .aqua-liq-metric__skel {
    display: block;
    width: min(112px, 82%);
    height: 34px;
    border-radius: 7px;
  }
  .aqua-liq-balancevals {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .aqua-liq-balancevals b {
    min-width: 0;
    overflow: hidden;
    color: white;
    font-size: clamp(20px, 4.2vw, 30px);
    font-weight: 500;
    letter-spacing: -0.025em;
    line-height: 1.05;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .aqua-liq-balancevals b:last-child { text-align: right; }
  .aqua-liq-balancebar {
    display: flex;
    width: 100%;
    height: 16px;
    flex: none;
    overflow: hidden;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.08);
  }
  .aqua-liq-balancebar__token { background: #14b8a6; }
  .aqua-liq-balancebar__sol {
    border-left: 3px solid rgba(5, 5, 5, 0.78);
    background: #9945ff;
  }
  .aqua-liq-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    font-size: 12.5px;
    color: rgba(232, 249, 255, 0.55);
    line-height: 1.5;
  }
  .aqua-liq-stats b { color: #E8F9FF; font-weight: 600; }
  .aqua-liq-actions { display: inline-flex; gap: 6px; }
  .aqua-liq-manage {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 12px;
    background: rgba(5, 5, 5, 0.78);
  }
  .aqua-liq-manage > .aqua-liq-section {
    border-radius: 0;
    background: transparent;
  }
  .aqua-liq-manage > .aqua-liq-section + .aqua-liq-section {
    border-top: 1px solid rgba(232, 249, 255, 0.07);
  }
  .aqua-liq-positionstats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .aqua-liq-positionstat {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 6px;
  }
  .aqua-liq-positionstat > span {
    color: rgba(255, 255, 255, 0.48);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.04em;
    line-height: 1.15;
    text-transform: uppercase;
  }
  .aqua-liq-positionstat > b {
    overflow: hidden;
    color: white;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .aqua-liq-add .aqua-panel__top { margin-bottom: 8px; }
  .aqua-liq-available {
    width: 100%;
    justify-content: flex-end;
    margin-bottom: 18px;
    white-space: nowrap;
  }
  .aqua-liq-available > span { margin-left: 2px; }
  .aqua-liquidity-pane .aqua-amount {
    font-size: clamp(26px, 6vw, 32px);
    font-variant-numeric: tabular-nums;
  }
  .aqua-liq-note {
    margin-top: 10px;
    font-size: 11.5px;
    line-height: 1.45;
    color: rgba(232, 249, 255, 0.5);
  }
  .aqua-liq-note b { color: #CBB1FF; }
  /* position projection: labeled stat cells under the amount input */
  .aqua-liq-proj {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
  .aqua-liq-proj > div {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(5, 5, 5, 0.5);
  }
  .aqua-liq-proj i {
    font-style: normal;
    font-size: 10.5px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    white-space: nowrap;
    color: rgba(232, 249, 255, 0.45);
  }
  .aqua-liq-proj b {
    font-size: 13.8px;
    font-weight: 600;
    color: #CBB1FF;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @media (max-width: 480px) {
    .aqua-liq-status { max-width: 120px; }
    .aqua-liq-overview { grid-template-columns: 1fr; }
    .aqua-liq-metric--balances { grid-column: 1; }
    .aqua-liq-metric { min-height: 108px; }
    .aqua-liq-metric--balances { min-height: 136px; }
    .aqua-liq-metric:nth-child(n + 2) {
      border-top: 1px solid rgba(232, 249, 255, 0.07);
      border-left: 0;
    }
    .aqua-liq-positionstats { grid-template-columns: 1fr; }
  }

  /* ---- token stat cards (below the panes; maxx pool data) ---- */
  .aqua-tokencards {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    margin-top: 10px;
  }
  .aqua-tokencards--two { grid-template-columns: 1fr 1fr; }
  /* The stat cards are desktop context; keep the mobile swap surface focused. */
  @media (max-width: 480px) {
    .aqua-tokencards { display: none; }
  }
  .aqua-tokencard {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 18px 16px;
    border-radius: 16px;
    background: rgba(5, 5, 5, 0.5);
    color: #E8F9FF;
    text-decoration: none;
    /* cards render OUTSIDE the widget wrapper — pin the swap panes' stack
       so they never inherit the page's mono body font */
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    transition: background 0.15s ease, transform 0.15s ease;
  }
  .aqua-tokencard:hover { background: rgba(23, 9, 41, 0.6); }
  .aqua-tokencard:active { transform: scale(0.99); }
  .aqua-tokencard__icon {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 9999px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.06);
  }
  .aqua-tokencard__icon.aqua-skel { border-radius: 9999px; }
  .aqua-tokencard__icon--error { background: #000; }
  .aqua-tokencard__icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .aqua-tokencard__icon img[data-loaded='true'] { opacity: 1; }
  .aqua-tokencard__id { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .aqua-tokencard__id b {
    font-size: 15.5px;
    font-weight: 600;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .aqua-tokencard__copy {
    border: 0;
    background: transparent;
    padding: 0;
    font-family: inherit;
    font-size: 12.5px;
    line-height: 1.15;
    color: rgba(232, 249, 255, 0.45);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .aqua-tokencard__copy:hover { color: rgba(232, 249, 255, 0.75); }
  .aqua-tokencard__stats {
    margin-left: auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    flex-shrink: 0;
  }
  .aqua-tokencard__stats b { font-size: 15.5px; font-weight: 600; line-height: 1.15; }
  .aqua-tokencard__stats i { font-style: normal; font-size: 12.5px; line-height: 1.15; }
  .aqua-tokencard__stats i.aqua-up { color: rgb(74, 222, 128); }
  .aqua-tokencard__stats i.aqua-down { color: #fb7185; }

  /* ---- liquidity intro overlay ----
     Uniform with pond's SwapPromoCard: dark card, etched-grid content panel
     (copy left, token cluster right), full-width green-gradient CTA. The
     overlay covers ONLY the liquidity pane (inset of .aqua-pane--rel, which
     sits below the mode row in flow) — the aqua-modes tabs stay reachable. */
  .aqua-pane--rel:has(> .aqua-liqpromo) {
    min-height: 360px;
  }

  .aqua-liqpromo {
    position: absolute;
    inset: 0;
    height: 360px;
    z-index: 1500;
    overflow: hidden;
    border-radius: 16px;
    background: #05070d;
    display: flex;
    flex-direction: column;
    text-align: left;
    padding: 16px;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  .aqua-liqpromo__panel {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    overflow: hidden;
    border-radius: 16px;
    padding: 24px;
    background-color: #05070c;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
    background-size: 44px 44px;
  }
  .aqua-liqpromo__x {
    position: absolute;
    top: 14px;
    right: 14px;
    z-index: 2;
    border: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    padding: 6px;
    line-height: 0;
  }
  .aqua-liqpromo__x:hover { color: #fff; }
  .aqua-liqpromo__copy { position: relative; z-index: 1; min-width: 0; }
  .aqua-liqpromo__title {
    font-size: 1.875rem;
    line-height: 1.25;
    color: #fff;
  }
  .aqua-liqpromo__sub {
    margin-top: 12px;
    font-family: monospace;
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.5);
  }
  .aqua-liqpromo__icons {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    flex: none;
    padding-right: 4px;
  }
  .aqua-liqpromo__icons img {
    width: 48px;
    height: 48px;
    border-radius: 9999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.4);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
  }
  .aqua-liqpromo__cta {
    margin-top: 12px;
    width: 100%;
    border: 2px solid #000;
    border-radius: 12px;
    background: linear-gradient(to bottom, #3dd741, #2db532);
    color: #fff;
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1;
    font-family: inherit;
    padding: 16px;
    cursor: pointer;
  }
  .aqua-liqpromo__cta:hover { background: linear-gradient(to bottom, #2db532, #1f8a24); }

  /* templated instruction banner under the mode row */
  .aqua-limitnote {
    margin: 0 6px 4px;
    padding: 12px 14px;
    border-radius: 12px;
    background: rgba(5, 5, 5, 0.5);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  .aqua-limitnote__title {
    font-size: 14px;
    font-weight: 700;
    color: #CBB1FF;
    margin-bottom: 3px;
  }
  .aqua-limitnote__body {
    font-size: 12.5px;
    line-height: 1.45;
    color: rgba(232, 249, 255, 0.6);
  }
  .aqua-limitnote__body em { font-style: italic; }

  .aqua-giga {
    margin-left: auto;
    position: relative;
    display: inline-block;
    padding-right: 6px;
  }
  .aqua-giga__text {
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    background: linear-gradient(
      to right,
      rgb(123, 31, 162),
      rgb(103, 58, 183),
      rgb(244, 143, 177),
      rgb(123, 31, 162)
    );
    background-size: 200%;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: aqua-giga-pan 3s linear infinite;
  }
  .aqua-giga__star {
    --size: 9px;
    position: absolute;
    display: block;
    width: var(--size);
    height: var(--size);
    left: var(--star-left, 20%);
    top: var(--star-top, 0%);
    pointer-events: none;
    animation: aqua-giga-scale 700ms ease forwards;
  }
  .aqua-giga__star svg {
    display: block;
    width: 100%;
    height: 100%;
    opacity: 0.7;
    animation: aqua-giga-rotate 1000ms linear infinite;
  }
  .aqua-giga__star svg path { fill: rgb(103, 58, 183); }
  .aqua-giga--inactive { opacity: 0.2; }
  .aqua-giga--inactive .aqua-giga__text {
    color: #fff;
    background: none;
    -webkit-text-fill-color: #fff;
    animation: none;
  }
  @keyframes aqua-giga-pan {
    from { background-position: 0% center; }
    to { background-position: -200% center; }
  }
  @keyframes aqua-giga-scale {
    from, to { transform: scale(0); }
    50% { transform: scale(1); }
  }
  @keyframes aqua-giga-rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(180deg); }
  }

  /* ---- swap-success tray: flat panel in flow, after the swap button ---- */
  .aqua-tray {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: rgba(5, 5, 5, 0.5);
    border-radius: 12px;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    margin: 5px 10px 0;
  }
  /* one line: title + tx id only */
  .aqua-tray__main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
    white-space: nowrap;
    overflow: hidden;
  }
  .aqua-tray__title { flex: none; font-size: 12px; font-weight: 600; color: #fff; }
  .aqua-tray__title--err { color: #fb7185; }
  /* cancelled-tx notice: same tray, error accent, 10s then a slow fade */
  .aqua-tray--notice { transition: opacity 0.5s ease; }
  .aqua-tray--fade { opacity: 0; }
  .aqua-tray__sub {
    font-size: 10.5px;
    color: rgba(255, 255, 255, 0.55);
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .aqua-tray__sub--link { text-decoration: none; color: rgba(255, 255, 255, 0.5); }
  .aqua-tray__sub--link:hover { text-decoration: underline; filter: brightness(1.2); }
  .aqua-tray__x {
    flex: none;
    border: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    padding: 4px;
    line-height: 0;
  }
  .aqua-tray__x:hover { color: #fff; }

  /* skeleton shimmer for token-selection rows while balances resolve */
  @keyframes aqua-shimmer {
    0% { background-position: -200px 0; }
    100% { background-position: 200px 0; }
  }
  .aqua-skel {
    background: linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.05) 75%);
    background-size: 400px 100%;
    animation: aqua-shimmer 1.2s infinite linear;
    border-radius: 6px;
  }
  .aqua-selrow--skel { pointer-events: none; }
  .aqua-skel--ico { width: 36px; height: 36px; border-radius: 50%; flex: none; }
  .aqua-skel--sym { width: 64px; height: 14px; margin-bottom: 6px; }
  .aqua-skel--meta { width: 150px; height: 10px; }
  .aqua-skel--bal { width: 48px; height: 14px; }
`},47466:(a,e,i)=>{i.d(e,{Pr:()=>r,W7:()=>n,qj:()=>o});var t=i(70004);let r=7565164;function n(a,e={}){let i=[...a].sort((a,e)=>{if(null!=a.amountOutUsd&&null!=e.amountOutUsd)return e.amountOutUsd-(e.gasUsd??0)-(a.amountOutUsd-(a.gasUsd??0));let i=BigInt(e.amountOut)-BigInt(a.amountOut);return i>BigInt(0)?1:i<BigInt(0)?-1:0});if(!1===e.preferBotFeeRoutes||i.length<2)return i;let r=Math.max(0,Math.min(500,Math.round(e.maxBotFeeShortfallBps??t.j5))),o=i[0],l=i.find(a=>a.botFeeRoute&&function(a,e,i){if(null!=a.amountOutUsd&&null!=e.amountOutUsd){let t=a.amountOutUsd-(a.gasUsd??0),r=e.amountOutUsd-(e.gasUsd??0);return t<=0||r>=t*(1-i/1e4)}return BigInt(e.amountOut)*BigInt(1e4)>=BigInt(a.amountOut)*BigInt(1e4-i)}(o,a,r));return l&&l!==o?[l,...i.filter(a=>a!==l)]:i}let o="/api/aqua"},51927:(a,e,i)=>{i.d(e,{Of:()=>r,Sy:()=>c,_x:()=>u,l:()=>n});var t=i(21967);i(31431);let r=[{id:"solana",label:"Solana",chainId:i(47466).Pr,evm:!1},{id:"ethereum",label:"Ethereum",chainId:1,evm:!0},{id:"robinhood",label:"Robinhood",chainId:4663,evm:!0},{id:"base",label:"Base",chainId:8453,evm:!0}],n=a=>r.find(e=>e.id===a);function o(a){return function({size:e=14}){return(0,t.jsx)("span",{style:{width:e,height:e,display:"inline-flex",flex:"none"},children:(0,t.jsx)(a,{})})}}function l(){return(0,t.jsxs)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 20 20",width:"100%",height:"100%",children:[(0,t.jsxs)("defs",{children:[(0,t.jsxs)("linearGradient",{id:"aqua-sol-g1",x1:"90.737%",x2:"35.509%",y1:"-349.942%",y2:"192.26%",children:[(0,t.jsx)("stop",{offset:"0%",stopColor:"#00FFA3"}),(0,t.jsx)("stop",{offset:"100%",stopColor:"#DC1FFF"})]}),(0,t.jsxs)("linearGradient",{id:"aqua-sol-g2",x1:"66.588%",x2:"11.36%",y1:"-112.888%",y2:"429.314%",children:[(0,t.jsx)("stop",{offset:"0%",stopColor:"#00FFA3"}),(0,t.jsx)("stop",{offset:"100%",stopColor:"#DC1FFF"})]}),(0,t.jsxs)("linearGradient",{id:"aqua-sol-g3",x1:"78.586%",x2:"23.358%",y1:"-230.655%",y2:"311.548%",children:[(0,t.jsx)("stop",{offset:"0%",stopColor:"#00FFA3"}),(0,t.jsx)("stop",{offset:"100%",stopColor:"#DC1FFF"})]})]}),(0,t.jsxs)("g",{fill:"none",fillRule:"evenodd",children:[(0,t.jsx)("rect",{width:"20",height:"20",fill:"#1B1B1B",rx:"5"}),(0,t.jsx)("rect",{width:"20",height:"20",fill:"#9558FF",fillOpacity:"0.2",rx:"5"}),(0,t.jsxs)("g",{transform:"translate(5 6)",children:[(0,t.jsx)("path",{fill:"url(#aqua-sol-g1)",d:"M1.625 6.098A.323.323 0 011.856 6h7.98c.146 0 .219.18.116.286L8.375 7.902A.323.323 0 018.144 8H.164c-.146 0-.219-.18-.116-.286l1.577-1.616z"}),(0,t.jsx)("path",{fill:"url(#aqua-sol-g2)",d:"M1.625.098A.332.332 0 011.856 0h7.98c.146 0 .219.18.116.286L8.375 1.902A.323.323 0 018.144 2H.164c-.146 0-.219-.18-.116-.286L1.625.098z"}),(0,t.jsx)("path",{fill:"url(#aqua-sol-g3)",d:"M8.375 3.098A.323.323 0 008.144 3H.164c-.146 0-.219.18-.116.286l1.577 1.616c.06.062.143.098.231.098h7.98c.146 0 .219-.18.116-.286L8.375 3.098z"})]})]})]})}function s(){return(0,t.jsxs)("svg",{viewBox:"0 0 20 20",width:"100%",height:"100%",children:[(0,t.jsx)("rect",{width:"20",height:"20",fill:"#1B1B1B",rx:"5"}),(0,t.jsx)("rect",{width:"20",height:"20",fill:"#6B8AFF33",rx:"5"}),(0,t.jsxs)("svg",{xmlns:"http://www.w3.org/2000/svg",width:"20",height:"20",fill:"none",viewBox:"0 0 24 24",children:[(0,t.jsx)("path",{fill:"#6B8AFF",d:"M11.482 4.29l-4.395 7.226a.597.597 0 00.21.826l4.395 2.574c.19.112.426.112.616 0l4.395-2.574c.289-.17.384-.54.21-.826L12.519 4.29a.608.608 0 00-1.037 0z"}),(0,t.jsx)("path",{fill:"#6B8AFF",d:"M15.79 15.01c0-.011-.002-.021-.003-.031l-.006-.031-.01-.035a.31.31 0 00-.03-.064l-.013-.02a.344.344 0 00-.096-.097l-.02-.012a.298.298 0 00-.039-.02l-.027-.01a.404.404 0 00-.098-.02h-.035l-.026.003-.04.006c-.003 0-.006.003-.01.004a.372.372 0 00-.114.049l-2.892 1.704a.651.651 0 01-.662 0l-2.892-1.704a.373.373 0 00-.114-.05l-.01-.003-.04-.006a1.149 1.149 0 00-.026-.002h-.035l-.032.002-.03.006-.036.01-.027.01a.296.296 0 00-.038.02l-.02.013a.34.34 0 00-.097.096l-.012.02c-.008.014-.015.026-.02.039-.005.008-.007.017-.011.026l-.01.035a.177.177 0 00-.006.03.181.181 0 00-.003.032v.034c0 .01.002.018.003.027l.006.039c0 .005.003.01.004.014.012.043.03.083.057.12l3.188 4.483a.652.652 0 001.062 0l3.188-4.483a.354.354 0 00.057-.12c0-.004.003-.01.004-.014l.006-.039.003-.027v-.034h.002z"})]})]})}function p(){return(0,t.jsxs)("svg",{viewBox:"0 0 20 20",width:"100%",height:"100%",children:[(0,t.jsx)("rect",{width:"20",height:"20",fill:"#0052FF",rx:"5"}),(0,t.jsx)("path",{d:"M9.93 16a6 6 0 100-12 5.98 5.98 0 00-5.95 5.45h7.9v1.1h-7.9A5.98 5.98 0 009.93 16z",fill:"#fff"})]})}function d(){return(0,t.jsx)("img",{src:"/images/robinhood-chain.png",alt:"",width:"20",height:"20",style:{width:"100%",height:"100%",borderRadius:5,objectFit:"cover"}})}let u={solana:l,ethereum:s,base:p,robinhood:d},c={solana:o(l),ethereum:o(s),base:o(p),robinhood:o(d)}},70004:(a,e,i)=>{let t;i.d(e,{K1:()=>l,j5:()=>o});var r=i(37811);let n=new Set(["3umnGARBR2HKc3gvAZVDhWvSYYHqMxVqKBqMV9nVakf4","7jLHjyaE95ER98PJyAWLGTzGadAmBZd2QPBXQtuah5r3",...String(r.env.NEXT_PUBLIC_AQUA_BOT_FEE_POOL_IDS||"").split(/[\s,]+/).map(a=>a.trim()).filter(Boolean)]),o=Number.isFinite(t=Number(r.env.NEXT_PUBLIC_AQUA_BOT_ROUTE_MAX_SHORTFALL_BPS))?Math.max(0,Math.min(500,Math.round(t))):25;function l(a){if(0===n.size)return!1;let e=new WeakSet,i=(a,t)=>"string"==typeof a?n.has(a.trim()):!(!a||"object"!=typeof a||t>10||e.has(a))&&((e.add(a),Array.isArray(a))?a.some(a=>i(a,t+1)):Object.values(a).some(a=>i(a,t+1)));return i(a,0)}}}]);