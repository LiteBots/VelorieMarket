const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config(); // Wczytuje zmienne .env lokalnie (na Railway zignoruje, jeśli ich nie ma)

// === KONFIGURACJA APLIKACJI ===
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serwuje pliki statyczne (CSS, JS, img)

// Import modelu Użytkownika
const User = require('./models/User');

// === 1. POŁĄCZENIE Z BAZĄ DANYCH (MONGODB) ===
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Połączono z MongoDB'))
  .catch(err => console.error('❌ Błąd połączenia z MongoDB:', err));


// === 2. KONFIGURACJA BOTA DISCORD ===
// Bot potrzebuje intencji "Guilds", aby widzieć serwery i kanały
const discordClient = new Client({ 
  intents: [GatewayIntentBits.Guilds] 
});

// Funkcja aktualizująca statystyki na kanale Discord
const updateDiscordStats = async () => {
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    const channelId = process.env.DISCORD_CHANNEL_ID;

    // Sprawdzamy czy zmienne są ustawione
    if (!discordClient.isReady()) return;
    if (!guildId || !channelId) {
      console.warn('⚠️ Brak konfiguracji ID serwera lub kanału Discord w zmiennych środowiskowych.');
      return;
    }

    // Pobieramy serwer (Gildię)
    const guild = await discordClient.guilds.fetch(guildId);
    if (!guild) return console.error('❌ Nie znaleziono serwera Discord o podanym ID.');

    // Pobieramy kanał do edycji
    const channel = await guild.channels.fetch(channelId);
    if (!channel) return console.error('❌ Nie znaleziono kanału Discord o podanym ID.');

    // Pobieramy liczbę użytkowników z bazy danych
    const userCount = await User.countDocuments();
    
    // Zmieniamy nazwę kanału
    // UWAGA: Discord limituje zmiany nazw kanałów (Rate Limit: 2 zmiany na 10 minut)
    const newChannelName = `👥 Użytkownicy: ${userCount}`;
    
    if (channel.name !== newChannelName) {
        await channel.setName(newChannelName);
        console.log(`🤖 Zaktualizowano Discorda: "${newChannelName}"`);
    } else {
        console.log('🤖 Licznik Discorda aktualny, pomijam zmianę.');
    }

  } catch (error) {
    console.error('❌ Błąd podczas aktualizacji Discorda:', error.message);
  }
};

// Event: Gdy bot jest gotowy
discordClient.once('ready', () => {
  console.log(`🤖 Bot zalogowany jako: ${discordClient.user.tag}`);
  // Aktualizacja statystyk przy starcie serwera
  updateDiscordStats();
});

// Logowanie bota (jeśli token jest podany)
if (process.env.DISCORD_TOKEN) {
  discordClient.login(process.env.DISCORD_TOKEN)
    .catch(err => console.error('❌ Błąd logowania bota Discord:', err));
} else {
  console.warn('⚠️ Brak DISCORD_TOKEN. Bot nie zostanie uruchomiony.');
}


// === 3. ROUTING STRON (HTML) ===

// Strona główna (Landing Page)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Strona logowania i rejestracji
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});


// === 4. ROUTING API (BACKEND) ===

// Endpoint: Rejestracja
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    // Walidacja podstawowa
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Wypełnij wszystkie pola.' });
    }

    // Sprawdzenie czy użytkownik już istnieje
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(409).json({ error: 'Użytkownik o takim emailu lub nazwie już istnieje.' });
    }

    // Haszowanie hasła
    const hashedPassword = await bcrypt.hash(password, 10);

    // Tworzenie nowego użytkownika
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: role || 'freelancer'
    });

    // Zapis do bazy
    await newUser.save();
    console.log(`✅ Nowy użytkownik zarejestrowany: ${username} (${role})`);

    // 🔥 TRIGGER DISCORDA: Aktualizuj licznik po udanej rejestracji
    // Wywołujemy bez "await", żeby nie blokować odpowiedzi dla użytkownika (fire-and-forget)
    updateDiscordStats(); 

    res.status(201).json({ message: 'Rejestracja udana! Możesz się zalogować.' });

  } catch (err) {
    console.error('Błąd rejestracji:', err);
    res.status(500).json({ error: 'Wystąpił błąd serwera podczas rejestracji.' });
  }
});

// Endpoint: Logowanie
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Szukanie użytkownika
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Nieprawidłowy email lub hasło.' });
    }

    // Weryfikacja hasła
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Nieprawidłowy email lub hasło.' });
    }

    // Sukces
    res.json({ 
      message: 'Zalogowano pomyślnie!', 
      user: {
        username: user.username,
        role: user.role,
        id: user._id
      },
      redirect: '/dashboard' // Tu w przyszłości przekierujesz usera
    });

  } catch (err) {
    console.error('Błąd logowania:', err);
    res.status(500).json({ error: 'Wystąpił błąd serwera podczas logowania.' });
  }
});

// Fallback: Przekierowanie nieznanych tras na stronę główną
app.get('*', (req, res) => {
  res.redirect('/');
});

// Start serwera
app.listen(PORT, () => {
  console.log(`🚀 Serwer Velorie Market działa na porcie ${PORT}`);
  console.log(`🌍 Środowisko: ${process.env.NODE_ENV || 'development'}`);
});