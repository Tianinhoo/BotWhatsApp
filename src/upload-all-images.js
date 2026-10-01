require("dotenv").config();

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

// [ByOpenCode] (BRIEF-006) safeError: nunca loguear error.config (token).
const { safeError } = require("./services/logger.service");

const images = [
  { key: "IMAGE_MODELO_1", file: "modelo1-fixed.jpg" },
  { key: "IMAGE_MODELO_2", file: "modelo2-fixed.jpg" },
  { key: "IMAGE_MODELO_3", file: "modelo3-fixed.jpg" },
  { key: "IMAGE_OFERTA_DIA", file: "oferta-dia-fixed.jpg" }
];

async function uploadOneImage(fileName) {
  const filePath = path.join(
    __dirname,
    "..",
    "media",
    fileName
  );

  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el archivo: ${filePath}`);
  }

  const form = new FormData();

  form.append(
    "messaging_product",
    "whatsapp"
  );

  form.append(
    "file",
    fs.createReadStream(filePath)
  );

  const url =
    `https://graph.facebook.com/${process.env.GRAPH_API_VERSION}` +
    `/${process.env.PHONE_NUMBER_ID}/media`;

  const response = await axios.post(
    url,
    form,
    {
      headers: {
        Authorization:
          `Bearer ${process.env.WHATSAPP_TOKEN}`,
        ...form.getHeaders()
      }
    }
  );

  return response.data.id;
}

async function main() {
  try {

    console.log("Subiendo imágenes a Meta...\n");

    const results = {};

    for (const image of images) {

      const mediaId =
        await uploadOneImage(image.file);

      results[image.key] = mediaId;

      console.log(
        `${image.file} ✅ -> ${mediaId}`
      );
    }

    console.log(
      "\n========== COPIA ESTO EN TU .env ==========\n"
    );

    for (
      const [key, value]
      of Object.entries(results)
    ) {
      console.log(`${key}=${value}`);
    }

    console.log(
      "\n===========================================\n"
    );

  } catch (error) {

    // [ByOpenCode] (BRIEF-006) CUIDADO → safeError.
    console.error(
      "ERROR:",
      safeError(error)
    );
  }
}

main();