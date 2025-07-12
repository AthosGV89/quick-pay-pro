// Ficheiro a ser salvo como: server.js

const express = require('express');
const { MercadoPagoConfig, Payment } = require("mercadopago");
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- Configuração do Servidor ---
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static('public'));

// --- Configuração da Base de Dados ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- Chave Secreta para os Crachás de Sessão (JWT) ---
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-default';


// --- Rotas da API para Utilizadores ---
app.post('/api/register', async (request, response) => {
  const { email, password } = request.body;
  if (!email || !password) {
    return response.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }
  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const newUser = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, passwordHash]
    );
    response.status(201).json(newUser.rows[0]);
  } catch (error) {
    console.error("Erro no registo:", error);
    if (error.code === '23505') {
        return response.status(409).json({ error: 'Este e-mail já está em uso.' });
    }
    response.status(500).json({ error: 'Não foi possível registar o utilizador.' });
  }
});

app.post('/api/login', async (request, response) => {
    const { email, password } = request.body;
    if (!email || !password) {
        return response.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }
    try {
        const userResult = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (userResult.rows.length === 0) {
            return response.status(404).json({ error: 'Utilizador não encontrado.' });
        }
        const user = userResult.rows[0];
        const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordCorrect) {
            return response.status(401).json({ error: 'Senha incorreta.' });
        }
        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1d' });
        response.status(200).json({ message: 'Login efetuado com sucesso!', token: token, user: { id: user.id, email: user.email } });
    } catch (error) {
        console.error("Erro no login:", error);
        response.status(500).json({ error: 'Não foi possível fazer o login.' });
    }
});

// --- Middleware de Autenticação (O nosso "Segurança") ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};


// --- Rotas Seguras (Apenas para utilizadores logados) ---

// Rota para guardar o Access Token do Mercado Pago
app.post('/api/save-token', authenticateToken, async (request, response) => {
    const { mercadoPagoToken } = request.body;
    const userId = request.user.userId;

    if (!mercadoPagoToken) {
        return response.status(400).json({ error: 'Token do Mercado Pago é obrigatório.' });
    }

    try {
        await pool.query("UPDATE users SET mercado_pago_token = $1 WHERE id = $2", [mercadoPagoToken, userId]);
        response.status(200).json({ message: 'Token salvo com sucesso!' });
    } catch (error) {
        console.error("Erro ao salvar token:", error);
        response.status(500).json({ error: 'Não foi possível salvar o token.' });
    }
});


// Rota de Geração de PIX (Agora segura e personalizada)
app.post('/api/generate-pix', authenticateToken, async (request, response) => {
  const { amount } = request.body;
  const userId = request.user.userId;

  try {
    const tokenResult = await pool.query("SELECT mercado_pago_token FROM users WHERE id = $1", [userId]);
    const userToken = tokenResult.rows[0]?.mercado_pago_token;

    if (!userToken) {
        return response.status(403).json({ error: 'Nenhum Access Token do Mercado Pago configurado para este utilizador.' });
    }

    const client = new MercadoPagoConfig({ accessToken: userToken });
    const payment = new Payment(client);

    const paymentData = {
      transaction_amount: parseFloat(amount.toFixed(2)),
      description: "Pagamento Quick Pay",
      payment_method_id: "pix",
      payer: { email: "comprador.teste@example.com" },
    };
    
    const result = await payment.create({ body: paymentData });
    const qrCode = result.point_of_interaction.transaction_data.qr_code;
    return response.status(200).json({ qr_code: qrCode });

  } catch (error) {
    console.error("--- ERRO DETALHADO DO MERCADO PAGO ---");
    console.error(error);
    const errorMessage = error.cause?.[0]?.description || "Erro ao comunicar com o Mercado Pago.";
    return response.status(500).json({ error: errorMessage });
  }
});


// --- Ligar o Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor Quick Pay a correr na porta ${PORT}`);
});
