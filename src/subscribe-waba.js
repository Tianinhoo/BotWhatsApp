require("dotenv").config();

const axios = require("axios");

async function subscribe() {
  try {
    const url =
      `https://graph.facebook.com/${process.env.GRAPH_API_VERSION}` +
      `/${process.env.WABA_ID}/subscribed_apps`;

    const response = await axios.post(
      url,
      {},
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
        }
      }
    );

    console.log("Resultado:", response.data);

  } catch (error) {
    console.error(
      "ERROR:",
      error.response?.data || error.message
    );
  }
}

subscribe();