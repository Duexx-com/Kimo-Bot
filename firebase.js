const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  serviceAccount = require('./serviceAccountKey.json');
}

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

async function getUser(userId) {
  const userRef = db.collection('users').doc(userId);
  const doc = await userRef.get();
  if (!doc.exists) {
    const defaultData = {
      uniqueID: Math.floor(100000 + Math.random() * 900000),
      isBanned: false,
      banReason: "None",
      botAdmin: false,
      verify: false,
      Money: 100,
      HP: 100,
      Hunger: 100,
      PickaxeHealth: 100,
      XP: 0,
      level: 1,
      rank: "Novice",
      luck: 0,
      Badges: "",
      hugcount: 0,
      lvlhug: 0,
      warnings: []
    };
    await userRef.set(defaultData);
    return defaultData;
  }
  return doc.data();
}

async function updateUser(userId, data) {
  await db.collection('users').doc(userId).set(data, { merge: true });
}

async function getGuildConfig(guildId) {
  const guildRef = db.collection('guilds').doc(guildId);
  const doc = await guildRef.get();
  if (!doc.exists) {
    const defaultGuild = {
      welcomeChannel: null,
      ticketCategory: null,
      logChannel: null
    };
    await guildRef.set(defaultGuild);
    return defaultGuild;
  }
  return doc.data();
}

async function updateGuildConfig(guildId, data) {
  await db.collection('guilds').doc(guildId).set(data, { merge: true });
}

module.exports = { db, getUser, updateUser, getGuildConfig, updateGuildConfig };
