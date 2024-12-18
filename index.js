const express = require('express');
require('dotenv').config();
const mongodb = require('mongodb');

const connection = process.env.MONGODB_URI;
const client = new mongodb.MongoClient(connection);

const app = express();
app.use(express.json());

let authData, userData;

// Connect to the database
client.connect()
    .then(() => {
        console.log('Database connected');
        const db = client.db('focusTube');
        authData = db.collection('authData');
        userData = db.collection('userData');
    })
    .catch((error) => {
        console.error('Database connection error:', error);
        process.exit(1); // Exit the process if the database fails to connect
    });

// Middleware to check if the database connection is ready
const checkDbConnection = (req, res, next) => {
    if (!authData || !userData) {
        return res.status(500).json({ error: 'Database connection not initialized' });
    }
    next();
};

// Signup Route
app.post('/signup', checkDbConnection, async (req, res) => {
    try {
        const { name, img, email } = req.body;

        // Validate input
        if (!name || !img || !email) {
            return res.status(400).json({ error: 'Name, image, and email are required' });
        }

        // Check if the email already exists in the database
        const existingUser = await authData.findOne({ email });
        if (existingUser) {
            const { _id: userId } = existingUser;
            return res.status(200).json({
                status: 'User already exists',
                authData: { name, img, email, userId },
            });
        }

        // Insert the new user data
        const result = await authData.insertOne({ name, img, email });
        const userId = result.insertedId;

        // Initialize user-specific data
        await userData.insertOne({
            userId,
            likedVideos: [],
            history: [],
            watchLater: [],
            subscriptions: [],
            playlist: [],
        });

        res.status(201).json({
            status: 'User created successfully',
            authData: { name, img, email, userId },
        });
    } catch (error) {
        console.error('Error during signup:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
