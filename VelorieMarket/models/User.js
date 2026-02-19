const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: {
    type: String,
    required: function() { return !this.discordId; }
  },
  role: { type: String, enum: ['freelancer', 'client'], default: 'freelancer' },
  vpln: { type: Number, default: 0 },
  discordId: { type: String, unique: true, sparse: true },
  avatar: { type: String, default: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix' },
  portfolioLink: { type: String, default: '' },
  
  // === NOWE POLA DLA WERYFIKACJI ===
  isVerified: { type: Boolean, default: false },
  verificationStatus: { 
    type: String, 
    enum: ['none', 'pending', 'active'], 
    default: 'none' 
  },
  verifiedUntil: { type: Date, default: null },
  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
