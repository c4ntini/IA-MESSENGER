import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import { Configuration, OpenAIApi } from 'openai';

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PROMPT_BASE = process.env.PROMPT_BASE;

if (!OPENAI_API_KEY) {
  console.error('ERRO: OPENAI_API_KEY não definido no ambiente!');
  process.exit(1);
}

if (!PAGE_ACCESS_TOKEN) {
  console.error('ERRO: PAGE_ACCESS_TOKEN não definido no ambiente!');
  process.exit(1);
}

if (!PROMPT_BASE) {
  console.error('ERRO: PROMPT_BASE não definido no ambiente!');
  process.exit(1);
}

const configuration = new Configuration({
  apiKey: OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Função para gerar resposta da IA
async function gerarRespostaGPT(mensagemUsuario) {
  try {
    const response = await openai.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: PROMPT_BASE },
        { role: 'user', content: mensagemUsuario }
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Erro ao chamar OpenAI:', error?.response?.data || error.message || error);
    return 'Desculpe, não consegui processar sua solicitação agora.';
  }
}

// Função para enviar texto via Messenger
async function enviarTexto(userId, texto) {
  try {
    await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      recipient: { id: userId },
      message: { text: texto },
    });
  } catch (err) {
    console.error('Erro ao enviar texto:', err?.response?.data || err.message || err);
  }
}

// Aqui você pode colocar outras funções, por exemplo, enviar imagens, etc.

// Função que processa a mensagem recebida
async function handleMessage(sender_psid, received_message) {
  const mensagem = received_message.toLowerCase();

  // Exemplo: se mensagem tem palavra "resultados", envia provas visuais (não implementada aqui)
  if (mensagem.includes('resultados') || mensagem.includes('provas')) {
    // TODO: enviar provas visuais
  } else {
    const resposta = await gerarRespostaGPT(received_message);
    await enviarTexto(sender_psid, resposta);
  }
}

// Webhook GET para verificação do Facebook
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

// Webhook POST para receber mensagens do Messenger
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
