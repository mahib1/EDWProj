const express = require('express');
const multer = require('multer');
const path = require('path');
const dotenv = require('dotenv');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const { Jimp } = require('jimp');
const jsQR = require('jsqr');

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['BOT_TOKEN', 'CHAT_ID', 'PORT'];
requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        throw new Error(`Missing required environment variable: ${varName}`);
    }
});

// Initialize Telegram bot
const bot = new TelegramBot(process.env.BOT_TOKEN);

// Initialize Express app
const app = express();

// Configure multer with security constraints
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only images are allowed!'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// QR Code Scanning Function
const scanQRCode = async (filePath) => {
    try {
        const image = await Jimp.read(filePath);
        const qrCodeResult = jsQR(
            image.bitmap.data,
            image.bitmap.width,
            image.bitmap.height
        );

        if (!qrCodeResult) {
            throw new Error('QR code not found in the image');
        }
        return qrCodeResult.data;
    } catch (error) {
        console.error('QR Scan Error:', error.message);
        throw error;
    }
};

// Upload Endpoint
app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        let caption = 'New image upload from server';
        let qrData = null;

        if (req.query.qr === 'true') {
            console.log('QR scanning enabled...');
            qrData = await scanQRCode(req.file.path);
            caption = `${qrData}`;
            console.log('QR Code Data:', qrData);
        }

        // Send to Telegram
        await bot.sendPhoto(
            process.env.CHAT_ID,
            req.file.path,
            { caption }
        );

        // Cleanup
        fs.unlinkSync(req.file.path);

        res.json({
            success: true,
            message: 'Image uploaded and sent to Telegram!',
            filename: req.file.originalname,
            qrData
        });

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({
            error: error.message || 'Failed to process upload'
        });
    }
});

// Start Server
app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
    console.log('Telegram configured for chat ID:', process.env.CHAT_ID);
});
