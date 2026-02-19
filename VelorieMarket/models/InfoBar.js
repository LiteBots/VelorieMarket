const mongoose = require('mongoose');

const InfoBarSchema = new mongoose.Schema({
  // NOWE POLE: Identyfikator strony ('home' lub 'market')
  page: { 
    type: String, 
    required: true, 
    default: 'home', 
    unique: true // Zapobiega duplikatom dla tej samej strony
  },
  
  isActive: { type: Boolean, default: false },
  text: { type: String, required: true }, // Treść komunikatu
  bgColor: { type: String, default: '#ff0354' }, // Kolor tła
  textColor: { type: String, default: '#ffffff' }, // Kolor tekstu
  linkUrl: { type: String, default: '' }, // Opcjonalny link
  linkText: { type: String, default: '' } // Tekst linku
});

module.exports = mongoose.model('InfoBar', InfoBarSchema);
