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
    dbo.collection('users').find({ user_id: tgUserObj.id }).toArray((err, docs) => {
      if (!docs.length) {
        const user = tgUserObj;
        user.user_id = user.id;
        delete user.id;
        user.init_date = new Date();
        dbo.collection('users').insertOne(user, (err, r) => {
          console.log(`Inserted ${r.insertedCount} document`);
          db.close();
        })
      }
    })

  })
}

module.exports.initUser = initUser;