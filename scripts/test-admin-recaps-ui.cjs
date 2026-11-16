'use strict';
// Regression tests for the photo-picker syntax error and its surrounding behavior.
// Run: node scripts/test-admin-recaps-ui.cjs
// Uses an in-memory Page/wx simulation; never connects to WeChat or writes live data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'miniprogram/pages/admin-recaps/index.js');
const source = fs.readFileSync(filename, 'utf8');
const compiled = new vm.Script(source, { filename });
const plain = value => JSON.parse(JSON.stringify(value));
function setup(options = {}) {
  let page, picker;
  const calls = { picker: 0, images: [], uploads: [], functions: [], toasts: [] };
  const wx = {
    chooseMedia(config) { calls.picker++; picker = config; },
    getImageInfo(config) {
      calls.images.push(config.src);
      if (options.imageInfo) return options.imageInfo(config);
      config.success({ type: options.types && options.types[config.src] || 'png' });
    },
    cloud: {
      uploadFile(config) {
        calls.uploads.push(config);
        if (options.uploadError) return Promise.reject(Error(options.uploadError));
        return Promise.resolve({ fileID: 'cloud://test/' + config.cloudPath });
      },
      callFunction(config) {
        calls.functions.push(config);
        if (config.data.action === 'manage') {
          return Promise.resolve({ result: { activities: [], uploadDir: 'activity-recaps/test/' } });
        }
        if (options.saveError) return Promise.reject(Error(options.saveError));
        return Promise.resolve({ result: { id: config.data.id } });
      }
    },
    showToast(config) { calls.toasts.push(config); },
    showModal() { throw Error('Unexpected modal in photo-picker tests'); }
  };
  compiled.runInNewContext({ Page(definition) { page = definition; }, wx, console });
  page.data = plain(page.data);
  page.setData = function(patch) { Object.assign(this.data, patch); };
  return { page, calls, choose(files) { page.choosePhotos(); picker.success({ tempFiles: files }); },
    get picker() { return picker; } };
}
const tick = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };
const file = (name, size = 1024) => ({ tempFilePath: name, size });
function ready(page) {
  Object.assign(page.data, { selected: { id: 'event-test', canPublish: true, revision: 2 },
    title: ' 测试回顾 ', body: ' 仅用于本地模拟 ', photos: [{ path: 'test.png', ext: 'png' }],
    uploadDir: 'activity-recaps/test/', completed: true, consent: true, isTest: true });
}
let passed = 0;
async function test(name, run) { await run(); passed++; console.log('PASS ' + name); }
(async () => {
  await test('complete page parses and registers expected handlers', async () => {
    const {page} = setup();
    for (const name of ['load', 'choosePhotos', 'save', 'hide']) assert.equal(typeof page[name], 'function');
  });
  await test('JPG, PNG and WebP selection succeeds; JPEG is normalized', async () => {
    const x = setup({ types: { a: 'JPEG', b: 'png', c: 'webp' } });
    x.choose([file('a'), file('b'), file('c')]); await tick();
    assert.equal(x.picker.count, 3);
    assert.deepEqual(plain(x.page.data.photos), [
      { path: 'a', ext: 'jpg' }, { path: 'b', ext: 'png' }, { path: 'c', ext: 'webp' }
    ]);
    assert.equal(x.page.data.error, '');
    assert.equal(x.calls.uploads.length, 0);
  });
  await test('asynchronous image inspection preserves selected order', async () => {
    const checks = [];
    const x = setup({ imageInfo: q => checks.push(q) });
    x.choose([file('first'), file('second')]);
    checks[1].success({ type: 'webp' }); checks[0].success({ type: 'png' }); await tick();
    assert.deepEqual(plain(x.page.data.photos).map(p => p.path), ['first', 'second']);
  });
  await test('images above 5MB are rejected without uploading', async () => {
    const x = setup(); x.choose([file('large', 5 * 1024 * 1024 + 1)]); await tick();
    assert(x.page.data.error.includes('5MB')); assert.equal(x.calls.images.length, 0);
    assert.equal(x.calls.uploads.length, 0);
  });
  await test('an image at the 5MB boundary is accepted', async () => {
    const x = setup(); x.choose([file('boundary', 5 * 1024 * 1024)]); await tick();
    assert.equal(x.page.data.photos.length, 1);
  });
  await test('missing file path is rejected', async () => {
    const x = setup(); x.choose([{ size: 100 }]); await tick();
    assert(x.page.data.error); assert.equal(x.calls.images.length, 0);
  });
  await test('unsupported format does not partially replace existing photos', async () => {
    const x = setup({ types: { bad: 'gif' } });
    const old = [{ path: 'existing', ext: 'png' }]; x.page.data.photos = old;
    x.choose([file('valid'), file('bad')]); await tick();
    assert.deepEqual(x.page.data.photos, old); assert(x.page.data.error.includes('JPG'));
  });
  await test('image inspection failure is handled', async () => {
    const x = setup({ imageInfo: q => q.fail({ errMsg: 'unreadable' }) });
    x.choose([file('bad')]); await tick();
    assert(x.page.data.error); assert.equal(x.page.data.photos.length, 0);
  });
  await test('empty selection preserves current photos', async () => {
    const x = setup(); x.page.data.photos = [{ path: 'old', ext: 'png' }];
    x.choose([]); await tick(); assert.equal(x.page.data.photos[0].path, 'old');
  });
  await test('cancelling selection is not shown as a permission error', async () => {
    const x = setup(); x.page.choosePhotos(); x.picker.fail({ errMsg: 'chooseMedia:fail cancel' });
    assert.equal(x.page.data.error, '');
  });
  await test('picker failure shows an actionable message', async () => {
    const x = setup(); x.page.choosePhotos(); x.picker.fail({ errMsg: 'chooseMedia:fail denied' });
    assert(x.page.data.error.includes('相册权限'));
  });
  await test('busy form cannot open another photo picker', async () => {
    const x = setup(); x.page.data.busy = true; x.page.choosePhotos(); assert.equal(x.calls.picker, 0);
  });
  await test('publishing still requires completion and photo consent', async () => {
    const x = setup(); ready(x.page); x.page.data.consent = false; x.page.save(); await tick();
    assert.equal(x.calls.uploads.length, 0); assert.equal(x.calls.functions.length, 0);
    assert(x.page.data.error.includes('必要同意'));
  });
  await test('saving preserves revision and test flags, then releases busy state', async () => {
    const x = setup(); ready(x.page); x.page.save(); assert.equal(x.page.data.busy, true); await tick();
    const saved = x.calls.functions.find(q => q.data.action === 'save');
    assert.equal(saved.data.expectedRevision, 2); assert.equal(saved.data.isTest, true);
    assert.equal(saved.data.photoFileIDs.length, 1); assert.equal(saved.data.title, '测试回顾');
    assert.equal(x.page.data.busy, false); assert.equal(x.page.data.photos.length, 0);
  });
  await test('failed upload never publishes and preserves retry photos', async () => {
    const x = setup({ uploadError: 'offline' }); ready(x.page); x.page.save(); await tick();
    assert.equal(x.calls.functions.length, 0); assert.equal(x.page.data.busy, false);
    assert.equal(x.page.data.photos.length, 1); assert(x.page.data.error);
  });
  await test('stale revision response remains visible and retryable', async () => {
    const x = setup({ saveError: 'RECAP_CHANGED_REFRESH' }); ready(x.page); x.page.save(); await tick();
    assert(x.page.data.error.includes('其他管理员')); assert.equal(x.page.data.busy, false);
    assert.equal(x.page.data.photos.length, 1);
  });
  console.log('TOTAL ' + passed + ' passed. Mock Page/wx only; no live cloud access.');
})().catch(error => { console.error(error); process.exitCode = 1; });
