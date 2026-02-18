const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true, // Zawsze zapisuje email małymi literami
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['freelancer', 'client'], // Akceptuje tylko te dwie wartości z formularza
    default: 'freelancer'
  },
  // 🟢 NOWE POLE: Wirtualny portfel (domyślnie 0)
  vpln: {
    type: Number,
    default: 0
  },
  // 🟢 NOWE POLE: Discord ID (opcjonalne, puste na start)
  discordId: {
    type: String,
    default: ''
  },
  // 🟢 NOWE POLE: Link do portfolio/GitHub (opcjonalne, puste na start)
  portfolioLink: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema);
