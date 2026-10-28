import express from "express";
import cors from "cors";
import "dotenv/config";
import connectDB from "./config/db.js";

connectDB()

const app = express()

app.use(cors())
app.use(express.json())

app.get('/', (req, res)=> res.send("Server is running"))

const PORT = process.env.PORT || 5000;

app.listen(PORT, ()=> console.log(`Server running on port ${PORT}`))