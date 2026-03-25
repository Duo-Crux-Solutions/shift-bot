// ============================================
//   SHIFT AUTO-ASSIGN BOT
//   Made for 3-shift company Discord server
// ============================================

const { Client, GatewayIntentBits, PermissionsBitField, SlashCommandBuilder, REST, Routes } = require('discord.js');

// ─── CONFIG — FILL THESE IN ───────────────────────────────────────────────────
const TOKEN = process.env.TOKEN;
const CLIENT_ID    = process.env.CLIENT_ID;
const GUILD_ID     = process.env.GUILD_ID;
const OWNER_ID     = process.env.OWNER_ID;

const ROLE_IDS = {
  morning : process.env.MORNING_ROLE_ID,
  evening : process.env.EVENING_ROLE_ID,
  night   : process.env.NIGHT_ROLE_ID,
};

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
// ──────────────────────────────────────────────────────────────────────────────

// In-memory employee list (user ID → shift)
// Persists as long as bot is running. See bottom of file for JSON file option.
const employeeList = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

// ─── SLASH COMMANDS DEFINITION ───────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('addemployee')
    .setDescription('Add an employee to the pre-approved shift list')
    .addUserOption(opt =>
      opt.setName('user').setDescription('Tag the employee').setRequired(true))
    .addStringOption(opt =>
      opt.setName('shift').setDescription('Their shift').setRequired(true)
        .addChoices(
          { name: '🌅 Morning', value: 'morning' },
          { name: '🌆 Evening', value: 'evening' },
          { name: '🌙 Night',   value: 'night'   },
        )),

  new SlashCommandBuilder()
    .setName('removeemployee')
    .setDescription('Remove an employee from the pre-approved list')
    .addUserOption(opt =>
      opt.setName('user').setDescription('Tag the employee').setRequired(true)),

  new SlashCommandBuilder()
    .setName('listemployees')
    .setDescription('View the full pre-approved employee list'),

  new SlashCommandBuilder()
    .setName('changeshift')
    .setDescription('Change an existing employee\'s shift')
    .addUserOption(opt =>
      opt.setName('user').setDescription('Tag the employee').setRequired(true))
    .addStringOption(opt =>
      opt.setName('shift').setDescription('New shift').setRequired(true)
        .addChoices(
          { name: '🌅 Morning', value: 'morning' },
          { name: '🌆 Evening', value: 'evening' },
          { name: '🌙 Night',   value: 'night'   },
        )),
];

// ─── REGISTER COMMANDS ON STARTUP ────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Bot online as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands.map(c => c.toJSON()),
    });
    console.log('✅ Slash commands registered');
  } catch (err) {
    console.error('❌ Command registration failed:', err);
  }
});

// ─── AUTO-ASSIGN ON JOIN ─────────────────────────────────────────────────────
client.on('guildMemberAdd', async (member) => {
  const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);

  const shift = employeeList.get(member.id);

  if (!shift) {
    // Person joined but NOT on the pre-approved list
    console.log(`⚠️  Unknown join: ${member.user.tag} (${member.id})`);
    if (logChannel) {
      logChannel.send(
        `⚠️ **Unknown member joined:** ${member.user.tag} (\`${member.id}\`)\n` +
        `They are NOT on the pre-approved list. No role assigned.\n` +
        `Use \`/addemployee\` then ask them to rejoin, or assign manually.`
      );
    }
    return;
  }

  const roleId = ROLE_IDS[shift];
  try {
    await member.roles.add(roleId);
    console.log(`✅ Assigned ${shift} to ${member.user.tag}`);
    if (logChannel) {
      const shiftEmoji = { morning: '🌅', evening: '🌆', night: '🌙' }[shift];
      logChannel.send(
        `✅ **Auto-assigned:** ${member.user.tag}\n` +
        `${shiftEmoji} Shift: **${shift.charAt(0).toUpperCase() + shift.slice(1)}**`
      );
    }
  } catch (err) {
    console.error(`❌ Could not assign role to ${member.user.tag}:`, err);
    if (logChannel) {
      logChannel.send(`❌ **Role assign failed** for ${member.user.tag}. Check bot permissions.`);
    }
  }
});

// ─── SLASH COMMAND HANDLERS ──────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Only Owner can use these commands
  if (interaction.user.id !== OWNER_ID) {
    return interaction.reply({
      content: '❌ Sirf server owner yeh commands use kar sakta hai.',
      ephemeral: true,
    });
  }

  const { commandName } = interaction;

  // ── /addemployee ──
  if (commandName === 'addemployee') {
    const user  = interaction.options.getUser('user');
    const shift = interaction.options.getString('shift');
    employeeList.set(user.id, shift);

    const shiftEmoji = { morning: '🌅', evening: '🌆', night: '🌙' }[shift];
    await interaction.reply({
      content: `✅ **${user.tag}** pre-approved list mein add ho gaya.\n${shiftEmoji} Shift: **${shift}**\nAb jab woh server join karein, auto-assign ho jaega.`,
      ephemeral: true,
    });
  }

  // ── /removeemployee ──
  else if (commandName === 'removeemployee') {
    const user = interaction.options.getUser('user');
    if (!employeeList.has(user.id)) {
      return interaction.reply({ content: `⚠️ **${user.tag}** list mein nahi hai.`, ephemeral: true });
    }
    employeeList.delete(user.id);
    await interaction.reply({ content: `🗑️ **${user.tag}** list se remove kar diya.`, ephemeral: true });
  }

  // ── /listemployees ──
  else if (commandName === 'listemployees') {
    if (employeeList.size === 0) {
      return interaction.reply({ content: '📋 List abhi khali hai.', ephemeral: true });
    }
    const shiftEmoji = { morning: '🌅', evening: '🌆', night: '🌙' };
    let msg = '**📋 Pre-Approved Employee List:**\n\n';
    for (const [userId, shift] of employeeList.entries()) {
      msg += `${shiftEmoji[shift]} <@${userId}> — ${shift}\n`;
    }
    await interaction.reply({ content: msg, ephemeral: true });
  }

  // ── /changeshift ──
  else if (commandName === 'changeshift') {
    const user     = interaction.options.getUser('user');
    const newShift = interaction.options.getString('shift');

    // Update list
    employeeList.set(user.id, newShift);

    // If member is already in the server, swap roles live
    const member = interaction.guild.members.cache.get(user.id);
    if (member) {
      const allShiftRoles = Object.values(ROLE_IDS);
      await member.roles.remove(allShiftRoles).catch(() => {});
      await member.roles.add(ROLE_IDS[newShift]).catch(() => {});
    }

    const shiftEmoji = { morning: '🌅', evening: '🌆', night: '🌙' }[newShift];
    await interaction.reply({
      content: `🔄 **${user.tag}** ka shift update ho gaya.\n${shiftEmoji} New shift: **${newShift}**`,
      ephemeral: true,
    });
  }
});

// ─── LOGIN ───────────────────────────────────────────────────────────────────
client.login(TOKEN);
