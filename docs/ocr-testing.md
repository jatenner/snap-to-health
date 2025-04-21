# OCR Testing Tools Documentation

This documentation covers the automated screenshot capture and OCR testing tools created for the Health application.

## Overview

The OCR (Optical Character Recognition) testing framework consists of two main components:

1. **Screenshot Capture Utility**: A Puppeteer-based tool for automatically generating test images from HTML templates or websites.
2. **OCR Testing Script**: A tool that sends captured images to the OCR API endpoint and validates the results.

These tools help automate testing of the OCR functionality which is critical for extracting nutritional information from food labels, receipts, and other text-based images.

## Installation

The tools require the following dependencies:

```bash
# Install dependencies
npm install --save-dev puppeteer axios form-data
```

## Screenshot Capture Utility

The screenshot capture utility (`scripts/capture-screenshots.js`) uses Puppeteer to create consistent screenshots for OCR testing.

### Usage

```bash
node scripts/capture-screenshots.js [options]
```

### Options

- `--source=<file.html or URL>`: File path or URL to capture (can specify multiple)
- `--output=<directory>`: Output directory for screenshots (default: `./screenshots`)
- `--width=<pixels>`: Viewport width (default: 800)
- `--height=<pixels>`: Viewport height (default: 600)
- `--fullPage=<true|false>`: Capture full page height (default: false)
- `--delay=<ms>`: Wait time before capture in ms (default: 500)
- `--device=<deviceName>`: Use a device preset (e.g., iPhone X, iPad)
- `--format=<png|jpeg>`: Image format (default: png)
- `--quality=<0-100>`: Image quality for JPEG (default: 80)

### Examples

```bash
# Capture a single HTML file
node scripts/capture-screenshots.js --source=test-image.html

# Capture a website with custom dimensions
node scripts/capture-screenshots.js --source=https://example.com --width=1200 --height=800

# Capture multiple sources with full page height
node scripts/capture-screenshots.js --source=test1.html --source=test2.html --output=test-images --fullPage=true

# Use device emulation
node scripts/capture-screenshots.js --source=test-image.html --device="iPhone X"
```

## OCR Testing Script

The OCR testing script (`scripts/test-ocr-with-images.js`) automates the process of sending images to the OCR API and validating the results.

### Usage

```bash
node scripts/test-ocr-with-images.js [options]
```

### Options

- `--dir=<directory>`: Directory containing test images (default: `./test-images/ocr-samples`)
- `--api=<endpoint>`: API endpoint to use (default: `http://localhost:3000/api/test-ocr`)
- `--format=<format>`: Image format to test (png, jpg, all) (default: all)
- `--verbose`: Enable verbose output

### Examples

```bash
# Test with default settings
node scripts/test-ocr-with-images.js

# Test with custom API endpoint
node scripts/test-ocr-with-images.js --api=https://health-web-app.vercel.app/api/test-ocr

# Test only PNG images with verbose output
node scripts/test-ocr-with-images.js --format=png --verbose
```

## Test HTML Templates

The repository includes HTML templates designed for OCR testing:

1. **test-image.html**: A template simulating a receipt with food items
2. **test-image-2.html**: A template simulating a nutrition facts label

You can create additional HTML templates to test specific OCR scenarios.

## Workflow Example

A complete OCR testing workflow example:

```bash
# 1. Generate screenshots from HTML templates
node scripts/capture-screenshots.js --source=test-image.html --source=test-image-2.html --output=test-images/ocr-samples --fullPage=true

# 2. Test OCR functionality with the generated images
node scripts/test-ocr-with-images.js --dir=test-images/ocr-samples

# 3. Review the results
cat test-images/ocr-samples/ocr-test-results.json
```

## Troubleshooting

### Common Issues

1. **Puppeteer launch fails**: Ensure you have the required dependencies for Puppeteer installed on your system.
2. **API connection errors**: Verify that the API endpoint is correct and the server is running.
3. **OCR fails on certain images**: Try adjusting the HTML template to improve text clarity or contrast.

### Debugging Tips

- Use the `--verbose` flag with the OCR testing script to see full API responses
- Inspect the generated screenshots visually to ensure they're properly formatted
- Check server logs for any API errors during testing 