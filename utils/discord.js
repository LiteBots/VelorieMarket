const { Client, GatewayIntentBits } = require('discord.js');
const User = require('../models/User'); // Upewnij się, że ścieżka jest poprawna

let discordClient;
let statsChannelId;

function initDiscord(token, channelId) {
    discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });
    statsChannelId = channelId;

    discordClient.once('ready', () => {
        console.log(`🤖 Discord Bot zalogowany jako ${discordClient.user.tag}`);
        updateDiscordStats();
    });

    discordClient.login(token);
}

async function updateDiscordStats() {
    if (!discordClient || !statsChannelId) return;

    try {
        const channel = await discordClient.channels.fetch(statsChannelId);
        if (!channel) {
            console.log("❌ [Discord] Nie znaleziono kanału o podanym ID");
            return;
        }

        // KLUCZOWY MOMENT: Liczenie użytkowników w bazie
        const count = await User.countDocuments(); 
        
        await channel.setName(`Użytkownicy: ${count}`);
        console.log(`✅ [Discord] Zaktualizowano licznik: ${count}`);
    } catch (err) {
        console.error("❌ [Discord] Błąd podczas aktualizacji licznika:", err.message);
    }
}

module.exports = { initDiscord, updateDiscordStats };
