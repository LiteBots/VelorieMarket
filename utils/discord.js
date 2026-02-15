const { Client, GatewayIntentBits, Events } = require('discord.js'); // Dodano Events
const User = require('../models/User');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds] 
});

let statsChannelId = null;

const initDiscord = (token, channelId) => {
    if (!token || !channelId) {
        console.log("⚠️ Brak konfiguracji Discorda. Bot nie wystartuje.");
        return;
    }
    
    statsChannelId = channelId;
    
    client.login(token).catch(err => console.error("❌ Błąd logowania do Discorda:", err));
};

// === TU BYŁA ZMIANA (używamy Events.ClientReady) ===
client.once(Events.ClientReady, (c) => {
    console.log(`🤖 Discord Bot zalogowany jako ${c.user.tag}`);
    updateDiscordStats();
});

const updateDiscordStats = async () => {
    if (!client.isReady() || !statsChannelId) return;

    try {
        const count = await User.countDocuments();
        const channel = await client.channels.fetch(statsChannelId);
        
        if (channel) {
            await channel.setName(`🚀〢Zarejestrowani : ${count}`);
            console.log(`✅ [Discord] Zaktualizowano licznik: ${count}`);
        }
    } catch (error) {
        // Ignorujemy błędy limitów czasowych (Rate Limits), są normalne przy częstych zmianach
        if (error.code !== 50013 && error.code !== 50001) { 
            console.error("❌ [Discord] Błąd aktualizacji:", error.message);
        }
    }
};

module.exports = { initDiscord, updateDiscordStats };
