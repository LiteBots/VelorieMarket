const mongoose = require('mongoose');

const BannerSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    imageUrl: { type: String, default: "" }, // Link do przesłanego pliku
    externalUrl: { type: String, default: "" }, // Gdzie banner ma kierować
    status: { type: String, enum: ['waiting_for_upload', 'pending', 'active', 'rejected'], default: 'waiting_for_upload' },
    pricePaid: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date }
});

module.exports = mongoose.model('Banner', BannerSchema);
