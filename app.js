const appRoot = require('app-root-path');
const appRootPath = appRoot.path;
require('dotenv').config({path: `${appRootPath}/.env`});

const axios = require('axios');

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
  const chatId = reqBody.message.chat.id;
  const userId = reqBody.message.from.id;
  const username = reqBody.message.from.username;
  const text = reqBody.message.text;
  let mes;
  if (chatId === userId) {
    switch (text) {
      case '/h':
        mes = `<b>Commands list:</b>
/h - help;
/d - extended market data on Deribit BTC-futures;
/i - BTC-index`;
        sendMes(mes, chatId);
        break;
      case '/d':
        getDeribitExtendedData('BTC')
          .then(result => {
            sendMes(JSON.stringify(result), chatId);
          });
        break;
      case '/i':
        break;
      default:
        console.log('[Error] Unknown command.')
    }
  }
  res.end();
});

function sendMes(mes, chatId) {
  axios.post(`https://api.telegram.org/bot${process.env.BOT_ID}:${process.env.BOT_TOKEN}/sendMessage`, {
    chat_id: chatId,
    text: mes,
    parse_mode: 'HTML'
  })
  .then(response => {
    console.log(`[Message sent] Message sent to chat with id ${chatId}`);
  })
  .catch(error => {
    console.log(error);
  });
}

function getDeribitExtendedData(cur) {
  return new Promise((resolve, reject) => {
    const instrumentsReq = axios(`https://www.deribit.com/api/v2/public/get_instruments?currency=${cur}&kind=future&expired=false`);
    let instruments;

    const indexReq = axios(`https://www.deribit.com/api/v2/public/get_index?currency=${cur}`);

    const tickerRequests = [];
    const tickerResponses = [];
    const allRequests = [indexReq];

    const result = {
      tickers: tickerResponses
    };

    indexReq
    .then(response => {
      result.index = response.data.result[cur];
    })
    .catch(error => {
      console.log(error);
    });

    instrumentsReq
    .then(response => {
      instruments = response.data.result;
      result.instruments = response.data.result;
      for (let i = 0; i < instruments.length; i++) {
        const instrument = instruments[i].instrument_name;
        const request = axios(`https://www.deribit.com/api/v2/public/ticker?instrument_name=${instrument}`);
        tickerRequests.push(request);
        allRequests.push(request);
        request
        .then(response => {
          tickerResponses.push(response.data.result);
        })
      }
      Promise.all(allRequests).then(() => {
        resolve(result);
      });
    })
    .catch(error => {
      console.log(error);
    });
  });
}

app.listen(process.env.PORT, () => {
  console.log(`Telegram server is listening on port ${process.env.PORT}...`);
});