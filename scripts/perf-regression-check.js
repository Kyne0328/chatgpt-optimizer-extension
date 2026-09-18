#!/usr/bin/env node
'use strict';

const fs = require('fs');

const content = fs.readFileSync('content.js', 'utf8');
const features = fs.readFileSync('features.js', 'utf8');
const background = fs.readFileSync('background.js', 'utf8');
const popup = fs.readFileSync('popup/app.js', 'utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

check(!content.includes("addEventListener('scroll', navScrollHandler"),
  'Navigator must not reintroduce O(N) scroll polling.');
check(content.includes('new IntersectionObserver'),
  'Navigator must use IntersectionObserver.');
check(content.includes('return toolActive.hideThinking || toolActive.clickToLoadImg;'),
  'Default Navigator must not activate the deep MutationObserver scanner.');
check(!features.includes('navObserver.observe(document.documentElement'),
  'Feature navigator must not observe the whole document.');
check(!features.includes("getElementsByTagName('*').length"),
  'Session health must not count the full DOM on a timer.');
check(content.includes('relai-generation-start') && features.includes('onGenerationStart'),
  'Generation quiet mode must remain wired across content/features layers.');
check(background.includes('PREF_SCHEMA_VERSION = 2'),
  'Persisted performance preference migration must remain present.');
for (const needle of [
  'perfReduceAnim: false',
  'perfOptimizeDom: false',
  'perfFontSwap: false',
  'perfLazyImg: false'
]) {
  check(background.includes(needle), 'Background safe default missing: ' + needle);
}
check(popup.includes('perfOptimizeDom:false') && popup.includes('perfLazyImg:false'),
  'Popup defaults must match safe background defaults.');
check(manifest.commands && manifest.commands['rescue-chat'],
  'Frozen-chat rescue command must remain registered.');

if (failures.length) {
  console.error('Performance regression guard failed:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}

console.log('Performance regression guard passed.');
