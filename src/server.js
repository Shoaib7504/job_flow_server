import express from "express";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import cookieParser from "cookie-parser";
import { pathToFileURL } from "node:url";
import { dbConnect, dbClose } from "./config/db.connect.js";
import authRoutes from "./routes/authRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";
const app = express()
const port = process.env.PORT || 5000

const clientUrls = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(",").map((url) => url.trim().replace(/\/$/, ""))
    : [];

const allowedOrigins = [
    "https://job-flow-ava5.onrender.com",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    ...clientUrls,
];

app.use(express.json())
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error(`CORS origin not allowed: ${origin}`));
            }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    })
)
app.use(cookieParser())

dbConnect()

//Routes
app.use("/auth",authRoutes)
app.use("/applications",applicationRoutes)


app.get('/', (req, res) => {
    res.json({
        message: 'Hello World!',
        success: true,
        statusCode: 200,
        error: null
    })
})

const isRunningDirectly =
    process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isRunningDirectly) {
    const server = app.listen(port, () => {
        console.log(`Server running on port ${port}`)
    })

    process.on('unhandledRejection', async (err) => {
        console.log('Unhandled Rejection', err)
        server.close(async () => {
            await dbClose()
            process.exit(1)
        })
    })

    process.on('uncaughtException', async (err) => {
        console.log('Uncaught Exception', err)
        await dbClose()
        process.exit(1)
    })

    process.on('SIGTERM', async () => {
        console.log('SIGTERM received, shutting down gracefully')
        await dbClose()
        process.exit(0)
    })

    process.on('SIGINT', async () => {
        console.log('SIGINT received, shutting down gracefully')
        await dbClose()
        process.exit(0)
    })
}

export default app
