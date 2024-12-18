const express = require('express');
require('dotenv').config();
const mongodb = require('mongodb');
const bodyParser = require('body-parser');

const connection = process.env.MONGODB_URI;
const client = new mongodb.MongoClient(connection);

const app = express();
app.use(express.json()); 

let authData;

client.connect()
    .then(() => {
        console.log('Database connected');
        const db = client.db('focusTube');
        authData = db.collection('authData');
    })
    .catch((error) => {
        console.log('Database connection error:', error);
    });

// Signup Route
app.post('/signup', async (req, res) => {
    try {
        const { email, password } = req.body; 

        // Validate input
        if (!email || !password) {
            return res.status(400).send('Email and password are required');
        }

        // Check if the email already exists in the database
        const existingUser = await authData.findOne({ email });
        if (existingUser) {
            return res.status(400).send('Email already registered');
        }

        // Insert the new user data
        const result = await authData.insertOne({ email, password });
        res.status(201).send(`User created with ID: ${result.insertedId}`);

    } catch (error) {
        console.error('Error during signup:', error);
        res.status(500).send('Internal Server Error');
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});