const fs = require('fs');

// Create a simple HTML file that displays text
const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Text Image</title>
  <style>
    body {
      background: white;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
    .text {
      font-family: Arial, sans-serif;
      font-size: 24px;
      color: black;
    }
  </style>
</head>
<body>
  <div class="text">Hello World - Test Text for OCR</div>
</body>
</html>
`;

// Write the HTML file
fs.writeFileSync('test-image.html', html);

console.log('Created test-image.html - Open this file in a browser and take a screenshot to use as your test image.'); 