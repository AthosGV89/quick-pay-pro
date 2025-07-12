// Ficheiro a ser salvo como: server.js

const express = require('express');
const { MercadoPagoConfig, Payment } = require("mercadopago");

// --- Configuração do Servidor ---
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// --- Configuração do Mercado Pago ---
// CORREÇÃO FINAL: Lê a chave secreta do "cofre" (Environment Variables) do Render.
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
});

// --- O Nosso "Cérebro" (A Rota da API) ---
app.post('/api/generate-pix', async (request, response) => {
  try {
    const { amount } = request.body;

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return response.status(400).json({ error: "O valor fornecido é inválido." });
    }

    const paymentData = {
      transaction_amount: parseFloat(amount.toFixed(2)),
      description: "Pagamento Quick Pay",
      payment_method_id: "pix",
      payer: {
        // CORREÇÃO FINAL: Usamos o e-mail de pagador correto.
        email: "comprador.teste@example.com",
      },
    };

    const payment = new Payment(client);
    const result = await payment.create({ body: paymentData });
    const qrCode = result.point_of_interaction.transaction_data.qr_code;

    return response.status(200).json({ qr_code: qrCode });

  } catch (error) {
    console.error("--- ERRO DETALHADO DO MERCADO PAGO ---");
    console.error(error);
    console.error("------------------------------------");
    
    const errorMessage = error.cause?.[0]?.description || "Erro ao comunicar com o Mercado Pago.";
    return response.status(500).json({ error: errorMessage });
  }
});

// --- Ligar o Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor Quick Pay a correr na porta ${PORT}`);
});
