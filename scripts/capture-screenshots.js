#!/usr/bin/env node

/**
 * Automated screenshot capture utility using Puppeteer
 * 
 * This script allows taking screenshots of:
 * - Local HTML files
 * - Remote URLs
 * - Multiple sources in batch mode
 * 
 * Usage:
 *   node capture-screenshots.js [options]
 * 
 * Options:
 *   --source=<file.html or URL>  File path or URL to capture (can specify multiple)
 *   --output=<directory>         Output directory for screenshots (default: ./screenshots)
 *   --width=<pixels>             Viewport width (default: 800)
 *   --height=<pixels>            Viewport height (default: 600)
 *   --fullPage=<true|false>      Capture full page height (default: false)
 *   --delay=<ms>                 Wait time before capture in ms (default: 500)
 *   --device=<deviceName>        Use a device preset (e.g., iPhone X, iPad)
 *   --format=<png|jpeg>          Image format (default: png)
 *   --quality=<0-100>            Image quality for JPEG (default: 80)
 * 
 * Examples:
 *   node capture-screenshots.js --source=test-image.html
 *   node capture-screenshots.js --source=https://example.com --width=1200 --height=800
 *   node capture-screenshots.js --source=test1.html --source=test2.html --output=test-images
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const url = require('url');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  sources: [],
  outputDir: './screenshots',
  width: 800,
  height: 600,
  fullPage: false,
  delay: 500,
  device: null,
  format: 'png',
  quality: 80
};

// Parse arguments
args.forEach(arg => {
  if (arg.startsWith('--source=')) {
    options.sources.push(arg.split('=')[1]);
  } else if (arg.startsWith('--output=')) {
    options.outputDir = arg.split('=')[1];
  } else if (arg.startsWith('--width=')) {
    options.width = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--height=')) {
    options.height = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--fullPage=')) {
    options.fullPage = arg.split('=')[1].toLowerCase() === 'true';
  } else if (arg.startsWith('--delay=')) {
    options.delay = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--device=')) {
    options.device = arg.split('=')[1];
  } else if (arg.startsWith('--format=')) {
    options.format = arg.split('=')[1].toLowerCase();
  } else if (arg.startsWith('--quality=')) {
    options.quality = parseInt(arg.split('=')[1], 10);
  }
});

// Add default source if none provided
if (options.sources.length === 0) {
  options.sources.push('test-image.html');
}

// Function to determine if a source is a URL
function isUrl(source) {
  try {
    new URL(source);
    return true;
  } catch (err) {
    return false;
  }
}

// Function to generate a filename from a source
function generateFilename(source, format) {
  if (isUrl(source)) {
    const parsedUrl = new URL(source);
    return `${parsedUrl.hostname}${parsedUrl.pathname.replace(/\//g, '-')}`.replace(/[^a-z0-9-]/gi, '') + `.${format}`;
  } else {
    return path.basename(source, path.extname(source)) + `.${format}`;
  }
}

// Main function
async function captureScreenshots() {
  // Make sure the output directory exists
  if (!fs.existsSync(options.outputDir)) {
    fs.mkdirSync(options.outputDir, { recursive: true });
  }

  // Launch the browser
  const browser = await puppeteer.launch();
  console.log(`🚀 Browser launched`);

  try {
    for (const source of options.sources) {
      const page = await browser.newPage();
      
      // Set device emulation if specified
      if (options.device) {
        const device = puppeteer.devices[options.device];
        if (device) {
          await page.emulate(device);
          console.log(`📱 Emulating device: ${options.device}`);
        } else {
          console.warn(`⚠️ Device "${options.device}" not found. Using custom viewport.`);
          await page.setViewport({ width: options.width, height: options.height });
        }
      } else {
        // Set viewport size
        await page.setViewport({ width: options.width, height: options.height });
      }
      
      // Navigate to the source
      const sourceUrl = isUrl(source) ? source : `file:${path.resolve(source)}`;
      console.log(`📄 Navigating to: ${source}`);
      await page.goto(sourceUrl, { waitUntil: 'networkidle0' });
      
      // Wait the specified delay
      if (options.delay > 0) {
        await page.evaluate(delay => new Promise(r => setTimeout(r, delay)), options.delay);
      }
      
      // Generate output filename
      const filename = generateFilename(source, options.format);
      const outputPath = path.join(options.outputDir, filename);
      
      // Take a screenshot
      await page.screenshot({
        path: outputPath,
        fullPage: options.fullPage,
        type: options.format,
        quality: options.format === 'jpeg' ? options.quality : undefined
      });
      
      console.log(`📸 Screenshot saved to: ${outputPath}`);
      await page.close();
    }
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await browser.close();
    console.log('✅ Browser closed');
  }
}

// Run the main function
captureScreenshots().catch(err => {
  console.error('🔥 Fatal error:', err);
  process.exit(1);
}); 