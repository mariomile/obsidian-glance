import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * mv-kit style contract (obsidian-cosmos-theme/docs/mv-kit.md).
 *
 * Encodes only the state landed by the 2026-07 mv-kit audit wave (wave 6,
 * Glance) — not aspirational rules the audit didn't actually fix. See
 * docs/2026-07-mv-kit-audit.md for the full per-rule verdict.
 *
 * Ported from obsidian-sonar's src/style-contract.test.ts (vitest, commit
 * 3acb417 + af28344) to node:test, matching this repo's existing test
 * convention (`node --experimental-strip-types --test src/*.test.ts`, see
 * package.json). All four sonar assertions are ported, including both
 * comment-integrity checks (assertions 3 and 4 below) — those two guard
 * against the real Sonar regression documented in mv-kit.md's "MUST NOT"
 * block: a comment written as the "--cosmos-" token glob immediately
 * followed by a slash closes the CSS comment early, and the browser
 * silently drops the entire enclosing rule. (Writing that exact character
 * pair in prose here would trip the same trap in this very file's own JS
 * comment — hence spelling it out instead of pasting it literally.)
 */

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

/** Strip comments so `/* 120ms *\/`-style prose in doc comments doesn't
 * trip the raw-value scan below. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

test('no CSS comment terminates early (token glob followed by a slash)', () => {
  // Regression guard for a real outage (obsidian-sonar, 2026-07-24): a
  // comment written as `--cosmos-*` immediately followed by a slash
  // terminates the comment early. Everything after it parses as garbage and
  // the browser DROPS the enclosing rule — which silently cost Sonar's
  // `.sonar-modal` its `width: 880px`, collapsing the modal to Obsidian's
  // 560px default. Invisible to eslint/tsc/node:test and to the raw-value
  // scan below, so it gets its own assertion.
  const offenders = css
    .split('\n')
    .map((line, idx) => ({ line: line.trim(), n: idx + 1 }))
    .filter(({ line }) => /--[\w-]*\*\//.test(line));

  assert.deepEqual(offenders, []);
});

test('stripping comments leaves no orphaned prose (structural parse check)', () => {
  // If a comment closed early, its remaining lines survive the strip as
  // stray ` * ...` prose sitting in declaration position.
  const orphans = stripComments(css)
    .split('\n')
    .map((line, idx) => ({ line: line.trim(), n: idx + 1 }))
    .filter(({ line }) => /^\*\s|^\*$/.test(line));

  assert.deepEqual(orphans, []);
});

test('raw ms/hex/cubic-bezier values appear only as var() fallbacks', () => {
  const code = stripComments(css);
  const lines = code.split('\n');

  // A raw ms/hex/cubic-bezier is allowed ONLY when it sits inside a
  // `var(--cosmos-*, <fallback>)` or `var(--mv-*, <fallback>)` expression —
  // i.e. the line contains `var(--cosmos-` or `var(--mv-` before the raw
  // value. This is a line-level heuristic (matches the audit procedure in
  // mv-kit.md §"Audit procedure": grep for raw values outside a var()
  // fallback), not a full CSS parse.
  const rawMsPattern = /\b\d+ms\b/g;
  const rawHexPattern = /#[0-9a-fA-F]{3,8}\b/g;
  const rawCubicBezierPattern = /cubic-bezier\([^)]*\)/g;

  // The two `infinite`-loop loading indicators (glance-spin on the refresh
  // button, glance-shimmer on the skeleton) route through --cosmos-t-spin /
  // --cosmos-t-shimmer — forward token proposals in the suite's own
  // namespace, per docs/2026-07-mv-kit-audit.md §3, since none of the kit's
  // four --cosmos-t-* tiers (fast/base/slow/panel, all finite, one-shot
  // durations) models a continuous rotation/shimmer period. No allowlist
  // needed: their raw fallback values (700ms, 1.4s) already live inside a
  // var() expression like every other consumed token in this file.

  const violations: string[] = [];

  lines.forEach((line, idx) => {
    // A raw value is allowed when it sits as the fallback inside ANY
    // var(--token, <fallback>) expression (native Obsidian tokens like
    // --shadow-s included) — the contract's requirement is "never a bare
    // value", not "only --cosmos-*/--mv-* tokens may have fallbacks".
    const hasVarFallback = /var\(\s*--[\w-]+\s*,/.test(line);

    for (const pattern of [rawMsPattern, rawHexPattern, rawCubicBezierPattern]) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        if (!hasVarFallback) {
          violations.push(`line ${idx + 1}: "${match[0]}" in "${line.trim()}"`);
        }
      }
    }
  });

  assert.deepEqual(violations, []);
});

test('caps !important declarations at the post-mv-kit-audit count (ratchet down only)', () => {
  const importantCount = (css.match(/!important;/g) ?? []).length;
  // Ceiling set exactly at the post-fix count landed by the mv-kit audit
  // (2026-07, wave 6): Glance had zero !important declarations before this
  // wave and the fixes added none — the strongest possible contract. Any
  // future edit that adds an !important fails this test; the ceiling can
  // only ratchet down from here, and it is already at its floor.
  assert.ok(
    importantCount <= 0,
    `!important count ${importantCount} exceeds the frozen ceiling of 0`,
  );
});

// --- mv-kit §6 "Elevation & motion depth" (wave 2026-07 dinamica) ---------
//
// Two concrete violations found and fixed this wave, both guarded below:
// (1) .glance-card's hover reveal (the card wash itself, and the refresh/
//     copy icon-button opacity reveal it triggers) was a bare :hover rule,
//     ungated — the card is inline document content, directly tappable on
//     phone, so a bare :hover leaves a stuck wash/opacity-1 state on tap
//     (touch has no pointer-leave to clear it). (2) the icon-button opacity
//     reveal transition was wired to --mv-lift (the physical-transform
//     easing) instead of --mv-wash — an opacity reveal is a colour/opacity
//     wash in mv-kit §6's own vocabulary, not a transform lift, matching
//     the precedent obsidian-portal set for the identical pattern
//     (.portal-section-action's opacity reveal, commit 389d564).

test('§6: every bare :hover rule is gated inside @media (hover: hover)', () => {
  // Brace-depth scan over stripped comments: walk the file tracking @media
  // block nesting, and flag any `:hover` selector that opens at a depth
  // where the innermost enclosing @media isn't a (hover: hover) block.
  const code = stripComments(css);
  const lines = code.split('\n');

  type MediaFrame = { isHoverGate: boolean };
  const mediaStack: MediaFrame[] = [];
  const offenders: string[] = [];

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();

    // Selector line containing :hover, not itself an @media line.
    if (/:hover/.test(line) && !/^@media/.test(line)) {
      const insideHoverGate = mediaStack.some((frame) => frame.isHoverGate);
      if (!insideHoverGate) {
        offenders.push(`line ${idx + 1}: "${line}"`);
      }
    }

    // Track @media nesting via brace balance on this line (mv-kit's
    // stylesheets never nest an @media inside a selector block before its
    // own opening brace, so a per-line open/close count is sufficient).
    const opens = (line.match(/{/g) ?? []).length;
    const closes = (line.match(/}/g) ?? []).length;

    if (/^@media\s*\(hover:\s*hover\)/.test(line)) {
      mediaStack.push({ isHoverGate: true });
    } else if (/^@media/.test(line) && opens > 0) {
      mediaStack.push({ isHoverGate: false });
    }

    for (let i = 0; i < closes; i++) {
      if (mediaStack.length > 0) mediaStack.pop();
    }
  });

  assert.deepEqual(offenders, []);
});

test('§6: opacity/colour reveal transitions ease with --mv-wash, never --mv-lift', () => {
  // mv-kit §6: "colour washes ease with --mv-wash; physical lifts
  // (transform) ease with --mv-lift — the two easings are not
  // interchangeable". An `opacity` reveal-on-hover is a wash in the kit's
  // own vocabulary (see obsidian-portal's --portal-wash-motion split,
  // commit 389d564), not a transform lift — so no `transition: opacity …`
  // declaration in this file may reference --mv-lift.
  const code = stripComments(css);
  const lines = code.split('\n');

  const offenders = lines
    .map((line, idx) => ({ line: line.trim(), n: idx + 1 }))
    .filter(({ line }) => /transition:\s*opacity\b/.test(line) && /--mv-lift/.test(line));

  assert.deepEqual(offenders, []);
});

test('§6: .glance-card hover has both a colour wash and a --mv-lift transform lift', () => {
  // mv-kit §6 "Hover richness": "a hover state is colour AND a subtle
  // physical lift, never colour alone." The kit's own worked example draws
  // the line on surface type, not document position: `.row:hover` (plain
  // text row) stays colour-only, `.card:hover` (a bordered/rounded card
  // widget) gets colour+lift. `.glance-card` is a `-card`-styled surface
  // (border-radius, min-height, media/title/description/footer layout) —
  // the same shape obsidian-tabx's `.tabx-card:hover` is (commit cc65cd4
  // added its lift for exactly this reason), not a plain row like
  // `.tabx-tab`/`.sonar-result`. So its hover rule must declare a
  // `transform: translateY(...)` eased with --mv-lift, alongside the
  // existing colour wash eased with --mv-wash — both inside the same
  // @media (hover: hover) gate the wash already lives in.
  const code = stripComments(css);

  const hoverGateMatch = code.match(
    /@media\s*\(hover:\s*hover\)\s*\{\s*\.glance-card:hover\s*\{([^}]*)\}/,
  );

  assert.ok(hoverGateMatch, 'expected to find .glance-card:hover inside @media (hover: hover)');
  const ruleBody = hoverGateMatch?.[1] ?? '';

  assert.match(
    ruleBody,
    /transform:\s*translateY\(-([01](?:\.\d+)?)px\)/,
    'expected a translateY transform lift on .glance-card:hover',
  );

  const liftMatch = ruleBody.match(/transform:\s*translateY\(-(\d+(?:\.\d+)?)px\)/);
  const liftPx = liftMatch ? Number(liftMatch[1]) : NaN;
  assert.ok(liftPx > 0 && liftPx <= 2, `expected lift between 0 and 2px, got ${liftPx}`);

  assert.match(
    code,
    /\.glance-card\s*\{[^}]*transition:[^}]*transform\s+var\(--cosmos-t-fast,\s*140ms\)\s*var\(--mv-lift,/,
    'expected .glance-card base rule to carry a transform transition eased with --mv-lift',
  );
});
