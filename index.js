import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import OpenAI from 'openai';

const app = express();
app.use(bodyParser.json());

// --- CONFIGURAÇÃO ---
const PORT = process.env.PORT || 3000;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PROMPT_BASE = process.env.PROMPT_BASE;
const PROMPT_INTRO = process.env.PROMPT_INTRO;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'seu_token_de_verificacao_secreto'; // Adicione seu token aqui se não estiver no Render

if (!OPENAI_API_KEY || !PAGE_ACCESS_TOKEN || !PROMPT_BASE || !PROMPT_INTRO) {
  console.error('ERRO: Variáveis de ambiente não foram carregadas corretamente!');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// --- ARMAZENAMENTO DE HISTÓRICO ---
// Objeto para guardar o histórico de cada usuário.
// Em produção real, isso seria um banco de dados como Redis para não perder com reinicializações.
const historicoConversas = {};

// --- FUNÇÕES PRINCIPAIS ---

async function gerarRespostaGPT(userId, mensagemUsuario) {
  // 1. Define qual prompt usar (introdução ou base)
  const primeiraInteracao = !historicoConversas[userId] || historicoConversas[userId].length === 0;
  const promptSistema = primeiraInteracao ? PROMPT_INTRO : PROMPT_BASE;

  // 2. Cria o array de mensagens para a API
  const messages = [{ role: 'system', content: promptSistema }];

  // 3. Adiciona o histórico da conversa (se existir)
  if (!primeiraInteracao) {
    messages.push(...historicoConversas[userId]);
  }

  // 4. Adiciona a nova mensagem do usuário
  messages.push({ role: 'user', content: mensagemUsuario });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Recomendo o gpt-4o para mais inteligência, mas o mini é mais rápido/barato
      messages: messages,
      max_tokens: 800,
      temperature: 0.7,
    });

    const respostaIA = response.choices[0].message.content.trim();

    // 5. Atualiza o histórico com a pergunta do usuário e a resposta da IA
    if (!historicoConversas[userId]) {
      historicoConversas[userId] = [];
    }
    historicoConversas[userId].push({ role: 'user', content: mensagemUsuario });
    historicoConversas[userId].push({ role: 'assistant', content: respostaIA });
    
    // Limita o histórico para não ficar muito grande e caro
    if (historicoConversas[userId].length > 10) {
        historicoConversas[userId] = historicoConversas[userId].slice(-10);
    }

    return respostaIA;
  } catch (error) {
    console.error('Erro na chamada OpenAI:', error);
    return 'Desculpe, estou com uma instabilidade no meu sistema. Poderia repetir, por favor?';
  }
}

async function enviarTexto(userId, texto) {
  try {
    await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      recipient: { id: userId },
      message: { text: texto },
    } );
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err?.response?.data || err.message || err);
  }
}

async function handleEvent(sender_psid, webhook_event) {
  let userMessage = '';

  if (webhook_event.message?.text) userMessage = webhook_event.message.text;
  else if (webhook_event.postback?.payload) userMessage = webhook_event.postback.payload;
  else if (webhook_event.referral?.ref) userMessage = webhook_event.referral.ref;
  else if (webhook_event.optin?.ref) userMessage = webhook_event.optin.ref;

  if (userMessage) {
    // A lógica de 'primeiraInteracao' agora está dentro de gerarRespostaGPT
    const resposta = await gerarRespostaGPT(sender_psid, userMessage);
    await enviarTexto(sender_psid, resposta);
  } else {
    console.log('⚠️ Evento sem mensagem de texto válida.');
  }
}

// --- ROTAS DO SERVIDOR EXPRESS ---

app.get('/webhook', (req, res) => {
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
      for (const messaging_event of entry.messaging) {
        if (messaging_event.sender && messaging_event.message) {
            const sender_psid = messaging_event.sender.id;
            await handleEvent(sender_psid, messaging_event);
        }
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
