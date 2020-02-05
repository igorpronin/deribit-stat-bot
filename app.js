const appRoot = require('app-root-path');
const appRootPath = appRoot.path;
require('dotenv').config({path: `${appRootPath}/.env`});

const express = require('express');
const app = express();
const bodyParser = require('body-parser');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.post('/', (req, res, next) => {
  const reqBody = req.body;
  if (process.env.DEBUG_MODE) {
    console.log(req.body);
  }
  const chatId = reqBody.body.message.chat.id;
  const userId = reqBody.body.message.from.id;
  const username = reqBody.body.message.from.username;
  const text = reqBody.body.message.text;
  let mes;
  if (chatId === userId) {
    switch (text) {
      case '/h':
        mes = `<b>Список команд:</b>
/h - помощь`;
        sendMes(mes);
        break;
      default:
        console.log('[Error] Unknown command.')
    }
  }
  res.end();
});

function sendMes(mes, userId) {
  axios.post(`https://api.telegram.org/bot${process.env.BOT_ID}:${process.env.BOT_TOKEN}/sendMessage`, {
    chat_id: userId,
    text: mes,
    parse_mode: 'HTML'
  })
  .then(response => {
    console.log(`[Message sent] Message sent to user with id ${userId}`);
    // console.log(response.data.explanation);
  })
  .catch(error => {
    console.log(error);
  });
}

app.listen(process.env.PORT, () => {
  console.log(`Telegram server is listening on port ${process.env.PORT}...`);
});