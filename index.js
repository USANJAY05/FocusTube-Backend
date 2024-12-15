const express = require('express')
require('dotenv').config();

const app = express()

app.get('/login', (req, res) => {
    console.log('login route')
    res.send('login')
})

app.listen(process.env.PORT, () => {
    console.log(`Server listening on port ${process.env.PORT}`)
})