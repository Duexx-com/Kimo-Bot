const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');
const express = require('express');
const path = require('path');
require('dotenv').config();

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  try {
    serviceAccount = require('./serviceAccountKey.json');
  } catch (e) {
    console.error('❌ Firebase Service Account not found!');
  }
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
    const defaultGuild = { welcomeChannel: null, ticketCategory: null };
    await guildRef.set(defaultGuild);
    return defaultGuild;
  }
  return doc.data();
}

async function updateGuildConfig(guildId, data) {
  await db.collection('guilds').doc(guildId).set(data, { merge: true });
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.status(200).send('Kimo Public Bot is Alive!'));

// Fetch All Users API for Dashboard
app.post('/api/admin/users', async (req, res) => {
    const { password } = req.body;
    if (password !== (process.env.ADMIN_PASSWORD || 'kimo1234')) {
        return res.status(401).json({ success: false, error: 'Invalid Password!' });
    }
    try {
        const snapshot = await db.collection('users').get();
        let users = [];
        snapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
        });
        res.json({ success: true, users });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Admin Action API
app.post('/api/admin', async (req, res) => {
    const { password, action, targetId, value } = req.body;

    if (password !== (process.env.ADMIN_PASSWORD || 'kimo1234')) {
        return res.status(401).json({ success: false, error: 'Invalid Admin Password!' });
    }

    try {
        let userData = await getUser(targetId);

        switch (action) {
            case 'seecash':
                return res.json({
                    success: true,
                    message: `<b>ID:</b> ${targetId} | <b>Unique ID:</b> #${userData.uniqueID}<br>
                              <b>Balance:</b> ${userData.Money.toLocaleString()} KIM<br>
                              <b>Level:</b> ${userData.level || 1} (${userData.XP.toLocaleString()} XP)<br>
                              <b>Rank:</b> ${userData.rank} | <b>Badges:</b> ${userData.Badges || 'None'}<br>
                              <b>Status:</b> ${userData.isBanned ? '🚫 BANNED (' + userData.banReason + ')' : '✅ Active'}`
                });
            case 'moneyadd':
                const amt = parseInt(value);
                if (isNaN(amt)) return res.json({ success: false, error: 'Enter a valid number.' });
                userData.Money = Math.max(0, userData.Money + amt);
                await updateUser(targetId, userData);
                return res.json({ success: true, message: `Updated Balance: <b>${userData.Money.toLocaleString()} KIM</b>` });
            case 'addxp':
                const xp = parseInt(value);
                if (isNaN(xp)) return res.json({ success: false, error: 'Enter a valid XP number.' });
                userData.XP += xp;
                userData.level = Math.floor(0.1 * Math.sqrt(userData.XP)) + 1;
                await updateUser(targetId, userData);
                return res.json({ success: true, message: `Added ${xp} XP. User is now <b>Level ${userData.level}</b>.` });
            case 'setrank':
                if (!value) return res.json({ success: false, error: 'Rank cannot be empty.' });
                userData.rank = value;
                await updateUser(targetId, userData);
                return res.json({ success: true, message: `Rank updated to <b>${value}</b>.` });
            case 'addbadge':
                if (!value) return res.json({ success: false, error: 'Provide an emoji.' });
                userData.Badges = `${userData.Badges || ''} ${value}`.trim();
                await updateUser(targetId, userData);
                return res.json({ success: true, message: `Badge ${value} added!` });
            case 'botban':
                userData.isBanned = true;
                userData.banReason = value || 'Violation of Kimo Rules';
                await updateUser(targetId, userData);
                return res.json({ success: true, message: `User <b>${targetId}</b> has been Bot Banned.` });
            case 'botunban':
                userData.isBanned = false;
                userData.banReason = 'None';
                await updateUser(targetId, userData);
                return res.json({ success: true, message: `User <b>${targetId}</b> has been Unbanned.` });
            case 'reset':
                userData.Money = 0;
                userData.XP = 0;
                userData.level = 1;
                await updateUser(targetId, userData);
                return res.json({ success: true, message: `User <b>${targetId}</b> economy & XP reset to 0.` });
            default:
                return res.json({ success: false, error: 'Unknown action.' });
        }
    } catch (err) {
        return res.json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`[WEB SERVER] Kimo Dashboard active on port ${PORT}`);
});

// ==========================================
// DISCORD BOT ENGINE
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const PREFIX = '&';
const EMERALD = '<a:emeralds:1499337601658654791>';
const activeFlySessions = new Map();
const xpCooldown = new Set();

client.once('ready', () => {
  console.log(`[KIMO PUBLIC BOT] Logged in as ${client.user.tag}!`);
});

client.on('guildMemberAdd', async member => {
  const guildConfig = await getGuildConfig(member.guild.id);
  if (!guildConfig.welcomeChannel) return;
  const channel = member.guild.channels.cache.get(guildConfig.welcomeChannel);
  if (!channel) return;

  const welcomeEmbed = new EmbedBuilder()
    .setTitle(`🎉 Welcome to ${member.guild.name}!`)
    .setColor('#00ffcc')
    .setDescription(`Hey <@${member.id}>, welcome!`);
  channel.send({ content: `Welcome <@${member.id}>!`, embeds: [welcomeEmbed] }).catch(() => {});
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const userId = message.author.id;
  let userData = await getUser(userId);

  if (!userData.isBanned && !xpCooldown.has(userId)) {
    xpCooldown.add(userId);
    setTimeout(() => xpCooldown.delete(userId), 30000);
    userData.XP = (userData.XP || 0) + 10;
    userData.level = Math.floor(0.1 * Math.sqrt(userData.XP)) + 1;
    await updateUser(userId, userData);
  }

  if (!message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (userData.isBanned) return message.reply(`❌ You are banned: ${userData.banReason}`);

  if (command === 'help') {
    return message.reply('🤖 **Kimo Bot v2.0** — Commands: &cash, &mine, &fly, &level, &whois');
  }

  if (command === 'cash' || command === 'profile') {
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${message.author.username}'s Profile`)
      .setColor('#00ffcc')
      .addFields(
        { name: '💵 Balance', value: `${userData.Money} KIM`, inline: true },
        { name: '🏆 Level', value: `${userData.level}`, inline: true }
      );
    return message.reply({ embeds: [embed] });
  }

  if (command === 'mine') {
    userData.Money += 50;
    userData.XP += 20;
    await updateUser(userId, userData);
    return message.reply(`⛏️ Mined successfully! Earned 50 KIM.`);
  }
});

client.login(process.env.DISCORD_TOKEN);
