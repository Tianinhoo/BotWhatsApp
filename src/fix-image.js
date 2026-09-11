const sharp = require("sharp");

async function fixImage() {
  try {
    await sharp("./media/modelo1.jpg")
      .rotate() // detecta automáticamente la orientación EXIF
      .jpeg({
        quality: 95
      })
      .toFile("./media/modelo1-fixed.jpg");

    console.log("Imagen corregida ✅");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

fixImage();