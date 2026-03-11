const fs = require("fs");
const path = require("path");

// Use dynamic import for ES modules
(async () => {
  // Setup DOM API shims for Node.js
  global.DOMMatrix = class DOMMatrix {
    constructor(init) {
      this.a = 1;
      this.b = 0;
      this.c = 0;
      this.d = 1;
      this.e = 0;
      this.f = 0;
    }
  };

  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  
  // Set up the worker - point directly to the file
  pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  
  const dataPath = path.resolve(__dirname, "DC-CI.pdf");
  const dataBuffer = new Uint8Array(fs.readFileSync(dataPath));
  
  const pdf = await pdfjsLib.getDocument(dataBuffer).promise;  
  let fullText = "";
  
  // Extract text from all pages
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map(item => item.str).join(" ") + "\n";
  }
  
  const lines = fullText.split("\n");
  const parts = [];
  
  for (const line of lines) {
    const clean = line.trim();
    
    // crude detection of fitting names
    if (
      clean.match(/Bend/i) ||
      clean.match(/Wye/i) ||
      clean.match(/Tee/i) ||
      clean.match(/Reducer/i) ||
      clean.match(/Coupling/i) ||
      clean.match(/Trap/i) ||
      clean.match(/Elbow/i)
    ) {
      const id = clean
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      
      parts.push({
        id: `ci_${id}`,
        name: clean,
        kind: "fitting",
        sizes: [2, 3, 4, 6],
        w: 2,
        h: 2,
        imageSrc: `/images/cast-iron/${id}.png`,
        ports: [
          { id: "in", x: 25, y: 0 },
          { id: "out", x: 25, y: 50 }
        ],
        meta: { material: "cast-iron" }
      });
    }
  }
  
  const output = `export const PARTS = ${JSON.stringify(parts, null, 2)};
`;
  
  const outputPath = path.resolve(__dirname, "generated-parts.ts");
  fs.writeFileSync(outputPath, output);
  
  console.log("Generated parts:", parts.length);
})().catch(err => {
  console.error("Error parsing PDF:", err.message);
  process.exit(1);
});