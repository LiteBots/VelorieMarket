const { Client, GatewayIntentBits } = require('discord.js');
const User = require('./models/User'); // Import modelu User, aby liczyć osoby
require('dotenv').config();

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds] 
});

// === KONFIGURACJA ===
// Wklej tutaj ID kanału, którego nazwę chcesz zmieniać.
// Kliknij Prawym na kanał w Discordzie -> "Kopiuj ID kanału" (musisz mieć włączony tryb dewelopera)
const CHANNEL_ID = 'TU_WKLEJ_SWOJE_ID_KANALU'; // np. '120938120938120938'

// === FUNKCJA AKTUALIZUJĄCA ===
const updateDiscordStats = async () => {
    try {
        // Jeśli bot nie jest połączony, nie robimy nic
        if (!client.isReady()) return;

        // 1. Pobieramy liczbę użytkowników z bazy MongoDB
        const userCount = await User.countDocuments();

        // 2. Pobieramy kanał z Discorda
        const channel = await client.channels.fetch(CHANNEL_ID);
        
        if (channel) {
            // Nowa nazwa kanału
            const newName = `🚀〢Zarejestrowani: ${userCount}`;

            // Sprawdzamy, czy nazwa faktycznie jest inna (żeby nie marnować limitów API)
            if (channel.name !== newName) {
                await channel.setName(newName);
                console.log(`🤖 [Discord] Zmieniono nazwę kanału na: "${newName}"`);
            }
        }
    } catch (err) {
        // Obsługa błędów specyficznych dla Discorda
        if (err.code === 50013) {
            console.error('❌ [Discord] Brak uprawnień! Bot musi mieć uprawnienie "Manage Channels" (Zarządzanie kanałami).');
        } else if (err.status === 429) {
            console.warn('⏳ [Discord] Rate Limit (zbyt częste zmiany). Czekam na odnowienie limitu...');
        } else {
            console.error('❌ [Discord] Błąd aktualizacji:', err.message);
        }
    }
};

// === INICJALIZACJA BOTA ===
const initDiscordBot = () => {
    // Logowanie bota
    client.login(process.env.DISCORD_TOKEN);

    client.once('ready', () => {
        console.log(`🤖 [Discord] Zalogowano pomyślnie jako ${client.user.tag}`);
        
        // 1. Pierwsza aktualizacja natychmiast po starcie serwera
        updateDiscordStats();

        // 2. Automatyczna pętla aktualizacji co 10 minut (600 000 ms)
        // Discord pozwala na zmianę nazwy kanału tylko 2 razy na 10 minut.
        setInterval(() => {
            updateDiscordStats();
        }, 600000); 
    });
};

module.exports = { initDiscordBot, updateDiscordStats };
