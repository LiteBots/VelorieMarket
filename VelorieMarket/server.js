const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); // 🟢 NOWOŚĆ: Importujemy JWT
require('dotenv').config();

// === IMPORTY WŁASNE ===
const User = require('./models/User');
const { initDiscordBot, updateDiscordStats } = require('./discordBot'); 

const app = express();
const PORT = process.env.PORT || 3000;

// 🟢 NOWOŚĆ: Tajny klucz do szyfrowania sesji (najlepiej dodać go do pliku .env)
const JWT_SECRET = process.env.JWT_SECRET || 'super-tajne-haslo-velorie-123';

// === MIDDLEWARE ===
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// === MIDDLEWARE AUTORYZACJI (Sprawdza czy użytkownik ma ważny token) ===
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ error: 'Brak dostępu. Zaloguj się.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Wygasła sesja lub nieprawidłowy token.' });
    req.user = user; // Przekazujemy odszyfrowane dane użytkownika dalej
    next();
  });
};

// === 1. POŁĄCZENIE Z BAZĄ DANYCH ===
const mongoUri = process.env.MONGO_URI || "mongodb://mongo:eEDpdgLcAnqZdjWlxNsaNYisLzJGIKmA@mongodb.railway.internal:27017";

if (!mongoUri) {
  console.error('❌ [BŁĄD KRYTYCZNY] Brak zmiennej MONGO_URI!');
} else {
  console.log(`🔍 [DEBUG] Próba połączenia z: ${mongoUri.substring(0, 20)}...`);
  mongoose.connect(mongoUri)
    .then(() => console.log('✅ [MongoDB] Połączono z bazą'))
    .catch(err => console.error('❌ [MongoDB] Błąd połączenia:', err));
}

// === 2. START BOTA DISCORD ===
try {
    initDiscordBot(); 
} catch (error) {
    console.error('❌ [Discord] Błąd inicjalizacji bota:', error.message);
}

// === 3. ROUTING STRON (FRONTEND) ===
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/market', (req, res) => res.sendFile(path.join(__dirname, 'public', 'market.html')));

// === 4. ROUTING API (BACKEND) ===

// 🟢 Pobieranie danych zalogowanego użytkownika (Zabezpieczone)
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    // req.user.id pochodzi z tokena JWT
    const user = await User.findById(req.user.id).select('-password'); // '-password' ukrywa hasło w odpowiedzi
    
    if (!user) {
      return res.status(404).json({ error: 'Nie znaleziono użytkownika.' });
    }
    
    res.json(user); // Odsyłamy całe dane (username, email, vpln, rola itp.)
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera przy pobieraniu profilu.' });
  }
});

// Rejestracja
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Wypełnij wszystkie pola.' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(409).json({ error: 'Użytkownik o takim emailu lub nazwie już istnieje.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: role || 'freelancer'
      // Tu MongoDB samo doda pole vpln: 0, jeśli zdefiniujemy je w models/User.js
    });

    await newUser.save();
    console.log(`✅ [Rejestracja] Nowy użytkownik: ${username}`);
    updateDiscordStats(); 

    // 🟢 Generowanie tokena po rejestracji (żeby od razu zalogować użytkownika)
    const token = jwt.sign(
      { id: newUser._id, username: newUser.username, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({ 
      message: 'Konto utworzone pomyślnie!',
      token: token, // Odsyłamy token
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

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Błędny email lub hasło.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Błędny email lub hasło.' });
    }

    // 🟢 Generowanie tokena
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' } // Token wygasa po 24 godzinach
    );

    res.json({ 
      message: 'Zalogowano pomyślnie!', 
      token: token, // Odsyłamy token
      redirectUrl: '/market'
    });

  } catch (err) {
    console.error('Błąd logowania:', err);
    res.status(500).json({ error: 'Błąd serwera podczas logowania.' });
  }
});

// Fallback
app.get('*', (req, res) => {
  res.redirect('/');
});

// Start serwera
app.listen(PORT, () => {
  console.log(`🚀 Serwer działa na porcie ${PORT}`);
});
