#!/usr/bin/env node
'use strict';

const fs = require('fs');

const content = fs.readFileSync('content.js', 'utf8');
const features = fs.readFileSync('features.js', 'utf8');
const background = fs.readFileSync('background.js', 'utf8');
const popup = fs.readFileSync('popup/app.js', 'utf8');
const mainWorldPerf = fs.readFileSync('main-world-performance.js', 'utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

check(!content.includes("addEventListener('scroll', navScrollHandler"),
  'Navigator must not reintroduce O(N) scroll polling.');
check(content.includes('new IntersectionObserver'),
  'Navigator must use IntersectionObserver.');
check(content.includes('const rebuild = !navIntersectionObs') &&
      content.includes('for (let index = navUsers.length; index < nextUsers.length; index += 1)'),
  'Navigator must preserve its observer and add only newly discovered user turns on the stable path.');
check(features.includes('requestIdleCallback') && features.includes("box.dataset.relaiSignature!=='none'"),
  'Post-turn marker enhancement must defer to idle time and skip full-thread scans when there are no markers.');
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
check(background.includes('perfLongChatWindow: false') && popup.includes('perfLongChatWindow:false'),
  'Long Chat Window must remain opt-in outside the Performance preset.');
check(background.includes('registerContentScripts') && background.includes("world: 'MAIN'"),
  'Long Chat Window must install at document_start in the page MAIN world.');
check(mainWorldPerf.includes('Fail open') && mainWorldPerf.includes('response.clone().json()'),
  'Long Chat Window must inspect a clone and return the original response on failure.');
check(manifest.permissions?.includes('scripting'),
  'Dynamic MAIN-world registration requires the scripting permission.');
check(manifest.commands && manifest.commands['rescue-chat'],
  'Frozen-chat rescue command must remain registered.');

if (failures.length) {
  console.error('Performance regression guard failed:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}

console.log('Performance regression guard passed.');
