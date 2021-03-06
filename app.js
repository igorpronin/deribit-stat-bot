const appRoot = require('app-root-path');
const appRootPath = appRoot.path;
require('dotenv').config({path: `${appRootPath}/.env`});
const redis = require("redis");
const redisClient = redis.createClient();
const { initUser, saveMes } = require('./modules/db');
const axios = require('axios');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');

// Saves information about process to Redis
function getUTCFullDate(Date) {
  return `${Date.getUTCDate()}.${Date.getUTCMonth()+1}.${Date.getUTCFullYear()} ${Date.getUTCHours()}:${Date.getUTCMinutes()}:${Date.getUTCSeconds()}:${Date.getUTCMilliseconds()}`
}
const processTitle = 'TGDerSt';
const startTime = getUTCFullDate(new Date());
process.title = processTitle;
redisClient.set(processTitle, 'Running');
redisClient.set(`${processTitle}:pid`, process.pid);
redisClient.set(`${processTitle}:type`, 'server');
redisClient.set(`${processTitle}:startTime`, startTime);
redisClient.set(`${processTitle}:description`, `@DeribitStatBot Telegram server`);
redisClient.quit();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.post('/', (req, res, next) => {
  const reqBody = req.body;
  if (process.env.DEBUG_MODE) {
    console.log(req.body);
    if (req.body.message.entities) {
      console.log(req.body.message.entities);
    }
  }
  const chatId = reqBody.message.chat.id;
  const userId = reqBody.message.from.id;
  const username = reqBody.message.from.username;
  const text = reqBody.message.text;
  let mes;
  const help =
`<b>Commands list:</b>
/h - help;
/d - extended market data on Deribit BTC-futures`;
  if (chatId === userId) {
    switch (text) {
      case '/start':
        const prom = initUser(reqBody.message.from);
        prom
          .then(data => {
            console.log('[New user] New user!');
            console.log(data);
            sendMes(
              `<b>New user:</b>\n${JSON.stringify(data)}`,
              +process.env.ADMIN_USER_ID
            );
          })
          .catch(err => {});
        mes = help;
        sendMes(mes, chatId);
        break;
      case '/h' || '/start':
        mes = help;
        sendMes(mes, chatId);
        break;
      case '/d':
        getDeribitExtendedData('BTC')
          .then(result => {
            const mes = formatDeribitExtendedData(result);
            sendMes(mes, chatId);
          });
        break;
      default:
        console.log('[Error] Unknown command.')
    }
  }
  const prom = saveMes(reqBody);
  prom
    .then(data => {})
    .catch(err => {});
  res.end();
});

function sendMes(mes, chatId) {
  const mesParams = {
    chat_id: chatId,
    text: mes,
    parse_mode: 'HTML'
  };
  axios.post(`https://api.telegram.org/bot${process.env.BOT_ID}:${process.env.BOT_TOKEN}/sendMessage`, mesParams)
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
      currency: cur,
      tickers: {},
      futures: {}
    };

    const futuresBuf = {
      exp: [],
      expNames: {}
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
      for (let i = 0; i < instruments.length; i++) {
        const instrument = instruments[i].instrument_name;
        if (instrument === `${cur}-PERPETUAL`) {
          result.perpetual = instruments[i];
        } else {
          result.futures[instrument] = instruments[i];
          futuresBuf.exp.push(instruments[i].expiration_timestamp);
          futuresBuf.expNames[instruments[i].expiration_timestamp] = instrument;
        }
        const request = axios(`https://www.deribit.com/api/v2/public/ticker?instrument_name=${instrument}`);
        tickerRequests.push(request);
        allRequests.push(request);
        request
        .then(response => {
          const instrumentName = response.data.result.instrument_name;
          result.tickers[instrumentName] = response.data.result;
        })
      }
      Promise.all(allRequests).then(() => {
        function fillCross() {
          const maxExp = Math.max(...futuresBuf.exp);
          const maxExpName = futuresBuf.expNames[maxExp];
          const lowerExpNames = [];
          for (let key in futuresBuf.expNames) {
            if (futuresBuf.expNames[key] !== maxExpName) {
              lowerExpNames.push(futuresBuf.expNames[key])
            }
          }
          delete futuresBuf.expNames[maxExp];
          const index = futuresBuf.exp.indexOf(maxExp);
          if (index >= 0) {
            futuresBuf.exp.splice(index, 1);
          }
          result.futures[maxExpName].crossSpreads = lowerExpNames;
          if (futuresBuf.exp.length > 1) {
            fillCross();
          }
        }
        fillCross();

        for (let key in result.tickers) {
          const ticker = result.tickers[key];
          if (key === `${cur}-PERPETUAL`) {
            result.perpetualPrice = ticker.mark_price;
          }
        }

        resolve(result);
      });
    })
    .catch(error => {
      console.log(error);
    });
  });
}

function formatDeribitExtendedData(data) {
  let mes =
`<b>Extended Deribit market data:</b>

Currency: <b>${data.currency}</b>

Index: <b>${data.index}</b>
\n`;

  function createItem(ticker) {
    let mes = '';
    const instrument = ticker.instrument_name;
    const spreadToIndex = ticker.mark_price - data.index;
    const spreadToIndexPrct = spreadToIndex / data.index;
    mes += `<u>${ticker.instrument_name}</u>\n`;
    mes += `Price: <b>${ticker.mark_price}</b>\n`;
    mes += `Spread to index: <b>${spreadToIndex.toFixed(2)} (${(spreadToIndexPrct * 100).toFixed(2)}% from index price)</b>\n`;

    if (instrument === `${data.currency}-PERPETUAL`) {
      mes += `Funding: <b>${(ticker.current_funding * 100).toFixed(4)}%</b>\n`;
      mes += `Funding 8h: <b>${(ticker.funding_8h * 100).toFixed(4)}%</b>\n`;
      mes += `Funding 8h annual: <b>${(ticker.funding_8h * 3 * 365 * 100).toFixed(2)}%</b>\n`;
    }
    else {
      const premium = calcPremium(
        ticker.timestamp,
        data.futures[instrument].expiration_timestamp,
        ticker.index_price,
        ticker.mark_price
      );
      const spreadToPerp = ticker.mark_price - data.perpetualPrice;
      const spreadToPerpPrct = spreadToPerp / data.index;
      mes += `Spread to perpetual: <b>${(spreadToPerp).toFixed(2)} (${(spreadToPerpPrct * 100).toFixed(2)}% from index price)</b>\n`;
      if (data.futures[instrument].crossSpreads && data.futures[instrument].crossSpreads.length) {
        for (let i = 0; i < data.futures[instrument].crossSpreads.length; i++) {
          const crossSpreadInstrName = data.futures[instrument].crossSpreads[i];
          const crossSpreadInstrPrice = data.tickers[crossSpreadInstrName].mark_price;
          const thisSpread = ticker.mark_price - crossSpreadInstrPrice;
          const thisSpreadPrct = thisSpread / data.index;
          mes += `Spread to ${crossSpreadInstrName}: <b>${thisSpread.toFixed(2)} (${(thisSpreadPrct * 100).toFixed(2)}% from index price)</b>\n`
        }
      }
      mes += `Premium: <b>${(premium * 100).toFixed(2)}%</b>\n`;
    }
    mes += '\n';
    return mes;
  }

  let futMes = '';

  for (let key in data.tickers) {
    const ticker = data.tickers[key];
    const itemMes = createItem(ticker);
    if (key === `${data.currency}-PERPETUAL`) {
      mes += itemMes;
    } else {
      futMes += itemMes;
    }
  }

  mes += futMes;

  return mes;
}

function calcPremium(ts, expTs, ind, mp) {
  if (!ind) {
    return false;
  }
  let minTillExp = Math.round((expTs - ts) / 1000 / 60);
  if (minTillExp <= 0) return false;
  let premium = (mp / ind - 1) * 525600 / minTillExp;
  return +(premium.toFixed(6));
}

// getDeribitExtendedData('BTC')
// .then(result => {
//   console.log(formatDeribitExtendedData(result));
// });

app.listen(process.env.PORT, () => {
  console.log(`Telegram server is listening on port ${process.env.PORT}...`);
});