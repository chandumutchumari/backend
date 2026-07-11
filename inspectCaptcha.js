const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  try {
    await page.goto('https://student.srmap.edu.in/srmapstudentcorner/StudentLoginPage', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    console.log('loaded', page.url());
    const pageContent = await page.content();
    console.log('content length', pageContent.length);
    console.log('contains ccode', pageContent.includes('ccode'));
    console.log('contains captcha', pageContent.toLowerCase().includes('captc'));
    const captchaElement = await page.locator("img[src*='captchas']").elementHandle();
    console.log('captchaElement found', !!captchaElement);
    if (captchaElement) {
      const src = await captchaElement.getAttribute('src');
      console.log('captcha src', src);
      const screenshot = await captchaElement.screenshot({ type: 'png' });
      fs.writeFileSync('captcha.png', screenshot);
      console.log('wrote captcha.png', screenshot.length);
    }
    const scriptTags = await page.evaluate(() => Array.from(document.querySelectorAll('script')).map(s => ({ src: s.src, content: s.innerText.slice(0, 200) })));
    console.log('script tags count', scriptTags.length);
    const inlineContains = scriptTags.filter(s => s.content.toLowerCase().includes('ccode') || s.content.toLowerCase().includes('captcha')).length;
    console.log('inline script count containing captcha/ccode', inlineContains);
  } catch (err) {
    console.error('error', err.stack || err.message);
  } finally {
    await browser.close();
  }
})();
