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
// Railway dynamicznie przydziela port, process.env.PORT jest niezbędny
const PORT = process.env.PORT || 3000;

// === KONFIGURACJA BEZPIECZEŃSTWA ===
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            // scriptSrc: Pozwalamy na skrypty z self, inline (Tailwind) oraz zewnętrzne biblioteki
            scriptSrc: ["'self'", "'unsafe-inline'", "cdn.tailwindcss.com", "unpkg.com"],
            // imgSrc: Pozwalamy na ładowanie obrazków z Twoich zaufanych źródeł
            imgSrc: ["'self'", "data:", "i.imgur.com", "i.pravatar.cc", "https://*"],
            // styleSrc: Niezbędne dla Google Fonts i inline styles Tailwind
            styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
            fontSrc: ["'self'", "fonts.gstatic.com"],
            // connectSrc: TO JEST KLUCZOWE. Pozwala fetch() łączyć się z Twoim API na Railway
            connectSrc: ["'self'", "https://*", "http://*"]
        }
    },
    // Wyłączenie blokady cross-origin dla zasobów zewnętrznych
    crossOriginEmbedderPolicy: false
}));

app.use(cors());
app.use(express.json());

// Serwowanie plików statycznych z głównego katalogu
app.use(express.static(__dirname));

// Ochrona przed Brute-Force (API Limiter)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Zbyt wiele prób logowania. Spróbuj ponownie za 15 minut." }
});
app.use('/api', apiLimiter);

// === POŁĄCZENIE Z BAZĄ DANYCH ===
if (!process.env.MONGO_URL) {
    console.error("❌ FATAL: Brak zmiennej MONGO_URL w konfiguracji Railway!");
    process.exit(1); 
}

mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('✅ Połączono z MongoDB'))
    .catch(err => {
        console.error('❌ Błąd połączenia z MongoDB:', err.message);
        // Nie zabijamy procesu, aby Railway mógł spróbować zrestartować kontener
    });

// === INICJALIZACJA DISCORDA ===
initDiscord(process.env.DISCORD_TOKEN, process.env.DISCORD_STATS_CHANNEL_ID);

// === SCHEMATY WALIDACJI (JOI) ===
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
        const { error } = registerSchema.validate(req.body);
        if (error) {
            console.log(`⚠️ [Walidacja] Błąd: ${error.details[0].message}`);
            return res.status(400).json({ error: error.details[0].message });
        }

        const { username, email, password, role } = req.body;
        const normalizedEmail = email.toLowerCase();

        const userExists = await User.findOne({ email: normalizedEmail });
        if (userExists) {
            console.log(`⚠️ [Rejestracja] Email zajęty: ${normalizedEmail}`);
            return res.status(409).json({ error: "Użytkownik o tym adresie email już istnieje." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = new User({ 
            username, 
            email: normalizedEmail, 
            password: hashedPassword, 
            role 
        });

        await newUser.save();
        console.log(`✅ [Baza] Nowy użytkownik zapisany pomyślnie: ${normalizedEmail}`);

        // Aktualizacja Discorda
        console.log(`📡 [Discord] Wywołuję aktualizację licznika...`);
        updateDiscordStats(); 

        res.status(201).json({ message: "Konto utworzone pomyślnie." });
    } catch (err) {
        console.error("❌ [Serwer] Błąd podczas rejestracji:", err);
        res.status(500).json({ error: "Wystąpił błąd podczas tworzenia konta." });
    }
});

// Logowanie użytkownika
app.post('/api/login', async (req, res) => {
    console.log(`📥 [API] Próba logowania: ${req.body.email}`);

    try {
        const { error } = loginSchema.validate(req.body);
        if (error) return res.status(400).json({ error: "Niepoprawny format danych." });

        const normalizedEmail = req.body.email.toLowerCase();
        const user = await User.findOne({ email: normalizedEmail });
        
        if (!user) {
            console.log(`⚠️ [Logowanie] Nie znaleziono: ${normalizedEmail}`);
            return res.status(401).json({ error: "Błędny email lub hasło." });
        }

        const validPass = await bcrypt.compare(req.body.password, user.password);
        if (!validPass) {
            console.log(`⚠️ [Logowanie] Złe hasło dla: ${normalizedEmail}`);
            return res.status(401).json({ error: "Błędny email lub hasło." });
        }

        console.log(`✅ [Logowanie] Sukces: ${normalizedEmail}`);
        res.json({ 
            message: "Zalogowano pomyślnie.", 
            user: { id: user._id, username: user.username, role: user.role } 
        });
    } catch (err) {
        console.error("❌ [Serwer] Błąd podczas logowania:", err);
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
