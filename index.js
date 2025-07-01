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

const usuariosRespondidos = new Set();

async function gerarRespostaGPT(mensagemUsuario, primeiraInteracao) {
  try {
    const promptBase = primeiraInteracao ? PROMPT_INTRO : PROMPT_BASE;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: promptBase },
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

async function handleEvent(sender_psid, webhook_event) {
  let userMessage = '';

  // Captura texto
  if (webhook_event.message?.text) {
    userMessage = webhook_event.message.text;
  }
  // Postback do botão
  else if (webhook_event.postback?.payload) {
    userMessage = webhook_event.postback.payload;
  }
  // Referral (clicou anúncio, link, etc)
  else if (webhook_event.referral?.ref) {
    userMessage = webhook_event.referral.ref;
  }
  // Optin (checkbox plugin, etc)
  else if (webhook_event.optin?.ref) {
    userMessage = webhook_event.optin.ref;
  }

  if (userMessage) {
    const primeiraInteracao = !usuariosRespondidos.has(sender_psid);
    const resposta = await gerarRespostaGPT(userMessage, primeiraInteracao);
    await enviarTexto(sender_psid, resposta);
    usuariosRespondidos.add(sender_psid);
  } else {
    console.log('Evento recebido, mas sem mensagem válida para processar.');
  }
}

// Webhook verify
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

// Rota webhook que recebe eventos Messenger
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    for (const entry of body.entry) {
      for (const messaging_event of entry.messaging) {
        const sender_psid = messaging_event.sender.id;
        await handleEvent(sender_psid, messaging_event);
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
