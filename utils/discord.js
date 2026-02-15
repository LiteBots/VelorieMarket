const { Client, GatewayIntentBits } = require('discord.js');
const User = require('../models/User'); // Importujemy model bazy danych

// Inicjalizacja klienta Discord
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds] 
});

let statsChannelId = null;

// Funkcja startująca bota
const initDiscord = (token, channelId) => {
    if (!token || !channelId) {
        console.log("⚠️ Brak konfiguracji Discorda (TOKEN lub CHANNEL_ID). Bot nie wystartuje.");
        return;
    }
    
    statsChannelId = channelId;
    
    client.login(token)
        .then(() => console.log(`🤖 Discord Bot zalogowany jako ${client.user.tag}`))
        .catch(err => console.error("❌ Błąd logowania do Discorda:", err));
};

// Funkcja aktualizująca licznik
const updateDiscordStats = async () => {
    // Jeśli bot nie jest gotowy lub nie ma ID kanału, przerywamy
    if (!client.isReady() || !statsChannelId) return;

    try {
        // 1. Policz użytkowników w MongoDB
        const count = await User.countDocuments();
        
        // 2. Pobierz kanał z Discorda
        const channel = await client.channels.fetch(statsChannelId);
        
        if (channel) {
            // 3. Zmień nazwę kanału
            // UWAGA: Discord limituje zmiany nazwy kanału (Rate Limit: 2 zmiany na 10 minut).
            // Jeśli będzie dużo rejestracji, niektóre zmiany mogą zostać kolejkowe lub odrzucone,
            // ale to nie "wywali" serwera.
            await channel.setName(`Użytkownicy: ${count}`);
            console.log(`✅ [Discord] Zaktualizowano licznik na: ${count}`);
        } else {
            console.error(`❌ [Discord] Nie znaleziono kanału o ID: ${statsChannelId}`);
        }
    } catch (error) {
        console.error("❌ [Discord] Błąd aktualizacji statystyk:", error);
    }
};

// Gdy bot wstanie, zrób pierwszą aktualizację
client.once('ready', () => {
    updateDiscordStats();
});

module.exports = { initDiscord, updateDiscordStats };