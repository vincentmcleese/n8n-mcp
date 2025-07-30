// Wrapper to handle nanoid ESM module in CommonJS context
module.exports = {
  nanoid: function(size) {
    // Generate a random ID similar to nanoid
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let id = '';
    for (let i = 0; i < (size || 21); i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }
};