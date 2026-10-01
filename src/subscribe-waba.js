require("dotenv").config();

const axios = require("axios");

// [ByOpenCode] (BRIEF-006) safeError: nunca loguear error.config (token).
const { safeError } = require("./services/logger.service");

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
    // [ByOpenCode] (BRIEF-006) CUIDADO → safeError.
    console.error(
      "ERROR:",
      safeError(error)
    );
  }
}

subscribe();