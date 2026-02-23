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
const InfoBar = require('./models/InfoBar'); 
const Transaction = require('./models/Transaction'); 
const Listing = require('./models/Listing'); // <--- DODANO MODEL OGŁOSZEŃ
const { initDiscordBot, updateDiscordStats, sendWelcomeDM, sendAdminOTP, sendAdminSecurityAlert } = require('./discordBot'); 

const app = express();
const PORT = process.env.PORT || 3000;

// === KONFIGURACJA ZMIENNYCH ===
const JWT_SECRET = process.env.JWT_SECRET || 'super-tajne-haslo-velorie-123';
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1473749778302111856';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET; 
const DISCORD_REDIRECT_URI = 'https://www.velorie.pl/api/auth/discord/callback';

const VERIFICATION_PRICE = 29.99; // Cena za weryfikację profilu w vPLN

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
// SEKCJA SKLEP UŻYTKOWNIKA (Market)
// ---------------------------------------------------------

// --- ZAKUP WERYFIKACJI ---
app.post('/api/shop/buy-verification', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'Użytkownik nie istnieje.' });
        
        if (user.vpln < VERIFICATION_PRICE) {
            return res.status(400).json({ error: 'Niewystarczające środki vPLN.' });
        }
        
        if (user.verificationStatus === 'pending') {
            return res.status(400).json({ error: 'Twoje zgłoszenie jest już przetwarzane.' });
        }
        
        if (user.verificationStatus === 'active') {
            return res.status(400).json({ error: 'Posiadasz już aktywną weryfikację.' });
        }

        // Pobranie opłaty
        user.vpln -= VERIFICATION_PRICE;
        user.verificationStatus = 'pending';

        // ZAPIS TRANSAKCJI DO HISTORII
        const transaction = new Transaction({
            userId: user._id,
            type: 'spent',
            currency: 'vPLN',
            amount: -VERIFICATION_PRICE, // zapis na minusie dla wydatku w sklepie
            description: 'Zakup znaczka weryfikacji'
        });

        await user.save();
        await transaction.save(); // Zapisujemy ślad po wydatku!

        res.json({ success: true, message: 'Zakupiono pomyślnie. Oczekiwanie na akceptację admina.' });
    } catch (err) {
        console.error('Błąd zakupu weryfikacji:', err);
        res.status(500).json({ error: 'Błąd serwera podczas zakupu.' });
    }
});


// ---------------------------------------------------------
// SEKCJA OGŁOSZEŃ (Listings - Zlecenia i Freelancerzy)
// ---------------------------------------------------------

// --- DODAWANIE OGŁOSZENIA (Zlecenie lub Profil) ---
app.post('/api/listings', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'Użytkownik nie istnieje.' });

        const newListing = new Listing({
            authorId: user._id,
            authorName: user.username,
            authorAvatar: user.avatar,
            ...req.body // spread operator ładuje wszystkie dane z formularza (title, type, budget itp.)
        });

        await newListing.save();
        res.status(201).json({ success: true, message: 'Ogłoszenie dodane pomyślnie!', listing: newListing });
    } catch (err) {
        console.error('Błąd dodawania ogłoszenia:', err);
        res.status(500).json({ error: 'Wystąpił błąd serwera podczas zapisywania ogłoszenia.' });
    }
});

// --- POBIERANIE OGŁOSZEŃ ---
app.get('/api/listings', async (req, res) => {
    try {
        const { type } = req.query; // 'job' lub 'freelancer'
        const query = type ? { type } : {};
        
        // Pobieramy od najnowszych
        const listings = await Listing.find(query).sort({ createdAt: -1 });
        res.json(listings);
    } catch (err) {
        console.error('Błąd pobierania ogłoszeń:', err);
        res.status(500).json({ error: 'Wystąpił błąd serwera podczas pobierania ogłoszeń.' });
    }
});


// ---------------------------------------------------------
// SEKCJA ADMIN API (Obsługa Panelu)
// ---------------------------------------------------------

// --- DASHBOARD STATYSTYKI ---
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
    try {
        // 1. Użytkownicy w bazie
        const totalUsers = await User.countDocuments();

        // 2. Konta zweryfikowane (isVerified: true)
        const verifiedUsers = await User.countDocuments({ isVerified: true });

        // 3. Profile Freelancerów
        const freelancerProfiles = await User.countDocuments({ role: 'freelancer' });

        // 4. Posiadane vPLN (Suma w portfelach wszystkich użytkowników)
        const vplnAggregate = await User.aggregate([
            { $group: { _id: null, totalVpln: { $sum: "$vpln" } } }
        ]);
        const vplnOwned = vplnAggregate.length > 0 ? vplnAggregate[0].totalVpln : 0;

        // 5. Zarobek PLN (Tymczasowe 0, do zrobienia w przyszłości)
        const plnEarned = 0; 
        
        // 6. Wydane vPLN (Zliczanie z modelu Transaction)
        const spentAggregate = await Transaction.aggregate([
            { $match: { currency: 'vPLN', type: 'spent' } },
            { $group: { _id: null, total: { $sum: { $abs: "$amount" } } } } // Użyto $abs dla ujemnych
        ]);
        const vplnSpent = spentAggregate.length > 0 ? spentAggregate[0].total : 0;

        // 7. Aktywne Bannery
        const activeBanners = 0; // Tymczasowe 0

        // 8. Aktywne Portfolia
        const activePortfolios = 0; // Tymczasowe 0

        // 9. Ogłoszenia zleceń
        const jobAds = await Listing.countDocuments({ type: 'job' }); // <-- Zaktualizowano!

        res.json({
            totalUsers,
            plnEarned,
            vplnSpent,
            vplnOwned,
            verifiedUsers,
            activeBanners,
            activePortfolios,
            jobAds,
            freelancerProfiles
        });

    } catch (err) {
        console.error('Błąd pobierania statystyk:', err);
        res.status(500).json({ error: 'Błąd podczas liczenia statystyk.' });
    }
});


// --- ZARZĄDZANIE WERYFIKACJAMI PROFILI ---

// A. Pobieranie listy osób do weryfikacji i już zweryfikowanych
app.get('/api/admin/verifications', authenticateAdmin, async (req, res) => {
    try {
        const users = await User.find({ 
            verificationStatus: { $in: ['pending', 'active'] } 
        }).select('username email avatar verificationStatus verifiedUntil vpln discordId');
        res.json(users);
    } catch (err) {
        console.error('Błąd pobierania weryfikacji:', err);
        res.status(500).json({ error: 'Błąd bazy danych.' });
    }
});

// B. Akceptacja zgłoszenia (Przyznaj weryfikację)
app.post('/api/admin/verifications/approve/:id', authenticateAdmin, async (req, res) => {
    try {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30); // Ustawienie na 30 dni od teraz

        await User.findByIdAndUpdate(req.params.id, {
            isVerified: true,
            verificationStatus: 'active',
            verifiedUntil: expiryDate
        });
        
        res.json({ success: true, message: 'Weryfikacja przyznana.' });
    } catch (err) {
        console.error('Błąd akceptacji weryfikacji:', err);
        res.status(500).json({ error: 'Błąd podczas akceptacji.' });
    }
});

// C. Zdjęcie / Odebranie weryfikacji
app.post('/api/admin/verifications/revoke/:id', authenticateAdmin, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.id, {
            isVerified: false,
            verificationStatus: 'none',
            verifiedUntil: null
        });
        
        res.json({ success: true, message: 'Weryfikacja została cofnięta.' });
    } catch (err) {
        console.error('Błąd usuwania weryfikacji:', err);
        res.status(500).json({ error: 'Błąd podczas odbierania weryfikacji.' });
    }
});

// D. Ręczne dodanie weryfikacji (Email + Dni)
app.post('/api/admin/verifications/manual', authenticateAdmin, async (req, res) => {
    const { email, days } = req.body;
    try {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + parseInt(days));

        const user = await User.findOneAndUpdate(
            { email: email.toLowerCase() },
            { isVerified: true, verificationStatus: 'active', verifiedUntil: expiryDate },
            { new: true }
        );

        if (!user) return res.status(404).json({ error: 'Nie znaleziono użytkownika o tym adresie email.' });
        
        res.json({ success: true, message: 'Ręcznie dodano weryfikację.', user });
    } catch (err) {
        console.error('Błąd ręcznego dodawania weryfikacji:', err);
        res.status(500).json({ error: 'Błąd przy ręcznym dodawaniu.' });
    }
});


// --- ZARZĄDZANIE PASKIEM INFORMACYJNYM ---

// 1. Publiczne pobieranie paska (dla konkretnej strony)
app.get('/api/infobar', async (req, res) => {
  try {
    const pageType = req.query.page || 'home'; // Domyślnie 'home'

    // Szukamy paska dedykowanego dla danej strony
    let infoBar = await InfoBar.findOne({ page: pageType });
    
    // Jeśli nie ma paska dla tej strony, tworzymy domyślny
    if (!infoBar) {
      infoBar = new InfoBar({ 
        page: pageType, 
        text: pageType === 'market' ? 'Witamy w Markecie Velorie!' : 'Witamy w Velorie!', 
        isActive: false 
      });
      await infoBar.save();
    }
    res.json(infoBar);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd pobierania paska' });
  }
});

// 2. Admin: Aktualizacja paska (wymaga logowania admina)
app.post('/api/admin/infobar', authenticateAdmin, async (req, res) => {
  try {
    // Pobieramy "page" z body, żeby wiedzieć który pasek edytujemy
    const { page, isActive, text, bgColor, textColor, linkUrl, linkText } = req.body;
    const targetPage = page || 'home';

    // Używamy findOneAndUpdate z upsert: true
    const updatedBar = await InfoBar.findOneAndUpdate(
      { page: targetPage }, 
      { isActive, text, bgColor, textColor, linkUrl, linkText },
      { new: true, upsert: true } // Zwraca nowy dokument, tworzy jeśli nie ma
    );
    
    res.json({ success: true, bar: updatedBar });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd zapisu paska' });
  }
});

// --- ZARZĄDZANIE UŻYTKOWNIKAMI ---

// A. Pobieranie listy użytkowników
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
        // Pobierz wszystkich użytkowników, posortuj od najnowszych
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        console.error('Błąd pobierania użytkowników:', err);
        res.status(500).json({ error: 'Błąd serwera przy pobieraniu listy.' });
    }
});

// B. Zmiana salda użytkownika (vPLN) - ZAKTUALIZOWANE O ZAPIS TRANSAKCJI
app.post('/api/admin/users/:id/balance', authenticateAdmin, async (req, res) => {
    try {
        const { amount } = req.body; // amount może być dodatnie lub ujemne
        const userId = req.params.id;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'Użytkownik nie istnieje.' });

        // Aktualizacja salda
        user.vpln = (user.vpln || 0) + Number(amount);
        await user.save();

        // ZAPIS TRANSAKCJI DO BAZY
        const isAddition = Number(amount) > 0;
        const transaction = new Transaction({
            userId: user._id,
            type: isAddition ? 'admin_add' : 'admin_sub',
            currency: 'vPLN',
            amount: Number(amount), // zapisujemy z minusem lub plusem
            description: `Korekta salda przez Administratora`
        });
        await transaction.save();

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

// D. Pobieranie pełnej historii transakcji (NOWE)
app.get('/api/admin/transactions', authenticateAdmin, async (req, res) => {
    try {
        // Pobieramy wszystkie transakcje, sortujemy od najnowszych
        // Używamy .populate(), aby dociągnąć nazwę i avatar użytkownika z kolekcji Users
        const transactions = await Transaction.find()
            .sort({ createdAt: -1, date: -1 }) // Upewniamy się, że najnowsze są na górze
            .populate('userId', 'username email avatar'); 
            
        res.json(transactions);
    } catch (err) {
        console.error('Błąd pobierania transakcji:', err);
        res.status(500).json({ error: 'Błąd serwera przy pobieraniu historii.' });
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
