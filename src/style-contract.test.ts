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
