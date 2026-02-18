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
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    // 🟡 ZMIANA: Usunięto required: true, ponieważ użytkownicy Discorda nie mają hasła w naszej bazie
    required: function() {
      return !this.discordId; // Hasło jest wymagane TYLKO, jeśli nie ma podpiętego Discorda
    }
  },
  role: {
    type: String,
    enum: ['freelancer', 'client'],
    default: 'freelancer'
  },
  vpln: {
    type: Number,
    default: 0
  },
  // 🟢 ZMIANA: Discord ID jako String, unikalny (zapobiega duplikatom kont)
  discordId: {
    type: String,
    unique: true,
    sparse: true // Pozwala na to, by wielu użytkowników miało to pole puste (null)
  },
  // 🟢 NOWE POLE: Avatar użytkownika
  avatar: {
    type: String,
    default: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'
  },
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
