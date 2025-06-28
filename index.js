import express from 'express';
import axios from 'axios';
import OpenAI from 'openai';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

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

// Prompt ultra completo com o script da Marina (coloque seu prompt aqui exatamente)
const promptBase = `
[PROMPT AQUI]
`;

// Detecta qual kit o usuário quer, para enviar o link correto
function detectarKit(texto) {
  texto = texto.toLowerCase();
  if (texto.includes("vida nova") || texto.includes("10 potes") || texto.includes("leve 10")) return "vidaNova";
  if (texto.includes("transformação") || texto.includes("transformacao") || texto.includes("5 potes") || texto.includes("leve 5")) return "transformacao";
  if (texto.includes("resultado") || texto.includes("3 potes") || texto.includes("leve 3")) return "resultado";
  if (texto.includes("teste") || texto.includes("1 pote")) return "teste";
  return null;
}

// Mapeamento dos links dos kits
const linksPagamentos = {
  teste: "https://pay.braip.co/ref?pl=plag8o2v&ck=chew8wl8&af=afi28ze27n",
  resultado: "https://pay.braip.co/ref?pl=plar06ow&ck=chew8wl8&af=afi28ze27n",
  transformacao: "https://pay.braip.co/ref?pl=plageykv&ck=chew8wl8&af=afi28ze27n",
  vidaNova: "https://pay.braip.co/ref?pl=pladerwz&ck=chew8wl8&af=afi28ze27n"
};

// Função para gerar resposta do GPT
async function gerarRespostaGPT(pergunta) {
  const promptCompleto = `
${promptBase}

Cliente pergunta:
"${pergunta}"

Responda como a Marina, consultora especialista, seguindo todas as regras do prompt acima.
  `;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: promptCompleto }],
      max_tokens: 800,
      temperature: 0.7,
    });

    let respostaGPT = response.choices[0].message.content.trim();

    const kit = detectarKit(pergunta);
    if (kit) {
      const link = linksPagamentos[kit];
      respostaGPT += `\n\n👉 Para garantir seu kit, clique aqui: ${link}`;
    }

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

// Função que processa a mensagem recebida, agora async para chamar GPT
async function handleMessage(sender_psid, received_message) {
  const mensagem = received_message.toLowerCase();

  if (mensagem.includes('resultados') || mensagem.includes('provas')) {
    enviarTodasProvas(sender_psid);
  } else {
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
