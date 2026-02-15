const { Client, GatewayIntentBits } = require('discord.js');
const User = require('./models/User'); // Importujemy model, by liczyć userów
require('dotenv').config();

// Konfiguracja Klienta Discord
const client = new Client({ 
  intents: [GatewayIntentBits.Guilds] 
});

// Funkcja główna: Aktualizacja licznika
const updateDiscordStats = async () => {
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    const channelId = process.env.DISCORD_CHANNEL_ID;

    if (!client.isReady()) return;
    if (!guildId || !channelId) {
        console.warn('⚠️ Brak konfiguracji ID Discorda w .env');
        return;
    }

    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);

    const userCount = await User.countDocuments();
    const newName = `👥 Użytkownicy: ${userCount}`;

    if (channel.name !== newName) {
        await channel.setName(newName);
        console.log(`🤖 [Discord] Zmieniono nazwę kanału na: "${newName}"`);
    }

  } catch (error) {
    console.error('❌ [Discord] Błąd aktualizacji:', error.message);
  }
};

// Inicjalizacja bota
const initDiscordBot = () => {
  if (!process.env.DISCORD_TOKEN) {
    console.warn('⚠️ Brak DISCORD_TOKEN. Bot wyłączony.');
    return;
  }

  client.once('clientReady', () => {
    console.log(`🤖 [Discord] Zalogowano jako ${client.user.tag}`);
    updateDiscordStats(); // Pierwsze odświeżenie po starcie
  });

  client.login(process.env.DISCORD_TOKEN);
};

// Eksportujemy funkcję inicjującą oraz funkcję do wywoływania update'u ręcznie (przy rejestracji)
module.exports = { initDiscordBot, updateDiscordStats };
