require('dotenv').config(); // Load environment variables from .env file
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const express = require('express');

// Express setup for Render 24/7 Uptime
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is running 24/7 successfully!');
});

app.listen(PORT, () => {
    console.log(`Uptime server is listening on port ${PORT}`);
});

// Load credentials securely from environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!DISCORD_TOKEN || !CLIENT_ID) {
    console.error("ERROR: Missing DISCORD_TOKEN or CLIENT_ID in environment variables.");
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const commands = [
    new SlashCommandBuilder()
        .setName('nexora')
        .setDescription('Bypass and whitelist Free Fire UID (Owner Only)')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Select whitelist type (Free or Premium)')
                .setRequired(true)
                .addChoices(
                    { name: '🟢 Free (24 Hours)', value: 'free' },
                    { name: '💎 Premium', value: 'premium' }
                ))
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Select duration (Only for Premium)')
                .setRequired(false)
                .addChoices(
                    { name: '3 Days', value: '3 Days' },
                    { name: '30 Days', value: '30 Days' },
                    { name: 'Permanent / Lifetime', value: 'Permanent' }
                ))
        .addStringOption(option =>
            option.setName('uid')
                .setDescription('Enter 8-digit Free Fire UID')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('cleanall')
        .setDescription('Clear all messages in the channel (Owner Only)'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all available bot commands and descriptions')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}!`);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

function isOwner(interactionOrMessage) {
    const member = interactionOrMessage.member;
    const guild = interactionOrMessage.guild;
    if (!member || !guild) return false;
    return member.permissions.has(PermissionFlagsBits.Administrator) || member.id === guild.ownerId;
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📜 Bot Command Guide')
            .setDescription('Here is the list of available commands:')
            .addFields(
                { name: '/nexora', value: 'Select type (Free/Premium), duration, and enter UID to whitelist (Owner Only)' },
                { name: '/cleanall', value: 'Deletes and cleans all messages in the current channel (Owner Only)' },
                { name: '/help', value: 'Displays this help menu' }
            )
            .setTimestamp();
        return await interaction.reply({ embeds: [helpEmbed], ephemeral: false });
    }

    if (!isOwner(interaction)) {
        try {
            if (interaction.deletable) await interaction.message?.delete();
        } catch (e) {}
        return await interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    if (commandName === 'cleanall') {
        await interaction.deferReply({ ephemeral: true });
        try {
            let fetched;
            do {
                fetched = await interaction.channel.messages.fetch({ limit: 100 });
                if (fetched.size > 0) {
                    await interaction.channel.bulkDelete(fetched, true);
                }
            } while (fetched.size >= 2);

            await interaction.editReply('✅ Channel messages have been successfully cleaned.');
        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ Failed to clean messages.');
        }
    }

    if (commandName === 'nexora') {
        const type = interaction.options.getString('type');
        const selectedDuration = interaction.options.getString('duration');
        const targetUid = interaction.options.getString('uid');

        if (!targetUid || targetUid.length < 5) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Invalid UID Format')
                .setDescription('Please provide a valid 8-digit Free Fire UID.');
            return await interaction.reply({ embeds: [errorEmbed], ephemeral: false });
        }

        let durationText = '24 Hours (Free)';
        let embedColor = '#00FF00';

        if (type === 'premium') {
            embedColor = '#FFD700';
            durationText = selectedDuration ? selectedDuration : '30 Days';
        }

        await interaction.reply({ content: '🔄 Processing UID, please wait...', ephemeral: false });

        try {
            const formData = new URLSearchParams();
            formData.append('action', 'add_uid');
            formData.append('uid', targetUid);
            formData.append('type', type);
            formData.append('duration', durationText);

            await axios.post('https://excheatsofficial.xyz/dashboard', formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0',
                    'Origin': 'https://excheatsofficial.xyz',
                    'Referer': 'https://excheatsofficial.xyz/dashboard'
                }
            });

            const successEmbed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(type === 'premium' ? '💎 Premium UID Whitelisted Successfully' : '✅ Free UID Whitelisted Successfully')
                .addFields(
                    { name: '👤 User', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '🎮 Gaming UID', value: `\`${targetUid}\``, inline: true },
                    { name: '⏳ Duration', value: `\`${durationText}\``, inline: true },
                    { name: '🛠️ Status', value: 'Successfully synchronized with V1 & V2 Gateway.' }
                )
                .setTimestamp();

            await interaction.editReply({ content: null, embeds: [successEmbed] });

        } catch (error) {
            console.error("API Error:", error.message);
            const failEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Whitelist Failed')
                .setDescription(`Failed to whitelist the UID.\n**Reason:** \`${error.message}\``);

            await interaction.editReply({ content: null, embeds: [failEmbed] });
        }
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const hasLink = /https?:\/\/|[a-zA-Z0-9][-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi.test(message.content) || message.content.includes('discord.gg/');
    const member = message.member;
    const guild = message.guild;
    
    const userIsOwner = member && guild && (member.permissions.has(PermissionFlagsBits.Administrator) || member.id === guild.ownerId);

    if (!userIsOwner && (hasLink || message.content.length > 0)) {
        try {
            await message.delete();
        } catch (e) {}
    }
});

client.login(DISCORD_TOKEN);
