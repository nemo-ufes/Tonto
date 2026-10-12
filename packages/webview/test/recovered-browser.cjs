const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
// Point this to Playwright when it is provided by a workspace runtime.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const { emptyViewFile } = await import('../../tonto/lib/view/model/index.js');
  const files = path.resolve(__dirname, '../../extension/pack/webview');
  const html = fs.readFileSync(path.join(__dirname, 'recovered-panel.html'), 'utf8');
  const server = http.createServer((req, res) => {
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<html><head><meta charset="UTF-8"><link rel="stylesheet" href="/style.css"></head><body>${html}<script>
      window.messages=[];window.acquireVsCodeApi=()=>({postMessage:m=>messages.push(m),getState:()=>({}),setState:s=>window.state=s});
      window.addEventListener('message', e=>{if(e.data.type==='model')window.lastModel=e.data;});
      </script><script type="module" src="/diagram-editor.js"></script></body></html>`);
    } else {
      const file = path.join(files, req.url);
      if (!fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
      res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'application/javascript');
      res.end(fs.readFileSync(file));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const post = message => page.evaluate(data => window.dispatchEvent(new MessageEvent('message', { data })), message);
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => messages.some(message => message.type === 'ready'));
    const file = emptyViewFile();
    const view = {
      nodes: ['Person', 'Student', 'Hostile <img src=x onerror="window.hacked=true">'].map((name, i) => ({
        id: `Demo::N${i}`, name, kind: 'class', package: 'Demo', stereotype: i === 1 ? 'role' : 'kind', color: '#e0d7ff', attributes: []
      })),
      edges: [{ id: 'Demo::generalization', kind: 'generalization', source: 'Demo::N1', target: 'Demo::N0' }],
      groups: [], gensets: []
    };
    await post({ type: 'model', view, positions: {
      'Demo::N0': { x: 30, y: 30, width: 150, height: 100 },
      'Demo::N1': { x: 280, y: 220, width: 150, height: 100 },
      'Demo::N2': { x: 550, y: 30, width: 420, height: 100 }
    }, routes: {}, display: file.display, content: file.content, layout: file.layout, constraints: file.constraints,
    packages: ['Demo'], filters: view.nodes.map(node => ({ kind: 'class', label: node.name, ids: [node.id] })) });
    await page.locator('[data-node="Demo::N0"]').waitFor();
    assert.equal(await page.locator('#canvas img').count(), 0, 'labels escaped');
    assert.equal(await page.evaluate(() => window.hacked), undefined);
    const rect = await page.locator('[data-node="Demo::N0"]').boundingBox();
    await page.mouse.move(rect.x + 55, rect.y + 40);
    await page.mouse.down();
    await page.mouse.move(rect.x + 105, rect.y + 70, { steps: 6 });
    await page.mouse.up();
    const moved = await page.evaluate(() => messages.filter(m => m.type === 'moved'));
    assert.equal(moved.length, 1, 'drag yields one persisted edit');
    assert(moved[0].positions['Demo::N0'].x > 30);
    await page.locator('#optionsButton').click();
    await page.getByText('Taxonomy only', { exact: true }).click();
    assert(await page.evaluate(() => messages.some(m => m.type === 'display' && m.display.taxonomyOnly === true)));
    await page.getByText('Pin selected', { exact: true }).click();
    assert(await page.evaluate(() => messages.some(m => m.type === 'pin' && m.pinned === true)));
    await page.locator('#fit').click();
    await page.waitForFunction(() => messages.some(m => m.type === 'viewport'));
    await page.locator('#exportButton').click();
    assert(await page.evaluate(() => messages.some(m => m.type === 'export')));
    await post({ type: 'theme', dark: true });
    assert(await page.locator('body').evaluate(body => body.classList.contains('dark')));
    await post({ type: 'select', ids: ['Demo::N1'] });
    assert(await page.locator('[data-node="Demo::N1"]').evaluate(node => node.classList.contains('tv-selected')));
    await page.locator('[data-node="Demo::N1"]').dblclick();
    assert(await page.evaluate(() => messages.some(m => m.type === 'reveal' && m.id === 'Demo::N1')));
    await page.locator('#hide').click();
    assert(await page.evaluate(() => messages.some(m => m.type === 'hide' && m.ids.includes('Demo::N1'))));
    await page.evaluate(() => {const data=structuredClone(lastModel);data.content.hidden=['Demo::N1'];window.dispatchEvent(new MessageEvent('message',{data}));});
    await page.locator('#optionsButton').click();
    await page.locator('#options summary').filter({ hasText: 'Classes' }).click();
    await page.locator('#options').getByText('Student', { exact: true }).click();
    assert(await page.evaluate(() => messages.some(m => m.type === 'show' && m.ids.includes('Demo::N1'))));
    await page.locator('#optionsButton').click();
    await post({ type: 'select', ids: ['Demo::generalization'] });
    const handle = await page.locator('.tv-handle-new').first().boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 45, handle.y + 35, { steps: 5 });
    await page.mouse.up();
    assert(await page.evaluate(() => messages.some(m => m.type === 'rerouted' && m.edge === 'Demo::generalization')));
    const svg = await page.locator('#canvas > svg').evaluate(element => element.outerHTML);
    await post({ type: 'rasterise', id: 7, svg, scale: 1 });
    await page.waitForFunction(() => messages.some(m => m.type === 'raster' && m.id === 7));
    const raster = await page.evaluate(() => messages.find(m => m.type === 'raster' && m.id === 7));
    assert(Buffer.from(raster.data, 'base64').subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
    if (process.env.TONTO_SCREENSHOT) {
      await post({ type: 'theme', dark: false });
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--vscode-editor-background', '#f7f6f2');
        document.documentElement.style.setProperty('--vscode-editorWidget-background', '#eceae5');
        document.documentElement.style.setProperty('--vscode-foreground', '#1f1c17');
        const data=structuredClone(lastModel);data.view.nodes[2].name='University';
        data.filters[2].label='University';data.content.hidden=[];
        window.dispatchEvent(new MessageEvent('message',{data}));
      });
      await post({ type: 'select', ids: ['Demo::N1'] });
      await page.locator('#optionsButton').click();
      await page.screenshot({ path: process.env.TONTO_SCREENSHOT });
      fs.copyFileSync(process.env.TONTO_SCREENSHOT, path.resolve(__dirname, '../../extension/data/images/svg-view.png'));
    }
    assert.deepEqual(errors, []);
    console.log('PASS: recovered native interface, escaped labels, drag, options, pin, fit, theme, selection and PNG.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
