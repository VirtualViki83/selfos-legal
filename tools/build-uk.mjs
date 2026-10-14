// Builds /uk/index.html - the Ukrainian landing page - from /index.html.
//
// Why a second file exists at all (05.10.2026): the UA switch used to swap
// the texts with JavaScript on the SAME address, so a search engine only ever
// saw the English page - there was no Ukrainian page to index. Now there are
// two real pages, "/" and "/uk/", linked with hreflang.
//
// index.html stays the ONLY file edited by hand: the markup, the styles and
// the Ukrainian strings (the `uk` dictionary in its script) all live there.
// After ANY change to index.html run:
//
//     node tools/build-uk.mjs
//
// and commit the regenerated uk/index.html together with it.
// (jsdom is borrowed from the app repo next door - this repo has no packages.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, '..', 'self-os-ios', 'package.json'));
const { JSDOM } = require('jsdom');

const SITE = 'https://selfosapp.com';
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// --- the Ukrainian strings: the `var uk = { ... };` literal in index.html
const dictMatch = source.match(/var uk = (\{[\s\S]*?\n {2}\});/);
if (!dictMatch) throw new Error('uk dictionary not found in index.html');
const uk = new Function(`return ${dictMatch[1]}`)();

// --- head texts that have no data-i18n node
const HEAD = {
  title: 'SelfOS - трекер турботи про себе і щоденний планер для iPhone та Android',
  description:
    'SelfOS - трекер турботи про себе і щоденний планер для iOS та Android: звички, цілі, вода, сон, ' +
    'харчування й активність в одному спокійному застосунку. І бонсай, який росте від щоденної турботи про себе.',
  ogTitle: `SelfOS - ${uk['hero.h1']}`,
  ogDescription: uk['hero.lead'],
};

const dom = new JSDOM(source);
const doc = dom.window.document;
const need = (el, what) => { if (!el) throw new Error(`index.html changed: ${what} not found`); return el; };

doc.documentElement.lang = 'uk';

// --- body texts
let missing = 0;
doc.querySelectorAll('[data-i18n]').forEach((node) => {
  const value = uk[node.getAttribute('data-i18n')];
  if (value === undefined) { missing++; console.warn('no Ukrainian text for', node.getAttribute('data-i18n')); return; }
  node.innerHTML = value;
});

// --- head
need(doc.querySelector('title'), '<title>').textContent = HEAD.title;
need(doc.querySelector('meta[name="description"]'), 'meta description').setAttribute('content', HEAD.description);
need(doc.querySelector('link[rel="canonical"]'), 'canonical').setAttribute('href', `${SITE}/uk/`);
need(doc.querySelector('meta[property="og:title"]'), 'og:title').setAttribute('content', HEAD.ogTitle);
need(doc.querySelector('meta[property="og:description"]'), 'og:description').setAttribute('content', HEAD.ogDescription);
need(doc.querySelector('meta[property="og:url"]'), 'og:url').setAttribute('content', `${SITE}/uk/`);
const ogLocale = doc.createElement('meta');
ogLocale.setAttribute('property', 'og:locale');
ogLocale.setAttribute('content', 'uk_UA');
doc.querySelector('meta[property="og:url"]').after(ogLocale);

// --- structured data
const ld = [...doc.querySelectorAll('script[type="application/ld+json"]')];
const appLd = need(ld.find((s) => s.textContent.includes('SoftwareApplication')), 'app JSON-LD');
const app = JSON.parse(appLd.textContent);
app.url = `${SITE}/uk/`;
app.description = HEAD.description;
delete app.featureList; // English-only list; the description carries it
appLd.textContent = `\n${JSON.stringify(app, null, 2)}\n`;
const faqLd = need(ld.find((s) => s.textContent.includes('FAQPage')), 'FAQ JSON-LD');
const plain = (html) => { const d = doc.createElement('div'); d.innerHTML = html; return d.textContent.trim(); };
const faq = [];
for (let i = 1; uk[`faq.${i}q`] !== undefined; i++) {
  faq.push({
    '@type': 'Question',
    name: plain(uk[`faq.${i}q`]),
    acceptedAnswer: { '@type': 'Answer', text: plain(uk[`faq.${i}a`]) },
  });
}
faqLd.textContent = `\n${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq }, null, 2)}\n`;

// --- this page lives one folder down: make every local path absolute
const LOCAL = /^(assets\/|privacy-policy\.html|terms-of-use\.html|data-deletion\.html|legal\.html)/;
for (const attr of ['src', 'href', 'poster']) {
  doc.querySelectorAll(`[${attr}]`).forEach((el) => {
    const value = el.getAttribute(attr);
    if (LOCAL.test(value)) el.setAttribute(attr, `/${value}`);
  });
}

// --- language switch shows UA as the current page
doc.querySelectorAll('.lang [data-lang]').forEach((b) => b.classList.toggle('on', b.getAttribute('data-lang') === 'uk'));

let html = dom.serialize();
// the dictionary itself is dead weight on the generated page
const before = html.length;
html = html.replace(/var uk = \{[\s\S]*?\n {2}\};/, 'var uk = null; // texts are already in the markup (tools/build-uk.mjs)');
if (html.length === before) throw new Error('could not strip the uk dictionary from the output');
if (/(src|href|poster)="assets\//.test(html)) throw new Error('a relative assets/ path survived');

fs.mkdirSync(path.join(root, 'uk'), { recursive: true });
fs.writeFileSync(path.join(root, 'uk', 'index.html'), html);
console.log(`uk/index.html written: ${html.length} bytes, ${Object.keys(uk).length} strings, ${faq.length} FAQ items, ${missing} untranslated nodes`);
