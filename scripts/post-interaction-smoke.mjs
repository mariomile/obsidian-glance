// Real card/editor DOM, fixture metadata, no network requests or vault writes.
// Usage: node scripts/post-interaction-smoke.mjs [vault-name]
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';

const result = await build({
  stdin: {
    resolveDir: process.cwd(), loader: 'ts',
    contents: `
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editorLivePreviewField } from 'obsidian';
import { mountCard } from './src/card.ts';
import { glanceEditorExtension } from './src/editor.ts';
import { parseGlanceLine } from './src/link-source.ts';
import { DEFAULT_SETTINGS } from './src/model.ts';

export async function run() {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const passed = [];
  const url = 'https://x.com/fixture/status/123';
  const post = { url, title:'Fixture (@fixture)', siteName:'x.com', fetchedAt:Date.now(), degraded:false,
    post:{authorName:'Fixture', handle:'fixture', text:'A post to organise in the editor.', createdAt:0, media:[]} };
  let cached = post;
  let deliver;
  let refreshes = 0;
  const host = {
    settings:()=>DEFAULT_SETTINGS,
    store:{get:()=>cached, ensure:async()=>cached??new Promise(()=>{}), subscribe:(_url, update)=>{deliver=update; return ()=>{};},
      refresh:async()=>{refreshes++; return cached;}}
  };
  const fixture = createDiv();
  fixture.style.cssText = 'position:fixed;inset:100px auto auto 100px;width:500px;height:500px;z-index:99999;background:var(--background-primary)';
  document.body.append(fixture);
  const disposers = [];
  const mount = (layout, editable=true) => {
    const wrapper = createDiv();
    let selections = 0;
    disposers.push(mountCard(wrapper, {line:parseGlanceLine(url),layout,editable,
      onSelect:editable?()=>{selections++;}:undefined}, host));
    fixture.append(wrapper);
    return {wrapper, selected:()=>selections};
  };
  let view;
  try {
    for (const layout of ['expanded', 'compact', 'embed']) {
      const card = mount(layout);
      assert(!card.wrapper.querySelector('.glance-card__link'), layout+': post surface must not be an external link');
      const open = card.wrapper.querySelector('a.glance-card__action--open');
      assert(open?.href===url && open.target==='_blank' && open.rel.includes('noopener'), layout+': missing explicit external link');
      assert(open.getAttribute('aria-label')==='Open on X', layout+': external icon needs an accessible label');
      if (matchMedia('(hover: none)').matches) {
        assert(getComputedStyle(open.closest('.glance-card__actions')).opacity==='1', layout+': X action must be visible without hover');
      }
      let navigated = false;
      open.addEventListener('click', event=>{navigated=!event.defaultPrevented; event.preventDefault();});
      open.click();
      assert(navigated && card.selected()===0, layout+': opening X must not select the editor line');
      card.wrapper.querySelector('.glance-card__body').click();
      assert(card.selected()===1, layout+': tapping the post must select its editor line');
      card.wrapper.querySelector('.glance-card__action--refresh').click();
      assert(card.selected()===1, layout+': action click must not select the line');
      passed.push(layout+' X card: select vs. open');
    }
    assert(refreshes===3, 'refresh action stopped working');
    if (matchMedia('(hover: none)').matches) passed.push('touch actions visible at '+innerWidth+'px');

    cached = undefined;
    const pending = mount('expanded');
    assert(!pending.wrapper.querySelector('.glance-card__link'), 'uncached X fallback must not navigate');
    pending.wrapper.querySelector('.glance-card__body').click();
    cached = post;
    deliver(post);
    pending.wrapper.querySelector('.glance-post__text').click();
    assert(pending.selected()===2, 'metadata completion lost post selection');
    passed.push('uncached fallback and metadata completion');

    const reading = mount('expanded', false);
    reading.wrapper.querySelector('.glance-post__text').click();
    assert(reading.selected()===0 && !reading.wrapper.querySelector('.glance-card__link'), 'reading post body must stay inert');
    assert(reading.wrapper.querySelector('a.glance-card__action--open'), 'reading mode needs the explicit X link');
    passed.push('reading mode explicit X link');

    const other = createDiv();
    disposers.push(mountCard(other, {line:parseGlanceLine('https://example.com'),layout:'expanded',editable:false},
      {...host,store:{...host.store,get:()=>undefined,ensure:async()=>new Promise(()=>{})}}));
    assert(other.querySelector('a.glance-card__link')?.href==='https://example.com/', 'ordinary web card navigation changed');
    passed.push('ordinary web card navigation');

    for (const source of [url, '![]('+url+')', '- '+url, '  - [ ] ![]('+url+')', '1. '+url]) {
      const parent = createDiv();
      fixture.replaceChildren(parent);
      view = new EditorView({parent,state:EditorState.create({doc:'Before\\n'+source+'\\nAfter',
        extensions:[editorLivePreviewField,glanceEditorExtension(host)]})});
      const original = view.state.doc.toString();
      // Move the widget before clicking: selection must resolve its current position.
      view.dispatch({changes:{from:0,insert:'Inserted\\n'}});
      const text = parent.querySelector('.glance-post__text, .glance-card__title');
      assert(text, 'missing editor card: '+source);
      text.click();
      const target = view.state.doc.line(3);
      assert(view.state.selection.main.head===target.from+parseGlanceLine(source).prefix.length,
        'click selected a stale/wrong source position: '+source);
      assert(document.activeElement===view.contentDOM, 'tap did not focus the editor: '+source+' active='+document.activeElement?.className);
      assert(view.state.doc.toString()==='Inserted\\n'+original, 'selection changed Markdown: '+source);
      assert(!parent.querySelector('.glance-editor-card'), 'selected card did not reveal editable Markdown: '+source);
      view.destroy(); view=undefined;
    }
    passed.push('editor focus and mapped selection: URL, embed, bullet, task, ordered item');
    return {passed};
  } finally { view?.destroy(); for(const dispose of disposers) dispose(); fixture.remove(); }
}
`,
  },
  bundle: true, write: false, format: 'iife', globalName: 'GlancePostSmoke',
  plugins: [{name:'obsidian-test-boundary',setup(build) {
    build.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'test'}));
    build.onLoad({filter:/.*/,namespace:'test'},()=>({resolveDir:process.cwd(),contents:
      `import {StateField} from '@codemirror/state';
       export const editorLivePreviewField=StateField.define({create:()=>true,update:value=>value});
       export const setIcon=(el,name)=>{el.dataset.icon=name};
       export const requestUrl=()=>{throw Error('Unexpected network request')};`}));
  }}],
});
const output = execFileSync('obsidian', ['vault='+(process.argv[2]||'marioverse.ai'),'eval',
  'code='+result.outputFiles[0].text+'\nGlancePostSmoke.run().then(JSON.stringify)'], {encoding:'utf8'});
process.stdout.write(output);
if (!output.includes('editor focus and mapped selection')) process.exitCode=1;
