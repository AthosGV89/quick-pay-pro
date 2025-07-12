// Ficheiro a ser salvo como: server.js

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

// --- Rotas da API para Utilizadores ---

// Rota para registar um novo vendedor
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

// NOVA ROTA: Para fazer o login de um vendedor
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

        // Login bem-sucedido!
        // No futuro, aqui devolveríamos um token de sessão (JWT).
        // Por agora, apenas devolvemos uma mensagem de sucesso.
        response.status(200).json({ message: 'Login efetuado com sucesso!', user: { id: user.id, email: user.email } });

    } catch (error) {
        console.error("Erro no login:", error);
        response.status(500).json({ error: 'Não foi possível fazer o login.' });
    }
});


// --- Rota de Geração de PIX (inalterada por agora) ---
app.post('/api/generate-pix', async (request, response) => {
  // ... (o nosso código vitorioso de geração de PIX continua aqui)
});


// --- Ligar o Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor Quick Pay a correr na porta ${PORT}`);
});
