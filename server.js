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
            scriptSrc: ["'self'", "'unsafe-inline'", "cdn.tailwindcss.com", "unpkg.com"],
            imgSrc: ["'self'", "data:", "i.imgur.com", "i.pravatar.cc", "https://*"],
            styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
            fontSrc: ["'self'", "fonts.gstatic.com"],
            connectSrc: ["'self'", "https://*", "http://*"] // Rozszerzono connectSrc, aby uniknąć blokowania API
        }
    }
}));

app.use(cors());
app.use(express.json());

// Serwowanie plików statycznych
app.use(express.static(__dirname));

// Rate Limiting dla API
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api', apiLimiter);

// === BAZA DANYCH ===
if (!process.env.MONGO_URL) {
    console.error("❌ FATAL: Brak zmiennej MONGO_URL w konfiguracji Railway!");
    process.exit(1); 
}

mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('✅ Połączono z MongoDB'))
    .catch(err => console.error('❌ Błąd połączenia z MongoDB:', err));

// === DISCORD ===
initDiscord(process.env.DISCORD_TOKEN, process.env.DISCORD_STATS_CHANNEL_ID);

// === WALIDACJA ===
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

// Rejestracja
app.post('/api/register', async (req, res) => {
    console.log(`📥 [API] Próba rejestracji: ${req.body.email}`);

    try {
        // 1. Walidacja Joi
        const { error } = registerSchema.validate(req.body);
        if (error) {
            console.log(`⚠️ [Walidacja] Błędne dane: ${error.details[0].message}`);
            return res.status(400).json({ error: error.details[0].message });
        }

        const { username, email, password, role } = req.body;

        // 2. Sprawdzenie czy użytkownik już istnieje
        const userExists = await User.findOne({ email });
        if (userExists) {
            console.log(`⚠️ [Rejestracja] Email już zajęty: ${email}`);
            return res.status(409).json({ error: "Użytkownik o tym adresie email już istnieje." });
        }

        // 3. Haszowanie hasła
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 4. Zapis do bazy
        const newUser = new User({ 
            username, 
            email, 
            password: hashedPassword, 
            role 
        });

        await newUser.save();
        console.log(`✅ [Baza] Nowy użytkownik zapisany: ${email}`);

        // 5. Aktualizacja Discorda
        // Wywołujemy funkcję i logujemy jej wywołanie
        console.log(`📡 [Discord] Wysyłam żądanie aktualizacji statystyk...`);
        updateDiscordStats(); 

        res.status(201).json({ message: "Konto utworzone pomyślnie." });
    } catch (err) {
        console.error("❌ [Serwer] Błąd podczas rejestracji:", err);
        res.status(500).json({ error: "Wystąpił błąd serwera podczas tworzenia konta." });
    }
});

// Logowanie
app.post('/api/login', async (req, res) => {
    console.log(`📥 [API] Próba logowania: ${req.body.email}`);

    try {
        const { error } = loginSchema.validate(req.body);
        if (error) return res.status(400).json({ error: "Niepoprawny format danych." });

        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            console.log(`⚠️ [Logowanie] Nie znaleziono użytkownika: ${req.body.email}`);
            return res.status(401).json({ error: "Błędny email lub hasło." });
        }

        const validPass = await bcrypt.compare(req.body.password, user.password);
        if (!validPass) {
            console.log(`⚠️ [Logowanie] Błędne hasło dla: ${req.body.email}`);
            return res.status(401).json({ error: "Błędny email lub hasło." });
        }

        console.log(`✅ [Logowanie] Użytkownik zalogowany: ${user.email}`);
        res.json({ 
            message: "Zalogowano pomyślnie.", 
            user: { id: user._id, username: user.username, role: user.role } 
        });
    } catch (err) {
        console.error("❌ [Serwer] Błąd podczas logowania:", err);
        res.status(500).json({ error: "Błąd serwera." });
    }
});

// === ROUTING HTML ===

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('*', (req, res) => {
    res.redirect('/');
});

app.listen(PORT, () => {
    console.log(`🚀 [System] Serwer Velorie Market uruchomiony na porcie ${PORT}`);
});
