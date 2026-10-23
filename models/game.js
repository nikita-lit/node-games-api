const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 }
}, {
    versionKey: false,
    toJSON: {
        transform: (doc, ret) => {
            delete ret._id
            return ret
        }
    }
});

gameSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.model('Game', gameSchema);