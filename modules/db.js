const { MongoClient, ObjectID, Int32 } = require('mongodb');
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
        console.log(err);
        console.log(res);
        if (res) {
          res.forEach((doc) => {
            console.log(doc);
          });
          const user = tgUserObj;
          user.init_ts = new Int32(new Date().getTime());

          dbo.collection('users').insertOne(user, (err, res) => {
            if (err) throw err;
            console.log("1 document inserted");
            db.close();
          });
        }
      }
      )
  })
}

module.exports.initUser = initUser;