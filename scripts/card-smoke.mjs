// Run the real renderer against Obsidian's DOM without network requests or vault writes.
// Usage: node scripts/card-smoke.mjs [vault-name]
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';

const result = await build({
  stdin: {
    resolveDir: process.cwd(), loader: 'ts',
    contents: `
import { mountCard } from './src/card.ts';
import { MetadataStore } from './src/store.ts';
import { DEFAULT_SETTINGS } from './src/model.ts';

export async function run() {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const tick = async () => { for (let i=0; i<12; i++) await Promise.resolve(); };
  const url = 'https://example.com/source';
  const metadata = { url, title: 'Resolved title', siteName: 'example.com', fetchedAt: Date.now(), degraded: false };
  const context = { line: {url, label:'Source label', prefix:'', linkText:url, suffix:'', indentLevel:0, list:'none'}, layout:'expanded', marker:'none', editable:false };
  const disposers = [];
  const fixture = createDiv();
  fixture.hidden = true;
  document.body.append(fixture);
  const make = (initial = {}) => {
    let resolve;
    const pending = new Promise(done => { resolve = done; });
    const store = new MetadataStore({ initial, ttlMs:()=>60000, maxEntries:()=>20, fetcher:()=>pending, persist:()=>{} });
    const wrapper = createDiv();
    disposers.push(mountCard(wrapper, context, {store, settings:()=>DEFAULT_SETTINGS}));
    return {wrapper, store, resolve};
  };
  try {
    const detached = make();
    assert(!detached.wrapper.isConnected, 'fixture must start detached');
    assert(detached.wrapper.querySelector('a.glance-card__link')?.href === url, 'pending card must be clickable immediately');
    assert(detached.wrapper.querySelector('.glance-card__title')?.textContent === 'Source label', 'pending card must retain source label');
    assert(!detached.wrapper.querySelector('.is-loading'), 'pending card must not hide link behind skeleton');
    detached.resolve(metadata);
    await tick();
    assert(detached.wrapper.querySelector('.glance-card__title')?.textContent === metadata.title, 'detached completion was dropped');
    fixture.append(detached.wrapper);
    assert(detached.wrapper.querySelector('.glance-card__title')?.textContent === metadata.title, 'attachment must preserve resolved metadata');

    const connected = make();
    fixture.append(connected.wrapper);
    let bodyAtEmission;
    const stopObserving = connected.store.subscribe(url, () => {
      bodyAtEmission = connected.wrapper.querySelector('.glance-card__body');
    });
    connected.resolve(metadata);
    await tick();
    stopObserving();
    assert(bodyAtEmission && connected.wrapper.querySelector('.glance-card__body') === bodyAtEmission,
      'ensure rebuilt the card after the store already delivered the same metadata');

    const disposed = make();
    fixture.append(disposed.wrapper);
    const before = disposed.wrapper.innerHTML;
    disposers.pop()();
    disposed.resolve(metadata);
    await tick();
    assert(disposed.wrapper.innerHTML === before, 'late completion mutated disposed card');

    const cached = make({[url]:metadata});
    const body = cached.wrapper.querySelector('.glance-card__body');
    await tick();
    assert(cached.wrapper.querySelector('.glance-card__body') === body, 'fresh cache must not redraw on ensure');
    return { passed: ['immediate clickable fallback','detached completion and attachment','single render per metadata','disposed late completion','fresh cache without redraw'] };
  } finally { for (const dispose of disposers) dispose(); fixture.remove(); }
}
`,
  },
  bundle: true, write: false, format: 'iife', globalName: 'GlanceCardSmoke',
  // Only icons and HTTP are stubbed; card rendering runs on the real app DOM.
  plugins: [{ name: 'obsidian-test-boundary', setup(build) {
    build.onResolve({filter:/^obsidian$/}, () => ({path:'obsidian',namespace:'test'}));
    build.onLoad({filter:/.*/,namespace:'test'}, () => ({contents:
      'export const setIcon=(el,name)=>{el.dataset.icon=name}; export const requestUrl=()=>{throw Error("Unexpected network request")};'}));
  }}],
});
const code = result.outputFiles[0].text + '\nGlanceCardSmoke.run().then(JSON.stringify)';
const output = execFileSync('obsidian', ['vault=' + (process.argv[2] || 'marioverse.ai'), 'eval', 'code=' + code], {encoding:'utf8'});
process.stdout.write(output);
if (!output.includes('immediate clickable fallback')) process.exitCode = 1;
