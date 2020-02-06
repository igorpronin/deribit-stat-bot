const { MongoClient, ObjectID } = require('mongodb');
const appRoot = require('app-root-path');
const appRootPath = appRoot.path;
require('dotenv').config({path: `${appRootPath}/.env`});

const url = process.env.MONGO_URL;
const dbName = process.env.MONGO_DBNAME;

function initUser(tgUserObj) {
  MongoClient.connect(url, {useUnifiedTopology: true}, (err, db) => {
    if (err) throw err;
    const dbo = db.db(dbName);
    dbo.collection('users').find(
      { user_id: tgUserObj.id },
      {},
      (err, res) => {
        if (res) {
          res.forEach((doc) => {
            console.log(doc);
          })
        }
      }
      )
  })
}

module.exports.initUser = initUser;