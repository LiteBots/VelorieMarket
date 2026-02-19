const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['spent', 'earned', 'deposit', 'admin_correction'], required: true },
    currency: { type: String, enum: ['vPLN', 'PLN'], required: true },
    amount: { type: Number, required: true }, // Kwota (najlepiej zawsze dodatnia, typ określa czy to wydatek)
    description: { type: String },
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', transactionSchema);
