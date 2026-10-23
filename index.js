require('dotenv').config({ quiet: true });

const express = require('express')
const app = express()
const port = process.env.PORT || 3000;

const swaggerUi = require('swagger-ui-express');
const yamljs = require('yamljs');
const swaggerDocument = yamljs.load('./docs/swagger.yaml');

const mongoose = require('mongoose');
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/games-db';

const Game = require('./models/game');
const User = require('./models/user');

const users = [
    { role: 'admin', username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD },
    { role: 'user', username: process.env.USER_USERNAME, password: process.env.USER_PASSWORD }
];

const games = [
    { id: 1, name: "Witcher 3", price: 29.99 },
    { id: 2, name: "Cyberpunk 2077", price: 59.99 },
    { id: 3, name: "Minecraft", price: 26.99 },
    { id: 4, name: "Counter-Strike: Global Offensive", price: 0 },
    { id: 5, name: "Roblox", price: 0 },
    { id: 6, name: "Grand Theft Auto V", price: 29.99 },
    { id: 7, name: "Valorant", price: 0 },
    { id: 8, name: "Forza Horizon 5", price: 59.99 }
];

app.use(express.json());

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

mongoose.connect(mongoUri)
    .then(async () => {
        await Game.init();
        await User.init();
        await Game.bulkWrite(games.map(game => ({
            updateOne: {
                filter: { id: game.id },
                update: { $setOnInsert: game },
                upsert: true
            }
        })));

        for (const user of users) {
            if (!user.username || !user.password) {
                console.warn(`${user.role.toUpperCase()} credentials are not set, skipping user seed`);
                continue;
            }

            if (!await User.exists({ username: user.username }))
                await User.e(user);
        }

        app.listen(port, () => {
            console.log(`API up at: http://localhost:${port}`);
        });
    })
    .catch(async (error) => {
        console.error('API startup failed:', error.message);
        process.exitCode = 1;
        await mongoose.disconnect();
    });

function getBaseUrl(req)
{
    return `${req.protocol}://${req.get('host')}`;
}

async function authenticate(req)
{
    const authorization = (req.get('authorization') || '').match(/^Basic\s+(\S+)\s*$/i);
    if (!authorization)
        return null;

    const decoded = Buffer.from(authorization[1], 'base64').toString();
    const separator = decoded.indexOf(':');
    if (separator === -1)
        return null;

    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    const user = await User.findOne({ username }).select('+password');
    return user && await user.verifyPassword(password) ? user : null;
}

function requireRole(...roles)
{
    return async (req, res, next) => {
        const user = await authenticate(req);
        if (!user)
            return res.set('WWW-Authenticate', 'Basic realm="Games API"')
                .status(401).send({ error: 'Valid credentials are required' });

        if (!roles.includes(user.role))
            return res.status(403).send({ error: 'Admin rights are required' });

        req.user = user;
        next();
    };
}

app.get('/games', async (req, res) => {
    res.json(await Game.find().sort({ id: 1 }));
})

app.get('/games/:id', requireRole('admin', 'user'), async (req, res) => {
    const game = await Game.findOne({ id: req.params.id });
    if (!game)
        return res.status(404).send({ error: "Game not found" });

    res.send(game);
})

app.post('/games', requireRole('admin'), async (req, res) => {
    if (!req.body?.name || req.body.price == null)
        return res.status(400).send({ error: 'One or all params are missing' });

    const lastGame = await Game.findOne().sort({ id: -1 });
    const game = await Game.create({
        id: lastGame ? lastGame.id + 1 : 1,
        price: req.body.price,
        name: req.body.name
    });

    res.status(201)
        .location(`${getBaseUrl(req)}/games/${game.id}`)
        .send(game);
})

app.put('/games/:id', requireRole('admin'), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1)
        return res.status(400).send({ error: 'Game id must be a positive integer' });

    if (!req.body?.name || req.body.price == null)
        return res.status(400).send({ error: 'One or all params are missing' });

    const game = await Game.findOneAndUpdate(
        { id },
        { $set: { name: req.body.name, price: req.body.price } },
        { new: true, runValidators: true }
    );
    if (!game)
        return res.status(404).send({ error: 'Game not found' });

    res.send(game);
})

app.delete('/games/:id', requireRole('admin'), async (req, res) => {
    const game = await Game.findOneAndDelete({ id: req.params.id });
    if (!game)
        return res.status(404).send({ error: "Game not found" });

    res.status(204).send();
})

app.use((error, req, res, next) => {
    if (error.name === 'ValidationError' || error.name === 'CastError')
        return res.status(400).send({ error: error.message });

    if (error.code === 11000)
        return res.status(409).send({ error: 'Game already exists' });

    res.status(500).send({ error: 'Internal server error' });
});
