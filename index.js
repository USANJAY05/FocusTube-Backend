const express = require('express')

const app = express()

app.get('/login', () => {
    console.log('login route')
})

app.listen(process.env.port, () => {
    console.log(`Server listening on port ${process.env.port}`)
})