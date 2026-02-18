const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config(); // Ładowanie zmiennych środowiskowych z pliku .env

// === IMPORTY WŁASNE ===
// Importujemy model użytkownika oraz logikę bota z osobnego pliku
const User = require('./models/User');
const { initDiscordBot, updateDiscordStats } = require('./discordBot'); 

const app = express();
const PORT = process.env.PORT || 3000;

// === MIDDLEWARE ===
app.use(bodyParser.json());
// Udostępniamy folder 'public' dla plików statycznych (CSS, obrazy, skrypty JS)
app.use(express.static(path.join(__dirname, 'public')));

// === 1. POŁĄCZENIE Z BAZĄ DANYCH (Z DIAGNOSTYKĄ) ===
// Najpierw szuka linku w pliku .env (MONGO_URI), a jeśli go tam nie ma, używa tego z Railway
const mongoUri = process.env.MONGO_URI || "mongodb://mongo:eEDpdgLcAnqZdjWlxNsaNYisLzJGIKmA@mongodb.railway.internal:27017";

if (!mongoUri) {
  console.error('❌ [BŁĄD KRYTYCZNY] Brak zmiennej MONGO_URI! Sprawdź plik .env lub konfigurację kontenera.');
} else {
  // Wyświetlamy tylko początek adresu dla celów debugowania (bezpieczeństwo)
  console.log(`🔍 [DEBUG] Próba połączenia z: ${mongoUri.substring(0, 20)}...`);
  
  mongoose.connect(mongoUri)
    .then(() => console.log('✅ [MongoDB] Połączono z bazą'))
    .catch(err => {
        console.error('❌ [MongoDB] Błąd połączenia:', err);
        // Opcjonalnie: process.exit(1); // Zatrzymaj serwer, jeśli baza nie działa
    });
}

// === 2. START BOTA DISCORD ===
// Uruchamiamy bota (logika jest w pliku discordBot.js)
try {
    initDiscordBot(); 
} catch (error) {
    console.error('❌ [Discord] Błąd inicjalizacji bota:', error.message);
}

// === 3. ROUTING STRON (FRONTEND) ===

// Strona Główna -> https://www.velorie.pl/
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Strona Logowania -> https://www.velorie.pl/login
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Strona Marketu -> https://www.velorie.pl/market
app.get('/market', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'market.html'));
});


// === 4. ROUTING API (BACKEND) ===

// Rejestracja
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    // Walidacja
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Wypełnij wszystkie pola.' });
    }

    // Sprawdzenie duplikatów
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(409).json({ error: 'Użytkownik o takim emailu lub nazwie już istnieje.' });
    }

    // Haszowanie hasła
    const hashedPassword = await bcrypt.hash(password, 10);

    // Zapis do bazy
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: role || 'freelancer'
    });

    await newUser.save();
    console.log(`✅ [Rejestracja] Nowy użytkownik: ${username}`);

    // 🔥 Aktualizacja Discorda (z pliku discordBot.js)
    updateDiscordStats(); 

    // SUKCES - Dodany redirectUrl do /market
    res.status(201).json({ 
      message: 'Konto utworzone pomyślnie!',
      redirectUrl: '/market'
    });

  } catch (err) {
    console.error('Błąd rejestracji:', err);
    res.status(500).json({ error: 'Błąd serwera podczas rejestracji.' });
  }
});

// Logowanie
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Szukanie usera
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Błędny email lub hasło.' });
    }

    // Weryfikacja hasła
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Błędny email lub hasło.' });
    }

    // SUKCES - Zmieniony redirectUrl na /market
    res.json({ 
      message: 'Zalogowano pomyślnie!', 
      user: { 
        username: user.username, 
        role: user.role 
      },
      redirectUrl: '/market'
    });

  } catch (err) {
    console.error('Błąd logowania:', err);
    res.status(500).json({ error: 'Błąd serwera podczas logowania.' });
  }
});

// Fallback: Jeśli ktoś wpisze dziwny adres, wraca na główną
app.get('*', (req, res) => {
  res.redirect('/');
});

// Start serwera
app.listen(PORT, () => {
  console.log(`🚀 Serwer działa na porcie ${PORT}`);
});
