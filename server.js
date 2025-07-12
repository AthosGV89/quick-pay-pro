const express = require('express');
const { MercadoPagoConfig, Payment } = require("mercadopago");
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// --- Configuração do Servidor ---
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static('public'));

// --- Configuração da Base de Dados ---
// Lê a "morada secreta" da base de dados a partir das Variáveis de Ambiente
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// --- Configuração do Mercado Pago ---
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
});

// --- Novas Rotas da API para Utilizadores ---

// Rota para registar um novo vendedor
app.post('/api/register', async (request, response) => {
  const { email, password } = request.body;

  if (!email || !password) {
    return response.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  try {
    // Encripta a senha para a guardar de forma segura
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Guarda o novo utilizador na base de dados
    const newUser = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, passwordHash]
    );

    response.status(201).json(newUser.rows[0]);
  } catch (error) {
    console.error("Erro no registo:", error);
    // Verifica se o erro é por e-mail duplicado
    if (error.code === '23505') {
        return response.status(409).json({ error: 'Este e-mail já está em uso.' });
    }
    response.status(500).json({ error: 'Não foi possível registar o utilizador.' });
  }
});


// --- Rota de Geração de PIX (inalterada por agora) ---
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
      payer: { email: "comprador.teste@example.com" },
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
