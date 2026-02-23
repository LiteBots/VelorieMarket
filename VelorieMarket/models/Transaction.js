const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    // Rozszerzyliśmy enum o nowe typy używane w server.js i panelu admina
    type: { 
        type: String, 
        enum: ['spent', 'earned', 'deposit', 'admin_correction', 'admin_add', 'admin_sub', 'topup', 'subscription'], 
        required: true 
    },
    currency: { 
        type: String, 
        enum: ['vPLN', 'PLN'], 
        required: true 
    },
    amount: { 
        type: Number, 
        required: true 
    }, // Kwota może być teraz ujemna dla operacji typu 'admin_sub'
    description: { 
        type: String 
    },
    date: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('Transaction', transactionSchema);
