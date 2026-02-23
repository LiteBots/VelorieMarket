const mongoose = require('mongoose');

const discountCodeSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true },
    discountPercent: { type: Number, required: true, min: 1, max: 100 },
    maxUses: { type: Number, default: null }, // null = nieskończoność
    currentUses: { type: Number, default: 0 },
    expiresAt: { type: Date, default: null }, // null = brak daty wygaśnięcia
    totalSaved: { type: Number, default: 0 }, // Statystyka: ile vPLN użytkownicy zaoszczędzili
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DiscountCode', discountCodeSchema);
