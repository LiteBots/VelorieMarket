const { Client, GatewayIntentBits } = require('discord.js');
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
    
    client.login(token)
        .then(() => console.log(`🤖 Discord Bot zalogowany jako ${client.user.tag}`))
        .catch(err => console.error("❌ Błąd logowania do Discorda:", err));
};

const updateDiscordStats = async () => {
    if (!client.isReady() || !statsChannelId) return;

    try {
     
        const count = await User.countDocuments();
        
       
        const channel = await client.channels.fetch(statsChannelId);
        
        if (channel) {
        
            await channel.setName(`🚀〢Zarejestrowani : ${count}`);
            
            console.log(`✅ [Discord] Zaktualizowano licznik: ${count}`);
        } else {
            console.error(`❌ [Discord] Nie znaleziono kanału o ID: ${statsChannelId}`);
        }
    } catch (error) {
       
        console.error("❌ [Discord] Błąd aktualizacji:", error.message);
    }
};

client.once('ready', () => {
    updateDiscordStats();
});

module.exports = { initDiscord, updateDiscordStats };
