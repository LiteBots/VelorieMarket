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
            imgSrc: ["'self'", "data:", "i.imgur.com", "i.pravatar.cc"],
            styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
            fontSrc: ["'self'", "fonts.gstatic.com"],
            connectSrc: ["'self'"]
        }
    }
}));

app.use(cors());
app.use(express.json());
// Serwowanie plików statycznych (style, skrypty, obrazki z roota)
app.use(express.static(__dirname));

// Rate Limiting dla API
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api', apiLimiter);

// === BAZA DANYCH ===
if (!process.env.MONGO_URL) {
    console.error("FATAL: Brak MONGO_URL");
    // W produkcji nie exitujemy, żeby serwer wstał i pokazał błąd w logach, 
    // ale tu dla jasności:
    process.exit(1); 
}

mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('✅ Połączono z MongoDB'))
    .catch(err => console.error('❌ Błąd MongoDB:', err));

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

app.post('/api/register', async (req, res) => {
    try {
        const { error } = registerSchema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { username, email, password, role } = req.body;

        if (await User.findOne({ email })) {
            return res.status(409).json({ error: "Email zajęty." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, email, password: hashedPassword, role });
        await newUser.save();

        updateDiscordStats();
        res.status(201).json({ message: "Konto utworzone." });
    } catch (err) {
        res.status(500).json({ error: "Błąd serwera." });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { error } = loginSchema.validate(req.body);
        if (error) return res.status(400).json({ error: "Błędne dane." });

        const user = await User.findOne({ email: req.body.email });
        if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
            return res.status(401).json({ error: "Błędny email lub hasło." });
        }

        res.json({ 
            message: "Zalogowano.", 
            user: { id: user._id, username: user.username, role: user.role } 
        });
    } catch (err) {
        res.status(500).json({ error: "Błąd serwera." });
    }
});

// === ROUTING HTML (TO JEST NOWOŚĆ) ===

// 1. Strona główna (Landing Page)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Strona logowania/rejestracji
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// 3. Fallback (jak ktoś wpisze głupoty, przekieruj na główną)
app.get('*', (req, res) => {
    res.redirect('/');
});

app.listen(PORT, () => {
    console.log(`🚀 Server on port ${PORT}`);
});
