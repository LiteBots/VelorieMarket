// models/InfoBar.js
const mongoose = require('mongoose');

const InfoBarSchema = new mongoose.Schema({
  isActive: { type: Boolean, default: false },
  text: { type: String, required: true },
  bgColor: { type: String, default: '#ff0354' }, // Domyślny accent
  textColor: { type: String, default: '#ffffff' },
  linkUrl: { type: String, default: '' },
  linkText: { type: String, default: '' }
});

// Tworzymy model jako singleton (zawsze będziemy edytować ten sam dokument)
module.exports = mongoose.model('InfoBar', InfoBarSchema);
