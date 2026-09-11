const axios = require("axios");

async function sendTextMessage(to, text) {
  const url =
    `https://graph.facebook.com/${process.env.GRAPH_API_VERSION}` +
    `/${process.env.PHONE_NUMBER_ID}/messages`;

  const response = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: "text",
      text: {
        body: text
      }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );

  return response.data;
}

module.exports = {
  sendTextMessage,
  sendImageMessage
}
async function sendImageMessage(to, imageId, caption = "") {
  const url =
    `https://graph.facebook.com/${process.env.GRAPH_API_VERSION}` +
    `/${process.env.PHONE_NUMBER_ID}/messages`;

  const response = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: "image",
      image: {
        id: imageId,
        caption: caption
      }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );

  return response.data;
}
;
