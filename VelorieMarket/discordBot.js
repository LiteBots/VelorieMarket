const { Client, GatewayIntentBits, ActivityType, Events } = require('discord.js');
const User = require('./models/User'); // Upewnij się, że ścieżka do modelu jest poprawna
require('dotenv').config();

// Inicjalizacja klienta Discord z wymaganymi intencjami
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds 
    ] 
});

// === KONFIGURACJA ===
const CHANNEL_ID = '1472391921535029413'; // Twój kanał do statystyk

// === 1. AKTUALIZACJA STATYSTYK NA KANALE ===
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

// === 2. WYSYŁANIE WIADOMOŚCI POWITALNEJ (DM) ===
const sendWelcomeDM = async (discordId) => {
    try {
        // Pobieramy usera bezpośrednio przez klienta bota
        const user = await client.users.fetch(discordId);
        
        if (user) {
            await user.send({
                embeds: [
                    {
                        title: "Autoryzacja przeszła pomyślnie!",
                        description: `> Witaj <@${discordId}> w Velorie Market, Dziękujemy za rejestracje na naszej platformie, od teraz będziesz otrzymywał/a powiadomienia o nadchodzących płatnościach oraz informacje serwisowe.`,
                        color: 16711782, // Czerwony/Różowy kolor
                        image: {
                            url: "https://i.imgur.com/dkmtI8l.png"
                        }
                    }
                ]
            });
            console.log(`✉️ [Discord] Wysłano powiadomienie DM do: ${user.tag}`);
        }
    } catch (err) {
        // Błąd 50007 oznacza, że użytkownik ma zablokowane wiadomości prywatne
        if (err.code === 50007) {
            console.warn(`⚠️ [Discord] Nie można wysłać DM do ${discordId} (Zablokowane wiadomości prywatne).`);
        } else {
            console.error('❌ [Discord] Błąd wysyłania DM:', err.message);
        }
    }
};

// === 3. INICJALIZACJA BOTA ===
const initDiscordBot = () => {
    if (!process.env.DISCORD_TOKEN) {
        console.error('❌ Brak tokenu w .env');
        return;
    }

    // Używamy Events.ClientReady zamiast 'ready', aby uniknąć DeprecationWarning
    client.once(Events.ClientReady, () => {
        console.log(`🤖 [Discord] Zalogowano jako ${client.user.tag}`);
        
        // Ustawienie statusu
        client.user.setActivity('Znajdź Specjalistę', { type: ActivityType.Watching });

        // Pierwsze uruchomienie statystyk
        updateDiscordStats();

        // Pętla co 10 min (zapobiega blokadom Rate Limit ze strony Discorda)
        setInterval(updateDiscordStats, 600000); 
    });

    // Logowanie bota
    client.login(process.env.DISCORD_TOKEN);
};

// Eksportujemy wszystkie trzy funkcje, aby móc ich używać w głównym pliku aplikacji
module.exports = { initDiscordBot, updateDiscordStats, sendWelcomeDM };
