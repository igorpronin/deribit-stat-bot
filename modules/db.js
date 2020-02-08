const { MongoClient, ObjectID } = require('mongodb');
const appRoot = require('app-root-path');
const appRootPath = appRoot.path;
require('dotenv').config({path: `${appRootPath}/.env`});

const url = process.env.MONGO_URL;
const dbName = process.env.MONGO_DBNAME;

function initUser(tgUserObj) {
  return new Promise((resolve, reject) => {
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
            resolve(r.ops);
          })
        } else {
          db.close();
          reject(false);
        }
      })
    })
  });
}

function saveMes(tgMesObj) {
  return new Promise((resolve, reject) => {
    MongoClient.connect(url, {useUnifiedTopology: true}, (err, db) => {
      if (err) throw err;
      const dbo = db.db(dbName);
      let date = +(tgMesObj.message.date.toString() + '000');
      const message = {
        message_id: tgMesObj.message.message_id,
        user_id: tgMesObj.message.from.id,
        chat_id: tgMesObj.message.chat.id,
        text: tgMesObj.message.text,
        date: new Date(date)
      };
      if (tgMesObj.message.entities) {
        message.entities = tgMesObj.message.entities;
      }
      dbo.collection('messages').insertOne(message, (err, r) => {
        if (err) {
          db.close();
          reject(false);
        }
        console.log(`Inserted ${r.insertedCount} document`);
        db.close();
        resolve(r.ops);
      })
    })
  })
}

module.exports.initUser = initUser;
module.exports.saveMes = saveMes;