const { Client, GatewayIntentBits, ActivityType, Events } = require('discord.js'); // 🟢 Dodano import 'Events'
const User = require('./models/User'); // Upewnij się, że ścieżka jest dobra
require('dotenv').config();

// 1. NAPRAWA BŁĘDU: Usunąłem 'GuildPresences', zostawiłem tylko 'Guilds'
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds 
    ] 
});

// === KONFIGURACJA ===
const CHANNEL_ID = '1472391921535029413'; // Twój kanał do statystyk

const updateDiscordStats = async () => {
    try {
        if (!client.isReady()) return;

        // Pobieramy liczbę userów z bazy
        const userCount = await User.countDocuments();

        // Pobieramy kanał
        const channel = await client.channels.fetch(CHANNEL_ID);
        
        if (channel) {
            const newName = `🚀〢Zarejestrowani: ${userCount}`;
            if (channel.name !== newName) {
                await channel.setName(newName);
                console.log(`🤖 [Discord] Zmieniono nazwę kanału na: "${newName}"`);
            }
        }
    } catch (err) {
        if (err.code === 50013) {
            console.error('❌ [Discord] Brak uprawnień! Bot nie ma "Manage Channels".');
        } else if (err.status === 429) {
            console.warn('⏳ [Discord] Rate Limit. Czekam...');
        } else {
            // Ignorujemy błędy, jeśli baza jeszcze nie wstała przy starcie
            console.error('⚠️ [Discord] Błąd aktualizacji:', err.message);
        }
    }
};

const initDiscordBot = () => {
    if (!process.env.DISCORD_TOKEN) {
        console.error('❌ Brak tokenu w .env');
        return;
    }

    // 🟢 ZMIANA: Używamy Events.ClientReady zamiast 'ready', aby pozbyć się ostrzeżenia (DeprecationWarning)
    client.once(Events.ClientReady, () => {
        console.log(`🤖 [Discord] Zalogowano jako ${client.user.tag}`);
        
        // 2. NOWOŚĆ: Ustawienie statusu "Ogląda Znajdź Specjalistę"
        client.user.setActivity('Znajdź Specjalistę', { type: ActivityType.Watching });

        // Pierwsze uruchomienie statystyk
        updateDiscordStats();

        // Pętla co 10 min (zapobiega blokadom Rate Limit ze strony Discorda)
        setInterval(updateDiscordStats, 600000); 
    });

    // Najpierw deklarujemy nasłuchiwanie zdarzeń, a dopiero na końcu logujemy bota
    client.login(process.env.DISCORD_TOKEN);
};

module.exports = { initDiscordBot, updateDiscordStats };
