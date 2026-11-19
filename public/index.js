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
require('dotenv').config();
const { getUser, updateUser, getGuildConfig, updateGuildConfig } = require('./firebase.js');

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
  console.log(`[KIMO PUBLIC BOT] Logged in as ${client.user.tag} across ${client.guilds.cache.size} servers!`);
  client.user.setActivity('&help | Kimo RPG & Moderation', { type: 0 });
});

// Auto Welcome System
client.on('guildMemberAdd', async member => {
  const guildConfig = await getGuildConfig(member.guild.id);
  if (!guildConfig.welcomeChannel) return;

  const channel = member.guild.channels.cache.get(guildConfig.welcomeChannel);
  if (!channel) return;

  const welcomeEmbed = new EmbedBuilder()
    .setTitle(`🎉 Welcome to ${member.guild.name}!`)
    .setColor('#00ffcc')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
    .setDescription(`Hey <@${member.id}>, welcome to our community!\n\n👤 **Member:** ${member.user.tag}\n📊 **Member Count:** #${member.guild.memberCount}\n💡 Type \`&help\` to explore Kimo Bot!`)
    .setFooter({ text: 'Kimo Welcome System' })
    .setTimestamp();

  channel.send({ content: `Welcome <@${member.id}>!`, embeds: [welcomeEmbed] }).catch(() => {});
});

// Message & Command Handler + Auto Leveling
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const userId = message.author.id;
  let userData = await getUser(userId);

  // Auto XP & Leveling (Every 30 seconds cooldown per user)
  if (!userData.isBanned && !xpCooldown.has(userId)) {
    xpCooldown.add(userId);
    setTimeout(() => xpCooldown.delete(userId), 30000);

    const gainedXp = Math.floor(Math.random() * 15) + 10;
    userData.XP = (userData.XP || 0) + gainedXp;
    const newLevel = Math.floor(0.1 * Math.sqrt(userData.XP)) + 1;

    if (newLevel > (userData.level || 1)) {
      userData.level = newLevel;
      const reward = newLevel * 100;
      userData.Money += reward;
      await updateUser(userId, userData);

      const lvlEmbed = new EmbedBuilder()
        .setTitle('🎊 LEVEL UP!')
        .setColor('#FFD700')
        .setDescription(`Congratulations <@${userId}>! You leveled up to **Level ${newLevel}**!\n🎁 **Bonus Reward:** +${numberWithCommas(reward)} ${EMERALD}`);
      message.channel.send({ embeds: [lvlEmbed] }).catch(() => {});
    } else {
      await updateUser(userId, userData);
    }
  }

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (userData.isBanned && command !== 'bancheck' && command !== 'support') {
    return message.reply(`❌ You are banned from **Kimo Bot**! Reason: ${userData.banReason}`);
  }

  if (userData.verify === false && command !== 'verify') {
    const embed = new EmbedBuilder()
      .setTitle('📜 Kimo Rules & Verification')
      .setDescription(`Welcome <@${userId}>! Please read and accept the rules to unlock all commands:\n\n1️⃣ Be respectful to everyone.\n2️⃣ No spamming, auto-typing, or exploiting.\n3️⃣ Follow Discord ToS.\n\nClick **✅ Verify** below to continue.`)
      .setColor('#FFA500');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('verify_btn').setLabel('Verify').setStyle(ButtonStyle.Primary).setEmoji('✅')
    );
    return message.reply({ embeds: [embed], components: [row] });
  }

  const isBotAdmin = userData.botAdmin || userId === process.env.OWNER_ID;

  // Help Command
  if (command === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('🤖 Kimo Public Bot — Command Center')
      .setColor('#00ffcc')
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        { name: '💰 Economy & RPG', value: '`&cash`, `&mine`, `&fly <bet>`, `&give @user <amt>`, `&repair`, `&level`' },
        { name: '🎉 Fun & Social', value: '`&hug @user`, `&whois [@user]`, `&support`, `&report <issue>`' },
        { name: '🛡️ Server Moderation', value: '`&kick`, `&ban`, `&mute`, `&warn`, `&warnings`, `&clear <1-100>`' },
        { name: '🎫 Setup (Admin)', value: '`&setwelcome #ch`, `&ticketsetup`' },
        { name: '👑 Bot Admin', value: '`&moneyadd`, `&seecash`, `&addxp`, `&setrank`, `&addbadge`, `&removebadge`, `&botban`, `&botunban`, `&bancheck`, `&reset`' }
      )
      .setFooter({ text: 'Kimo Public Bot Engine v2.0' });
    return message.reply({ embeds: [helpEmbed] });
  }

  // Level & Profile
  if (command === 'level' || command === 'rank') {
    const target = message.mentions.users.first() || message.author;
    const tData = await getUser(target.id);
    const currentLvl = tData.level || 1;
    const nextLvlXp = Math.pow(currentLvl * 10, 2);

    const embed = new EmbedBuilder()
      .setTitle(`📈 Level Stats — ${target.username}`)
      .setColor('#38bdf8')
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: '🏆 Current Level', value: `**Level ${currentLvl}**`, inline: true },
        { name: '⭐ Total XP', value: `${numberWithCommas(tData.XP)} / ${numberWithCommas(nextLvlXp)}`, inline: true },
        { name: '🛡️ Rank Title', value: `${tData.rank}`, inline: true }
      );
    return message.reply({ embeds: [embed] });
  }

  if (command === 'cash' || command === 'profile') {
    const badges = userData.Badges && userData.Badges.trim() !== '' ? userData.Badges : 'None';
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${message.author.username}'s Profile`)
      .setColor('#2ecc71')
      .setThumbnail(message.author.displayAvatarURL())
      .addFields(
        { name: '💵 Balance', value: `${numberWithCommas(userData.Money)} ${EMERALD}`, inline: true },
        { name: '🏆 Level', value: `Lvl ${userData.level || 1} (${numberWithCommas(userData.XP)} XP)`, inline: true },
        { name: '🛡️ Rank', value: `${userData.rank}`, inline: true },
        { name: '❤️ HP / 🍗 Hunger', value: `${userData.HP}/100 | ${userData.Hunger}/100`, inline: true },
        { name: '🛠️ Pickaxe', value: `${userData.PickaxeHealth}/100`, inline: true },
        { name: '🏅 Badges', value: `${badges}`, inline: true }
      )
      .setFooter({ text: `Game ID: #${userData.uniqueID}` });
    return message.reply({ embeds: [embed] });
  }

  // Setups
  if (command === 'setwelcome') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ You need **Administrator** permission to use this!');
    }
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply('❌ Usage: `&setwelcome #channel`');

    await updateGuildConfig(message.guild.id, { welcomeChannel: channel.id });
    return message.reply(`✅ Welcome channel has been set to <#${channel.id}>!`);
  }

  if (command === 'ticketsetup') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ You need **Administrator** permission to use this!');
    }

    const ticketEmbed = new EmbedBuilder()
      .setTitle('🎫 Kimo Support & Help Desk')
      .setColor('#00ffcc')
      .setDescription('Need help, want to report a player, or claim a prize?\nClick the **📩 Create Ticket** button below to open a private support channel with our staff team!')
      .setFooter({ text: `${message.guild.name} Support System` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_ticket').setLabel('Create Ticket').setStyle(ButtonStyle.Success).setEmoji('📩')
    );

    await message.channel.send({ embeds: [ticketEmbed], components: [row] });
    return message.delete().catch(() => {});
  }

  // Moderation Commands
  if (command === 'clear' || command === 'purge') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ You lack `Manage Messages` permission.');
    }
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100) {
      return message.reply('❌ Please provide a number between **1 and 100**.');
    }
    await message.channel.bulkDelete(amount, true).catch(() => {});
    const msg = await message.channel.send(`🧹 Deleted **${amount}** messages!`);
    setTimeout(() => msg.delete().catch(() => {}), 3000);
    return;
  }

  if (command === 'kick') {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('❌ You lack `Kick Members` permission.');
    }
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Mention a user to kick! Usage: `&kick @user [reason]`');
    if (!member.kickable) return message.reply('❌ I cannot kick this user.');

    const reason = args.slice(1).join(' ') || 'No reason provided';
    await member.kick(reason);
    return message.reply(`👢 **${member.user.tag}** has been kicked. | Reason: **${reason}**`);
  }

  if (command === 'ban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ You lack `Ban Members` permission.');
    }
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Mention a user to ban! Usage: `&ban @user [reason]`');
    if (!member.bannable) return message.reply('❌ I cannot ban this user.');

    const reason = args.slice(1).join(' ') || 'No reason provided';
    await member.ban({ reason });
    return message.reply(`🔨 **${member.user.tag}** has been permanently banned. | Reason: **${reason}**`);
  }

  if (command === 'mute' || command === 'timeout') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ You lack `Timeout Members` permission.');
    }
    const member = message.mentions.members.first();
    const minutes = parseInt(args[1]) || 10;
    if (!member) return message.reply('❌ Usage: `&mute @user <minutes> [reason]`');
    if (!member.moderatable) return message.reply('❌ I cannot timeout this user.');

    const reason = args.slice(2).join(' ') || 'Muted by Moderator';
    await member.timeout(minutes * 60 * 1000, reason);
    return message.reply(`🔇 **${member.user.tag}** has been muted for **${minutes} minutes**. | Reason: **${reason}**`);
  }

  if (command === 'warn') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ You lack `Moderate Members` permission.');
    }
    const target = message.mentions.users.first();
    const reason = args.slice(1).join(' ');
    if (!target || !reason) return message.reply('❌ Usage: `&warn @user <reason>`');

    let tData = await getUser(target.id);
    tData.warnings = tData.warnings || [];
    tData.warnings.push({ reason, mod: message.author.tag, date: new Date().toLocaleDateString() });
    await updateUser(target.id, tData);

    return message.reply(`⚠️ Warned **${target.tag}** (Total Warnings: **${tData.warnings.length}**)\nReason: **${reason}**`);
  }

  if (command === 'warnings') {
    const target = message.mentions.users.first() || message.author;
    let tData = await getUser(target.id);
    const warns = tData.warnings || [];
    if (warns.length === 0) return message.reply(`✅ **${target.username}** has 0 warnings.`);

    const list = warns.map((w, i) => `**${i + 1}.** ${w.reason} *(by ${w.mod} on ${w.date})*`).join('\n');
    const embed = new EmbedBuilder()
      .setTitle(`⚠️ Warnings for ${target.username}`)
      .setColor('#f1c40f')
      .setDescription(list);
    return message.reply({ embeds: [embed] });
  }

  // RPG & Economy
  if (command === 'mine') {
    if (userData.PickaxeHealth <= 0) return message.reply(`❌ Pickaxe broken! Use \`&repair\`.`);
    userData.PickaxeHealth = Math.max(0, userData.PickaxeHealth - 5);
    const mined = Math.floor(Math.random() * 60) + 15;
    userData.Money += mined;
    userData.XP += 15;
    await updateUser(userId, userData);

    return message.reply({
      embeds: [new EmbedBuilder().setTitle('⛏️ Mining').setColor('#3498db').setDescription(`💎 Found: **${mined}** ${EMERALD}\n🛠️ Durability: **${userData.PickaxeHealth}/100**`)]
    });
  }

  if (command === 'repair') {
    if (userData.PickaxeHealth >= 100) return message.reply('✅ Pickaxe is already at 100%!');
    if (userData.Money < 250) return message.reply(`❌ You need **250** ${EMERALD} to repair.`);
    userData.Money -= 250;
    userData.PickaxeHealth = 100;
    await updateUser(userId, userData);
    return message.reply(`🛠️ Pickaxe repaired to **100/100** for 250 ${EMERALD}!`);
  }

  if (command === 'give') {
    const target = message.mentions.users.first();
    const amount = args[1] === 'all' ? userData.Money : parseInt(args[1]);
    if (!target || target.id === userId || isNaN(amount) || amount <= 0 || userData.Money < amount) {
      return message.reply('❌ Invalid user or insufficient balance!');
    }
    userData.Money -= amount;
    let tData = await getUser(target.id);
    tData.Money += amount;
    await updateUser(userId, userData);
    await updateUser(target.id, tData);
    return message.reply(`✅ Sent **${numberWithCommas(amount)}** ${EMERALD} to <@${target.id}>!`);
  }

  if (command === 'fly') {
    const raw = args[0]?.toLowerCase();
    if (!raw) return message.reply('❌ Usage: `&fly <amount/all>`');
    let bet = raw === 'all' ? Math.min(userData.Money, 250000) : parseInt(raw);
    if (isNaN(bet) || bet < 50 || userData.Money < bet) return message.reply('❌ Minimum bet 50 or low balance!');

    userData.Money -= bet;
    await updateUser(userId, userData);

    const crashAt = (Math.floor(Math.random() * 500) + 120) / 100;
    activeFlySessions.set(userId, { bet, mult: 1.0, active: true });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`fly_cashout_${userId}`).setLabel('💰 Cash Out').setStyle(ButtonStyle.Success)
    );

    const msg = await message.reply({
      embeds: [new EmbedBuilder().setTitle('🚀 Elytra Flight').setColor('#f1c40f').setDescription(`Bet: **${bet}** ${EMERALD}\nMultiplier: **1.00x**`)],
      components: [row]
    });

    const timer = setInterval(async () => {
      const session = activeFlySessions.get(userId);
      if (!session || !session.active) return clearInterval(timer);

      session.mult += 0.25;
      if (session.mult >= crashAt) {
        clearInterval(timer);
        activeFlySessions.delete(userId);
        return msg.edit({
          embeds: [new EmbedBuilder().setTitle('💥 Crashed!').setColor('#e74c3c').setDescription(`Crashed at **${crashAt.toFixed(2)}x**! Lost **${bet}** ${EMERALD}`)],
          components: []
        }).catch(() => {});
      }

      msg.edit({
        embeds: [new EmbedBuilder().setTitle('🚀 Elytra Flight').setColor('#f1c40f').setDescription(`Bet: **${bet}** ${EMERALD}\nMultiplier: **${session.mult.toFixed(2)}x**`)],
        components: [row]
      }).catch(() => {});
    }, 1500);
    return;
  }

  // Bot Admin Commands
  if (command === 'moneyadd') {
    if (!isBotAdmin) return message.reply('❌ Unauthorized.');
    const target = message.mentions.users.first();
    const amt = parseInt(args[1]);
    if (!target || isNaN(amt)) return message.reply('Usage: `&moneyadd @user <amount>`');
    let tData = await getUser(target.id);
    tData.Money += amt;
    await updateUser(target.id, tData);
    return message.reply(`✅ Added **${numberWithCommas(amt)}** ${EMERALD} to ${target.username}.`);
  }

  if (command === 'seecash') {
    if (!isBotAdmin) return message.reply('❌ Unauthorized.');
    const target = message.mentions.users.first();
    if (!target) return message.reply('❌ Mention a user!');
    let tData = await getUser(target.id);
    return message.reply(`💰 **${target.username}** has **${numberWithCommas(tData.Money)} KIM**!`);
  }

  if (command === 'botban') {
    if (!isBotAdmin) return message.reply('❌ Unauthorized.');
    const target = message.mentions.users.first();
    if (!target) return message.reply('❌ Mention a user!');
    let tData = await getUser(target.id);
    tData.isBanned = true;
    tData.banReason = args.slice(1).join(' ') || 'Violation of Kimo Rules';
    await updateUser(target.id, tData);
    return message.reply(`🔨 **${target.username}** has been Bot Banned.`);
  }

  if (command === 'botunban') {
    if (!isBotAdmin) return message.reply('❌ Unauthorized.');
    const target = message.mentions.users.first();
    if (!target) return message.reply('❌ Mention a user!');
    let tData = await getUser(target.id);
    tData.isBanned = false;
    tData.banReason = 'None';
    await updateUser(target.id, tData);
    return message.reply(`🔓 **${target.username}** has been Unbanned.`);
  }

  if (command === 'whois') {
    const target = message.mentions.users.first() || message.author;
    const tData = await getUser(target.id);
    const embed = new EmbedBuilder()
      .setTitle(`${isBotAdmin ? '🛡️ Admin Whois' : '👤 User Info'} — ${target.username}`)
      .setColor(isBotAdmin ? '#9b59b6' : '#3498db')
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: '🆔 ID', value: `\`${target.id}\``, inline: true },
        { name: '📅 Created', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
        { name: '🏆 Level', value: `Lvl ${tData.level || 1}`, inline: true }
      );
    if (isBotAdmin) {
      embed.addFields(
        { name: '💵 Balance', value: `${numberWithCommas(tData.Money)} KIM`, inline: true },
        { name: '🚨 Banned?', value: tData.isBanned ? `Yes (${tData.banReason})` : 'No', inline: true }
      );
    }
    return message.reply({ embeds: [embed] });
  }
});

// Button Interactions (Verify, Fly, Tickets)
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  const userId = interaction.user.id;

  if (interaction.customId === 'verify_btn') {
    await updateUser(userId, { verify: true });
    return interaction.reply({ content: '✅ Verified! All Kimo commands are now unlocked.', ephemeral: true });
  }

  if (interaction.customId.startsWith('fly_cashout_')) {
    const ownerId = interaction.customId.split('_')[2];
    if (userId !== ownerId) return interaction.reply({ content: '❌ Not your flight!', ephemeral: true });

    const session = activeFlySessions.get(userId);
    if (!session || !session.active) return interaction.reply({ content: '❌ Flight already ended!', ephemeral: true });

    session.active = false;
    activeFlySessions.delete(userId);

    const win = Math.floor(session.bet * session.mult);
    let uData = await getUser(userId);
    uData.Money += win;
    await updateUser(userId, uData);

    return interaction.update({
      embeds: [new EmbedBuilder().setTitle('🏆 Cashed Out!').setColor('#2ecc71').setDescription(`Multiplier: **${session.mult.toFixed(2)}x**\nWon: **${numberWithCommas(win)}** ${EMERALD}`)],
      components: []
    });
  }

  if (interaction.customId === 'open_ticket') {
    const existing = interaction.guild.channels.cache.find(c => c.name === `ticket-${interaction.user.username.toLowerCase()}`);
    if (existing) {
      return interaction.reply({ content: `❌ You already have an open ticket: <#${existing.id}>`, ephemeral: true });
    }

    const ticketChannel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
      ]
    });

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
    );

    const welcomeTicket = new EmbedBuilder()
      .setTitle('🎫 Support Ticket Opened')
      .setColor('#00ffcc')
      .setDescription(`Hello <@${userId}>! Please describe your issue here. Our staff team will assist you shortly.`);

    await ticketChannel.send({ content: `<@${userId}>`, embeds: [welcomeTicket], components: [closeRow] });
    return interaction.reply({ content: `✅ Ticket created: <#${ticketChannel.id}>`, ephemeral: true });
  }

  if (interaction.customId === 'close_ticket') {
    await interaction.reply('🔒 Closing ticket in 5 seconds...');
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }
});

function numberWithCommas(x) {
  return x.toString().replace(/\B(?<!\d)(\d{3})+(?!\d))/g, ",");
}

client.login(process.env.DISCORD_TOKEN);
