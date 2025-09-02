const mongoose = require('mongoose'); // If using Mongo; or use Supabase DB
const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  tier: { type: String, default: 'tier1' }, // 'tier1', 'tier2', 'tier3'
  addedFeatures: [String] // e.g., ['locker'] for ala carte
});
module.exports = mongoose.model('User', userSchema);