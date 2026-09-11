const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const images = [
  "modelo1",
  "modelo2",
  "modelo3",
  "oferta-dia"
];

const possibleExtensions = [".jpg", ".jpeg", ".png", ".webp"];

function findExistingFile(baseName) {
  for (const ext of possibleExtensions) {
    const fullPath = path.join("./media", `${baseName}${ext}`);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

async function fixAllImages() {
  try {
    for (const image of images) {
      const inputFile = findExistingFile(image);

      if (!inputFile) {
        console.log(`No se encontró archivo para: ${image} ❌`);
        continue;
      }

      const outputFile = path.join("./media", `${image}-fixed.jpg`);

      await sharp(inputFile)
        .rotate()
        .jpeg({ quality: 95 })
        .toFile(outputFile);

      console.log(`${image} corregida ✅ -> ${outputFile}`);
    }

    console.log("\nProceso terminado ✅");
  } catch (error) {
    console.error("ERROR:", error.message);
  }
}

fixAllImages();