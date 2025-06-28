import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import OpenAI from 'openai';

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PROMPT_BASE = process.env.PROMPT_BASE;
const PROMPT_INTRO = process.env.PROMPT_INTRO;

if (!OPENAI_API_KEY || !PAGE_ACCESS_TOKEN || !PROMPT_BASE || !PROMPT_INTRO) {
  console.error('ERRO: Variáveis OPENAI_API_KEY, PAGE_ACCESS_TOKEN, PROMPT_BASE e PROMPT_INTRO devem estar definidas!');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Armazenamento temporário de usuários já atendidos (em memória)
const usuariosAtendidos = {};

async function gerarRespostaGPT(mensagemUsuario, prompt) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: mensagemUsuario },
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Erro na chamada OpenAI:', error);
    return 'Desculpe, não consegui processar sua solicitação agora.';
  }
}

async function enviarTexto(userId, texto) {
  try {
    await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      recipient: { id: userId },
      message: { text: texto },
    });
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err?.response?.data || err.message || err);
  }
}

async function handleMessage(sender_psid, received_message) {
  const mensagem = received_message.toLowerCase();

  // Se for a primeira mensagem do usuário
  const primeiraInteracao = !usuariosAtendidos[sender_psid];
  usuariosAtendidos[sender_psid] = true;

  const prompt = primeiraInteracao ? PROMPT_INTRO : PROMPT_BASE;
  const resposta = await gerarRespostaGPT(mensagem, prompt);
  await enviarTexto(sender_psid, resposta);
}

app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'teste_token';

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    for (const entry of body.entry) {
      const webhook_event = entry.messaging[0];
      const sender_psid = webhook_event.sender.id;

      if (webhook_event.message && webhook_event.message.text) {
        await handleMessage(sender_psid, webhook_event.message.text);
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
