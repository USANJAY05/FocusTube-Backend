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
        const userId = result.insertedId.toString();

        // Initialize user-specific data
        await userData.insertOne({
            userId,
            likedVideos: [],
            dislikedVideos:[],
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

app.post('/like', async (req, res) => {
    try {
        const { userId, videoId, status } = req.body;

        // Validate input
        if (!userId || !videoId || !['like', 'dislike'].includes(status)) {
            return res.status(400).json({ status: 'Invalid input data' });
        }

        // Check if the user data already exists
        const userRecord = await userData.findOne({ userId });

        if (!userRecord) {
            return res.status(404).json({message:"User not found"})
        }

        // Determine the field to update (likedVideos or dislikedVideos)
        const updateField = status === 'like' ? 'likedVideos' : 'dislikedVideos';
        const oppositeField = status === 'like' ? 'dislikedVideos' : 'likedVideos';

        // Remove the videoId from the opposite field if it exists
        await userData.updateOne(
            { userId },
            { $pull: { [oppositeField]: videoId } }
        );

        // Check if the videoId already exists in the target field
        const isAlreadyLikedOrDisliked = await userData.findOne({
            userId,
            [updateField]: videoId,
        });

        if (isAlreadyLikedOrDisliked) {
            // Remove the videoId from the target field
            await userData.updateOne(
                { userId },
                { $pull: { [updateField]: videoId } }
            );
            return res.status(200).json({ status: `${status} removed successfully` });
        }

        // Add the videoId to the target field
        await userData.updateOne(
            { userId },
            { $addToSet: { [updateField]: videoId } } // Avoid duplicate entries
        );

        res.status(201).json({ status: `${status} added successfully` });

    } catch (error) {
        console.error('Error during like/dislike:', error);
        res.status(500).json({ status: 'An error occurred', error: error.message });
    }
});


app.post('/history', async (req, res) => {
    try {
        const { userId, videoId } = req.body;
        const updateField = "history";

        // Validate input
        if (!userId || !videoId) {
            return res.status(400).json({ status: 'Invalid input data' });
        }

        // Get the server's current time
        const time = new Date().toISOString(); // ISO string format

        // Check if the user data already exists
        const userRecord = await userData.findOne({ userId });

        if (!userRecord) {
            return res.status(404).json({ message: "User not found" });
        }

        // Add the videoId and server-generated time to the history field
        await userData.updateOne(
            { userId },
            { $addToSet: { [updateField]: { videoId, time } } }
        );

        res.status(201).json({ status: 'Video added to history successfully' });

    } catch (error) {
        console.error('Error during history update:', error);
        res.status(500).json({ status: 'An error occurred', error: error.message });
    }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
