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


app.post('/subscription', async (req, res) => {
    try {
        const { userId, channelId } = req.body;

        // Validate input
        if (!userId || !channelId) {
            return res.status(400).json({ status: 'Invalid input data' });
        }

        // Check if the user data already exists
        const userRecord = await userData.findOne({ userId });

        if (!userRecord) {
            return res.status(404).json({ message: "User not found" });
        }

        // Define the field to update (subscriptions)
        const updateField = "subscriptions";

        // Check if the user is already subscribed to the channel
        const isAlreadySubscribed = await userData.findOne({
            userId,
            [updateField]: channelId,
        });

        if (isAlreadySubscribed) {
            // Unsubscribe (remove channelId from the subscriptions field)
            await userData.updateOne(
                { userId },
                { $pull: { [updateField]: channelId } }
            );
            return res.status(200).json({ status: `Unsubscribed from channel ${channelId} successfully` });
        }

        // Subscribe (add the channelId to the subscriptions field)
        await userData.updateOne(
            { userId },
            { $addToSet: { [updateField]: channelId } } // Avoid duplicate entries
        );

        res.status(201).json({ status: `Subscribed to channel ${channelId} successfully` });

    } catch (error) {
        console.error('Error during subscription/unsubscription:', error);
        res.status(500).json({ status: 'An error occurred', error: error.message });
    }
});

app.get('/channel/:channelId', async (req, res) => {
    try {
        const { channelId } = req.params; // Extract channelId from URL parameters
        if (!channelId) {
            return res.status(400).json({ error: "channelId is required" });
        }

        const response = await fetch(
            `${process.env.API_URL}/channels?part=snippet%2CcontentDetails%2Cstatistics&id=${channelId}&key=${process.env.API_KEY}`
        );

        if (!response.ok) {
            return res.status(response.status).json({ error: "Failed to fetch data from the API" });
        }

        const data = await response.json(); // Parse the JSON response
        return res.status(200).json(data); // Send the parsed data as JSON
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "An internal server error occurred" });
    }
});

app.post('/video/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params; // Extract videoId from URL parameters
        const { userId } = req.body; // Extract userId from request body

        // Validate input
        if (!userId || !videoId) {
            return res.status(400).json({ error: 'UserId and videoId are required' });
        }

        // Fetch video details from external API
        const response = await fetch(
            `${process.env.API_URL}/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${process.env.API_KEY}`
        );

        if (!response.ok) {
            return res.status(response.status).json({ error: 'Failed to fetch video data from the API' });
        }

        const videoData = await response.json(); // Parse the API response

        // Add the video to the user's history in the database
        const time = new Date().toISOString(); // Server-generated time
        const userRecord = await userData.findOne({ userId });

        if (!userRecord) {
            return res.status(404).json({ error: 'User not found' });
        }

        await userData.updateOne(
            { userId },
            { $addToSet: { history: { videoId, time, details: videoData.items[0] } } }
        );

        // Respond with the fetched video data
        res.status(200).json({ message: 'Video data fetched and saved to history', videoData: videoData.items[0] });
    } catch (error) {
        console.error('Error processing video request:', error);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// Fetch History Route
app.get('/history/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Validate input
        if (!userId) {
            return res.status(400).json({ error: 'UserId is required' });
        }

        // Check if the user exists
        const userRecord = await userData.findOne({ userId });
        if (!userRecord) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Retrieve the user's history
        const history = userRecord.history || [];

        res.status(200).json({
            message: 'History fetched successfully',
            history,
        });
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
