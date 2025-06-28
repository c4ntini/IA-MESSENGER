const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

// Lista das imagens das provas sociais
const provasVisuais = [
  'https://i.imgur.com/AEougXu.png',
  'https://i.imgur.com/iLvLV7m.png',
  'https://i.imgur.com/xnBLQW1.png'
];

// Função para enviar uma imagem
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

// Função para enviar todas as provas visuais com intervalo de 2 segundos
function enviarTodasProvas(userId) {
  provasVisuais.forEach((imagem, i) => {
    setTimeout(() => {
      enviarImagemProvaSocial(userId, imagem);
    }, i * 2000);
  });
}

// Rota para verificação do webhook do Messenger (GET)
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

// Rota para receber mensagens do Messenger (POST)
app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    body.entry.forEach(entry => {
      const webhook_event = entry.messaging[0];
      const sender_psid = webhook_event.sender.id;

      if (webhook_event.message && webhook_event.message.text) {
        handleMessage(sender_psid, webhook_event.message.text);
      }
    });

    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Função que processa a mensagem recebida
function handleMessage(sender_psid, received_message) {
  const mensagem = received_message.toLowerCase();

  if (mensagem.includes('resultados') || mensagem.includes('provas')) {
    enviarTodasProvas(sender_psid);
  } else {
    // Resposta padrão
    enviarTexto(sender_psid, 'Oi! Me mande "resultados" para ver provas de antes e depois.');
  }
}

// Função para enviar texto simples
function enviarTexto(userId, texto) {
  axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
    recipient: { id: userId },
    message: { text: texto }
  }).catch(err => {
    console.error('Erro ao enviar texto:', err?.response?.data || err.message || err);
  });
}

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
