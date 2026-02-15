const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
    minlength: 3
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['freelancer', 'client'],
    default: 'freelancer'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Ważne: To musi być wyeksportowane dokładnie w ten sposób
module.exports = mongoose.model('User', userSchema);
