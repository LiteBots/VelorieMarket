const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    minlength: 3, 
    maxlength: 30 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    // Prosty regex do walidacji emaila
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Proszę podać poprawny adres email']
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

module.exports = mongoose.model('User', UserSchema);