require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const path = require('path');

const User = require('./models/User');
const { initDiscord, updateDiscordStats } = require('./utils/discord');

const app = express();
const PORT = process.env.PORT || 3000;

// === KONFIGURACJA BEZPIECZEŃSTWA ===
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            // Odblokowano skrypty CDN i inline
            scriptSrc: ["'self'", "'unsafe-inline'", "cdn.tailwindcss.com", "unpkg.com"],
            // Odblokowano obrazki z zaufanych domen
            imgSrc: ["'self'", "data:", "i.imgur.com", "i.pravatar.cc", "https://*"],
            // Odblokowano style i fonty Google
            styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
            fontSrc: ["'self'", "fonts.gstatic.com"],
            // KLUCZOWE: Pozwalamy na fetch/XHR do naszego API ('self')
            connectSrc: ["'self'", "https://*", "http://*"]
        }
    }
}));

app.use(cors());
app.use(express.json());

// Serwowanie plików statycznych z głównego katalogu
app.use(express.static(__dirname));

// Ochrona przed Brute-Force
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api', apiLimiter);

// === POŁĄCZENIE Z BAZĄ DANYCH ===
if (!process.env.MONGO_URL) {
    console.error("❌ FATAL: Brak zmiennej MONGO_URL w konfiguracji Railway!");
    process.exit(1); 
}

mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('✅ Połączono z MongoDB'))
    .catch(err => console.error('❌ Błąd połączenia z MongoDB:', err));

// === INICJALIZACJA DISCORDA ===
initDiscord(process.env.DISCORD_TOKEN, process.env.DISCORD_STATS_CHANNEL_ID);

// === SCHEMATY WALIDACJI ===
const registerSchema = Joi.object({
    username: Joi.string().min(3).max(30).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid('freelancer', 'client').default('freelancer')
});

const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});

// === API ENDPOINTS ===

// Rejestracja użytkownika
app.post('/api/register', async (req, res) => {
    console.log(`📥 [API] Próba rejestracji:`, req.body);

    try {
        // 1. Walidacja formatu danych
        const { error } = registerSchema.validate(req.body);
        if (error) {
            console.log(`⚠️ [Walidacja] Błąd: ${error.details[0].message}`);
            return res.status(400).json({ error: error.details[0].message });
        }

        const { username, email, password, role } = req.body;

        // 2. Czy email jest unikalny
        const userExists = await User.findOne({ email: email.toLowerCase() });
        if (userExists) {
            console.log(`⚠️ [Rejestracja] Email zajęty: ${email}`);
            return res.status(409).json({ error: "Użytkownik o tym adresie email już istnieje." });
        }

        // 3. Bezpieczne hasło
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 4. Próba zapisu do bazy
        const newUser = new User({ 
            username, 
            email: email.toLowerCase(), 
            password: hashedPassword, 
            role 
        });

        await newUser.save();
        console.log(`✅ [Baza] Nowy użytkownik zapisany pomyślnie!`);

        // 5. Aktualizacja Discorda (asynchronicznie)
        console.log(`📡 [Discord] Wywołuję aktualizację licznika...`);
        updateDiscordStats(); 

        res.status(201).json({ message: "Konto utworzone pomyślnie." });
    } catch (err) {
        console.error("❌ [Serwer] Błąd podczas zapisu w /api/register:", err);
        res.status(500).json({ error: "Wystąpił błąd podczas tworzenia konta." });
    }
});

// Logowanie użytkownika
app.post('/api/login', async (req, res) => {
    console.log(`📥 [API] Próba logowania: ${req.body.email}`);

    try {
        const { error } = loginSchema.validate(req.body);
        if (error) return res.status(400).json({ error: "Niepoprawny format danych." });

        const user = await User.findOne({ email: req.body.email.toLowerCase() });
        if (!user) {
            console.log(`⚠️ [Logowanie] Nie znaleziono: ${req.body.email}`);
            return res.status(401).json({ error: "Błędny email lub hasło." });
        }

        const validPass = await bcrypt.compare(req.body.password, user.password);
        if (!validPass) {
            console.log(`⚠️ [Logowanie] Złe hasło dla: ${req.body.email}`);
            return res.status(401).json({ error: "Błędny email lub hasło." });
        }

        console.log(`✅ [Logowanie] Sukces: ${user.email}`);
        res.json({ 
            message: "Zalogowano pomyślnie.", 
            user: { id: user._id, username: user.username, role: user.role } 
        });
    } catch (err) {
        console.error("❌ [Serwer] Błąd podczas /api/login:", err);
        res.status(500).json({ error: "Błąd serwera." });
    }
});

// === ROUTING PLIKÓW HTML ===

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Wszystkie inne ścieżki kierują na stronę główną
app.get('*', (req, res) => {
    res.redirect('/');
});

app.listen(PORT, () => {
    console.log(`🚀 [System] Serwer Velorie Market online na porcie ${PORT}`);
});
