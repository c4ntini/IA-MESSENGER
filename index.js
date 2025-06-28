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

// Configuração OpenAI
const configuration = new Configuration({
  apiKey: OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Lista das imagens das provas sociais (antes e depois)
const provasVisuais = [
  'https://i.imgur.com/AEougXu.png',
  'https://i.imgur.com/iLvLV7m.png',
  'https://i.imgur.com/xnBLQW1.png'
];

// Função para enviar uma imagem pelo Messenger
function enviarImagemProvaSocial(userId, imagemUrl) {
  axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
    recipient: { id: userId },
    message: {
      attachment: {
        type: 'image',
        payload: {
          url: imagemUrl,
          is_reusable: true
        }
      }
    }
  }).catch(err => {
    console.error('Erro ao enviar imagem:', err?.response?.data || err.message || err);
  });
}

// Envia todas as provas sociais com intervalo de 2 segundos
function enviarTodasProvas(userId) {
  provasVisuais.forEach((imagem, i) => {
    setTimeout(() => {
      enviarImagemProvaSocial(userId, imagem);
    }, i * 2000);
  });
}

// Função para gerar resposta GPT usando prompt do sistema + mensagem do usuário
async function gerarRespostaGPT(mensagemUsuario) {
  if (!PROMPT_BASE) {
    console.error('Variável de ambiente PROMPT_BASE não definida!');
    return 'Ops! Estou com um problema para responder agora, pode tentar novamente mais tarde.';
  }

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

    const respostaGPT = response.data.choices[0].message.content.trim();
    return respostaGPT;

  } catch (error) {
    console.error('Erro ao chamar OpenAI:', error?.response?.data || error.message || error);
    return 'Desculpe, estou com dificuldades para responder agora. Pode tentar novamente em alguns instantes?';
  }
}

// Função para enviar texto simples via Messenger
function enviarTexto(userId, texto) {
  axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
    recipient: { id: userId },
    message: { text: texto }
  }).catch(err => {
    console.error('Erro ao enviar texto:', err?.response?.data || err.message || err);
  });
}

// Função que processa a mensagem recebida, chama GPT para responder
async function handleMessage(sender_psid, received_message) {
  const mensagem = received_message.toLowerCase();

  if (mensagem.includes('resultados') || mensagem.includes('provas')) {
    enviarTodasProvas(sender_psid);
  } else {
    // Chama GPT para gerar resposta com prompt completo
    const resposta = await gerarRespostaGPT(received_message);
    enviarTexto(sender_psid, resposta);
  }
}

// Webhook GET para verificação
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

// Inicializa servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
