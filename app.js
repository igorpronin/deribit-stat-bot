const appRoot = require('app-root-path');
const appRootPath = appRoot.path;
require('dotenv').config({path: `${appRootPath}/.env`});
const redis = require("redis");
const redisClient = redis.createClient();
const { initUser } = require('./modules/db');
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
        initUser(reqBody.message.from);
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
      currency: cur,
      tickers: tickerResponses,
      futures: {
        'BTC-26SEP20': {
          tick_size: 0.5,
          taker_commission: 0.0005,
          settlement_period: 'month',
          quote_currency: 'USD',
          min_trade_amount: 10,
          max_leverage: 100,
          maker_commission: -0.0002,
          kind: 'future',
          is_active: true,
          instrument_name: 'BTC-26SEP20',
          expiration_timestamp: 1593158400000,
          creation_timestamp: 1576833420000,
          contract_size: 10,
          base_currency: 'BTC',
          crossSpreads: [Array]
      }
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
          tickerResponses.push(response.data.result);
        })
      }
      Promise.all(allRequests).then(() => {
        function fillCross() {
          const maxExp = Math.max(...futuresBuf.exp);
          const maxExpName = futuresBuf.expNames[maxExp];
          const lowerExpNames = [];
          for (let key in futuresBuf.expNames) {
            if (key !== maxExpName) {
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

        for (let i = 0; i < result.tickers.length; i++) {
          const ticker = result.tickers[i];
          if (ticker.instrument_name === `${cur}-PERPETUAL`) {
            result.perpetualPrice = ticker.mark_price;
          }
        }

        for (let key in result.futures) {
          if (result.futures[key].crossSpreads) {
            console.log(key);
            console.log(result.futures[key].crossSpreads);
          }
        }

        console.log(result);
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

  for (let i = 0; i < data.tickers.length; i++) {
    const ticker = data.tickers[i];
    const instrument = ticker.instrument_name;
    const spreadToIndex = ticker.mark_price - data.index;
    const spreadToIndexPrct = spreadToIndex / data.index;
    mes += `<u>${ticker.instrument_name}</u>\n`;
    mes += `Price: <b>${ticker.mark_price}</b>\n`;
    mes += `Spread to index: <b>${spreadToIndex.toFixed(2)} (${(spreadToIndexPrct * 100).toFixed(2)}% from index price)</b>\n`;

    if (instrument === 'BTC-PERPETUAL') {
      mes += `Funding: <b>${(ticker.current_funding * 100).toFixed(4)}%</b>\n`;
      mes += `Funding 8h: <b>${(ticker.funding_8h * 100).toFixed(4)}%</b>\n`;
      mes += `Funding 8h annual: <b>${(ticker.funding_8h * 3 * 365 * 100).toFixed(2)}%</b>\n`;
    } else {
      const premium = calcPremium(
        ticker.timestamp,
        data.futures[instrument].expiration_timestamp,
        ticker.index_price,
        ticker.mark_price
      );
      const spreadToPerp = ticker.mark_price - data.perpetualPrice;
      const spreadToPerpPrct = spreadToPerp / data.index;
      mes += `Spread to perpetual: <b>${(spreadToPerp).toFixed()} (${(spreadToPerpPrct * 100).toFixed(2)}% from index price)</b>\n`;
      mes += `Premium: <b>${(premium * 100).toFixed(2)}%</b>\n`;
    }
    mes += '\n';
  }

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