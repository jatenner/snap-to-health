const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  // Make sure the output directory exists
  const outputDir = path.join(__dirname, 'test-images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  // Launch the browser
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Set viewport size
  await page.setViewport({ width: 800, height: 600 });
  
  // Navigate to the HTML file
  await page.goto(`file:${path.join(__dirname, 'test-image.html')}`);
  
  // Wait for the content to load
  await page.waitForSelector('.receipt', { timeout: 5000 });
  
  // Take a screenshot
  const outputPath = path.join(outputDir, 'ocr-test-image.png');
  await page.screenshot({ path: outputPath });
  
  console.log(`Screenshot saved to: ${outputPath}`);
  
  await browser.close();
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
}); 