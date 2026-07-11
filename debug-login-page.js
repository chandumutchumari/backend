const { chromium } = require('playwright');
const fs = require('fs');
const tesseract = require('tesseract.js');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://student.srmap.edu.in/srmapstudentcorner/StudentLoginPage', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  console.log('url:', page.url());
  const selectors = ['#UserName', '#AuthKey', '#ccode', '#divmsg', '#frmSL'];
  for (const selector of selectors) {
    const count = await page.locator(selector).count();
    console.log(selector, 'count:', count);
  }

  const inputs = await page.$$eval('input', (els) =>
    els.map((el) => ({ id: el.id, name: el.name, type: el.type, value: el.value || '' })),
  );
  console.log('inputs:', inputs);

  const form = await page.$('form');
  if (form) {
    console.log('form action:', await form.getAttribute('action'));
    console.log('form method:', await form.getAttribute('method'));
    const fields = await page.$$eval('form input', (els) =>
      els.map((el) => ({ id: el.id, name: el.name, type: el.type, value: el.value || '' })),
    );
    console.log('form inputs:', fields);
  }

  const captchaHandle = await page.locator("img[src*='captchas']").elementHandle();
  console.log('captcha found:', !!captchaHandle);
  if (captchaHandle) {
    const src = await captchaHandle.getAttribute('src');
    console.log('captcha src:', src);
    const buffer = await captchaHandle.screenshot({ type: 'png' });
    fs.writeFileSync('debug-captcha.png', buffer);
    console.log('captcha screenshot saved as debug-captcha.png, size:', buffer.length);

      const worker = await tesseract.createWorker();
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        tessedit_pageseg_mode: '7',
        preserve_interword_spaces: '0',
      });

      const { data } = await worker.recognize(buffer);
      console.log('ocr raw text:', JSON.stringify(data.text));
      console.log('ocr cleaned text:', (data.text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim());
      await worker.terminate();
    }

  await browser.close();
})();
