require("dotenv").config();

const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

async function uploadImage() {
  try {
    const form = new FormData();

    form.append("messaging_product", "whatsapp");
    form.append(
      "file",
      fs.createReadStream("./media/modelo1-fixed.jpg")
    );

    const url =
      `https://graph.facebook.com/${process.env.GRAPH_API_VERSION}` +
      `/${process.env.PHONE_NUMBER_ID}/media`;

    const response = await axios.post(
      url,
      form,
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          ...form.getHeaders()
        }
      }
    );

    console.log("Imagen subida ✅");
    console.log("MEDIA_ID:", response.data.id);

  } catch (error) {
    console.error(
      "ERROR:",
      error.response?.data || error.message
    );
  }
}

uploadImage();