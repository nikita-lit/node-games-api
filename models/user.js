const mongoose = require('mongoose');
const crypto = require('crypto');
const scrypt = require('util').promisify(crypto.scrypt);

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: ['admin', 'user'], default: 'user' }
}, {
    versionKey: false,
    toJSON: {
        transform: (doc, ret) => {
            delete ret.password;
            return ret;
        }
    }
});

userSchema.pre('save', async function () {
    if (!this.isModified('password'))
        return;

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await scrypt(this.password, salt, 64);
    this.password = `${salt}:${hash.toString('hex')}`;
});

userSchema.methods.verifyPassword = async function (password) {
    const [salt, storedHash] = (this.password || '').split(':');
    if (!salt || !storedHash)
        return false;

    const expected = Buffer.from(storedHash, 'hex');
    const actual = await scrypt(password, salt, 64);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

module.exports = mongoose.model('User', userSchema);
