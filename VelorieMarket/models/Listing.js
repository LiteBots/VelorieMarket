// models/Listing.js
const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema({
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: String,
  authorAvatar: String,
  type: { type: String, enum: ['job', 'freelancer'], required: true }, // 'job' (zlecenie) lub 'freelancer' (profil)
  
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  
  // Pola dla Zleceniodawcy
  budget: String,
  deadline: String,

  // Pola dla Freelancera
  hourlyRate: String,
  skills: String,
  socialLinks: {
    discord: String,
    instagram: String,
    behance: String,
    github: String,
    portfolio: String
  },
  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Listing', listingSchema);
