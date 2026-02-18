const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

// === IMPORTY WŁASNE ===
const User = require('./models/User');
const { initDiscordBot, updateDiscordStats, sendWelcomeDM, sendAdminOTP, sendAdminSecurityAlert } = require('./discordBot'); 

const app = express();
const PORT = process.env.PORT || 3000;

// === KONFIGURACJA ZMIENNYCH ===
const JWT_SECRET = process.env.JWT_SECRET || 'super-tajne-haslo-velorie-123';
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1473749778302111856';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET; 
const DISCORD_REDIRECT_URI = 'https://www.velorie.pl/api/auth/discord/callback';

// === DANE ADMINISTRATORÓW ===
const adminUsers = {
  'zxq0': {
    password: process.env.ADMIN_PASS_GRACJAN,
    discordId: '913479364883136532'
  },
  'adambejmert': {
    password: process.env.ADMIN_PASS_ADAM,
    discordId: '810238396953264129'
  }
};

// Tymczasowe przechowywanie kodów (Discord ID -> { code, expires })
const activeOTPs = new Map();

// === MIDDLEWARE ===
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// === MIDDLEWARE AUTORYZACJI UŻYTKOWNIKA (STANDARDOWY) ===
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Brak dostępu. Zaloguj się.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Wygasła sesja.' });
    req.user = user;
    next();
  });
};

// === MIDDLEWARE AUTORYZACJI ADMINA (NOWY) ===
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Brak tokena admina.' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Nieprawidłowy token.' });
    
    // Sprawdzenie czy token ma rolę admina (nadawaną przy weryfikacji OTP)
    if (decoded.role !== 'admin') {
        return res.status(403).json({ error: 'Brak uprawnień administratora.' });
    }
    
    req.admin = decoded;
    next();
  });
};

// === 1. POŁĄCZENIE Z BAZĄ DANYCH ===
const mongoUri = process.env.MONGO_URI || "mongodb://mongo:eEDpdgLcAnqZdjWlxNsaNYisLzJGIKmA@mongodb.railway.internal:27017";

mongoose.connect(mongoUri)
  .then(() => console.log('✅ [MongoDB] Połączono z bazą'))
  .catch(err => console.error('❌ [MongoDB] Błąd połączenia:', err));

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
app.get('/admin3443', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin3443.html')));

// === 4. ROUTING API (BACKEND) ===

// ---------------------------------------------------------
// SEKCJ ADMIN API (NOWA - Obsługa Panelu)
// ---------------------------------------------------------

// A. Pobieranie listy użytkowników
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
        // Pobierz wszystkich użytkowników, posortuj od najnowszych
        // select('-password') ukrywa zahashowane hasła dla bezpieczeństwa, choć admin mógłby je widzieć
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        console.error('Błąd pobierania użytkowników:', err);
        res.status(500).json({ error: 'Błąd serwera przy pobieraniu listy.' });
    }
});

// B. Zmiana salda użytkownika (vPLN)
app.post('/api/admin/users/:id/balance', authenticateAdmin, async (req, res) => {
    try {
        const { amount } = req.body; // amount może być dodatnie lub ujemne
        const userId = req.params.id;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'Użytkownik nie istnieje.' });

        // Aktualizacja salda
        // Używamy (user.vpln || 0) na wypadek gdyby pole nie istniało
        user.vpln = (user.vpln || 0) + Number(amount);
        
        await user.save();

        res.json({ success: true, message: 'Saldo zaktualizowane', newBalance: user.vpln });
    } catch (err) {
        console.error('Błąd edycji salda:', err);
        res.status(500).json({ error: 'Błąd serwera.' });
    }
});

// C. Usuwanie użytkownika
app.delete('/api/admin/users/:id', authenticateAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const deletedUser = await User.findByIdAndDelete(userId);
        
        if (!deletedUser) return res.status(404).json({ error: 'Użytkownik nie istnieje.' });

        updateDiscordStats(); // Aktualizuj licznik na DC
        res.json({ success: true, message: 'Użytkownik usunięty.' });
    } catch (err) {
        console.error('Błąd usuwania użytkownika:', err);
        res.status(500).json({ error: 'Błąd serwera.' });
    }
});

// ---------------------------------------------------------
// KONIEC SEKCJI ADMIN API
// ---------------------------------------------------------


// --- AUTORYZACJA ADMINA (2FA DISCORD) ---
// Krok 1: Weryfikacja hasła i wysłanie OTP
app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body; 

  // SZUKAMY CZY HASŁO PASUJE DO KTÓREGOŚ ADMINA
  let foundAdmin = null;
  for (const key in adminUsers) {
    if (adminUsers[key].password === password && password !== undefined) {
      foundAdmin = adminUsers[key];
      break;
    }
  }

  // Jeśli hasło jest błędne
  if (!foundAdmin) {
    await sendAdminSecurityAlert(null, 'failed', 'Niepoprawne hasło logowania');
    return res.status(401).json({ error: 'Nieprawidłowe hasło administratora.' });
  }

  // Generowanie kodu OTP
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  
  activeOTPs.set(foundAdmin.discordId, { code: otpCode, expires: Date.now() + 5 * 60 * 1000 });

  // Wysyłamy kod na Discorda
  await sendAdminOTP(foundAdmin.discordId, otpCode);

  res.json({ message: 'Kod został wysłany na Discorda.', discordId: foundAdmin.discordId });
});

// Krok 2: Weryfikacja kodu z Discorda
app.post('/api/admin/verify', async (req, res) => { 
  const { discordId, otpCode } = req.body;
  const storedOTP = activeOTPs.get(discordId);

  if (!storedOTP) return res.status(400).json({ error: 'Brak aktywnego kodu weryfikacyjnego.' });
  if (Date.now() > storedOTP.expires) {
    activeOTPs.delete(discordId);
    return res.status(400).json({ error: 'Kod wygasł. Zaloguj się ponownie.' });
  }
  if (storedOTP.code !== otpCode) {
    await sendAdminSecurityAlert(discordId, 'failed', 'Niepoprawny kod autoryzacyjny');
    return res.status(401).json({ error: 'Nieprawidłowy kod.' });
  }

  // Pomyślna weryfikacja! 
  activeOTPs.delete(discordId); 
  
  await sendAdminSecurityAlert(discordId, 'success');

  // Token ADMINA posiada { role: 'admin' }
  const adminToken = jwt.sign({ discordId, role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
  
  res.json({ token: adminToken });
});

// Krok 3: Wylogowanie
app.post('/api/admin/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
      if (!err && decoded && decoded.discordId) {
        await sendAdminSecurityAlert(decoded.discordId, 'logout');
      }
    });
  }
  res.json({ success: true });
});

// --- AUTORYZACJA DISCORD (OAUTH2 DLA UŻYTKOWNIKÓW) ---
app.get('/api/auth/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/login?error=no_code');

  try {
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: DISCORD_REDIRECT_URI,
    }), { 
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' } 
    });

    const accessToken = tokenResponse.data.access_token;

    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const dUser = userResponse.data;
    const avatarUrl = dUser.avatar 
      ? `https://cdn.discordapp.com/avatars/${dUser.id}/${dUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${dUser.discriminator % 5}.png`;

    let user = await User.findOne({ $or: [{ discordId: dUser.id }, { email: dUser.email }] });
    let isNewUser = false;

    if (!user) {
      user = new User({
        username: dUser.username,
        email: dUser.email,
        discordId: dUser.id,
        avatar: avatarUrl,
        role: 'freelancer', 
        vpln: 0
      });
      await user.save();
      updateDiscordStats();
      isNewUser = true; 
    } else {
      if (!user.discordId) isNewUser = true; 
      user.discordId = dUser.id;
      user.avatar = avatarUrl;
      await user.save();
    }

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    if (isNewUser) {
        sendWelcomeDM(dUser.id);
    }

    res.redirect(`/market?token=${token}`);

  } catch (error) {
    console.error('🔴 [Discord Auth] Błąd:', error.response?.data || error.message);
    res.redirect('/login?error=auth_failed');
  }
});

// Pobieranie danych profilu
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'Nie znaleziono użytkownika.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera.' });
  }
});

// Tradycyjna Rejestracja
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Pola są wymagane.' });

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) return res.status(409).json({ error: 'Użytkownik już istnieje.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: role || 'freelancer'
    });

    await newUser.save();
    updateDiscordStats(); 

    const token = jwt.sign({ id: newUser._id, username: newUser.username, role: newUser.role }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ token, redirectUrl: '/market' });
  } catch (err) {
    res.status(500).json({ error: 'Błąd rejestracji.' });
  }
});

// Tradycyjne Logowanie
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.password) return res.status(401).json({ error: 'Błędne dane logowania.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Błędne dane logowania.' });

    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, redirectUrl: '/market' });
  } catch (err) {
    res.status(500).json({ error: 'Błąd logowania.' });
  }
});

// Fallback
app.get('*', (req, res) => res.redirect('/'));

app.listen(PORT, () => console.log(`🚀 Serwer działa na porcie ${PORT}`));
