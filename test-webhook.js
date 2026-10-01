const http = require("http");

const phone = "59100000000"; // Número falso de prueba
const text = process.argv[2] || "Hola, ¿tienen catálogo?";

const payload = JSON.stringify({
  entry: [
    {
      changes: [
        {
          value: {
            messages: [
              {
                from: phone,
                type: "text",
                text: {
                  body: text
                },
                referral: {
                  source_url: "https://fb.me/fake_ad",
                  source_type: "ad",
                  headline: "Piloto V1 - Prueba de Anuncio"
                }
              }
            ]
          }
        }
      ]
    }
  ]
});

const options = {
  hostname: "localhost",
  port: 3001,
  path: "/webhook",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload)
  }
};

const req = http.request(options, (res) => {
  console.log(`Estado de respuesta del servidor local: ${res.statusCode} OK`);
});

req.on("error", (e) => {
  console.error(`Error de conexión: ${e.message}`);
  console.error("Asegúrate de que 'npm run dev' esté corriendo en otra consola.");
});

req.write(payload);
req.end();

console.log(`[Simulador] Enviando mensaje a localhost:3001/webhook`);
console.log(`[Simulador] Cliente falso: ${phone}`);
console.log(`[Simulador] Mensaje: "${text}"\n`);
