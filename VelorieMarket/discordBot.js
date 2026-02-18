const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const User = require('./models/User'); // Upewnij się, że ścieżka do modelu jest poprawna
require('dotenv').config();

// Inicjalizacja klienta z odpowiednimi uprawnieniami
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildPresences // Wymagane czasem do poprawnego odświeżania statusu
    ] 
});

// === KONFIGURACJA ===
// PAMIĘTAJ: Wklej tutaj prawdziwe ID kanału głosowego lub tekstowego
const CHANNEL_ID = 'TU_WKLEJ_SWOJE_ID_KANALU'; 

// === FUNKCJA AKTUALIZUJĄCA ===
const updateDiscordStats = async () => {
    try {
        // Jeśli bot nie jest połączony, nie robimy nic
        if (!client.isReady()) return;

        // 1. Pobieramy liczbę użytkowników z bazy MongoDB
        // UWAGA: To zadziała tylko, jeśli w pliku głównym (server.js/app.js) nawiązano połączenie mongoose.connect()
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
        } else {
            console.error(`❌ [Discord] Nie znaleziono kanału o ID: ${CHANNEL_ID}. Sprawdź konfigurację.`);
        }
    } catch (err) {
        // Obsługa błędów specyficznych dla Discorda i Bazy Danych
        if (err.code === 50013) {
            console.error('❌ [Discord] Brak uprawnień! Bot musi mieć uprawnienie "Manage Channels" (Zarządzanie kanałami) na serwerze.');
        } else if (err.status === 429) {
            console.warn('⏳ [Discord] Rate Limit (zbyt częste zmiany). Czekam na odnowienie limitu...');
        } else {
            console.error('❌ [Discord] Błąd aktualizacji (może brak połączenia z MongoDB?):', err.message);
        }
    }
};

// === INICJALIZACJA BOTA ===
const initDiscordBot = () => {
    // Sprawdzenie czy token istnieje
    if (!process.env.DISCORD_TOKEN) {
        console.error('❌ [Discord] Brak DISCORD_TOKEN w pliku .env!');
        return;
    }

    // Logowanie bota
    client.login(process.env.DISCORD_TOKEN);

    client.once('ready', () => {
        console.log(`🤖 [Discord] Zalogowano pomyślnie jako ${client.user.tag}`);
        
        // --- 🟢 NOWE: Ustawienie statusu "Ogląda Znajdź Specjalistę" ---
        client.user.setActivity('Znajdź Specjalistę', { type: ActivityType.Watching });

        // 1. Pierwsza aktualizacja natychmiast po starcie
        updateDiscordStats();

        // 2. Automatyczna pętla aktualizacji co 10 minut (600 000 ms)
        setInterval(() => {
            updateDiscordStats();
        }, 600000); 
    });
};

module.exports = { initDiscordBot, updateDiscordStats };
