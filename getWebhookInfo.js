const appRoot = require('app-root-path');
const appRootPath = appRoot.path;
require('dotenv').config({path: `${appRootPath}/.env`});
const axios = require('axios');

function getWebhookInfo() {
  axios.get(`https://api.telegram.org/bot${process.env.BOT_ID}:${process.env.BOT_TOKEN}/getWebhookInfo`, {})
  .then(response => {
    console.log(response.data);
  })
  .catch(error => {
    console.log(error);
  });
}

getWebhookInfo();
