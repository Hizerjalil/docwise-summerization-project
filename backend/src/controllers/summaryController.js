const mongoose = require('mongoose');
const db = require('../db');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const pdf = require('pdf-parse');

// Configuration Constants
const CONFIG = {
    MAX_TEXT_LENGTH: 30000, // Reduced to stay within Gemini flash token comfort zone
    MAX_TITLE_LENGTH: 200,
    ALLOWED_MIMES: ['application/pdf'],
    MAX_FILE_SIZE: 10 * 1024 * 1024 // 10MB
};

const axios = require('axios');
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// ============ AI PROVIDERS ============

const callGroq = async (prompt) => {
    if (!process.env.GROQ_API_KEY) throw new Error('Groq Key Missing');
    
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: process.env.GROQ_MODEL || "llama-3.3-70b-specdec",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: parseInt(process.env.MAX_TOKENS_PER_SUMMARY) || 2048
    }, {
        headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
        },
        timeout: 10000 // 10s timeout
    });

    return response.data.choices[0].message.content;
};

// ============ UTILS ============

const localSummarize = (text, detailLevel = 'concise') => {
    if (!text) return "No content found.";
    const sentences = text.split(/[.!?]+\s/).filter(s => s.trim().length > 20);
    const count = detailLevel === 'detailed' ? 5 : 2;
    return sentences.slice(0, count).map(s => `• ${s.trim()}`).join('\n');
};

// ============ CONTROLLERS ============

exports.getAllSummaries = async (req, res, next) => {
    try {
        const { rows } = await db.query('Summary', { user_id: req.user.id }, 'find', {
            sort: { created_at: -1 },
            limit: 50,
            select: 'title mode text created_at'
        });
        res.status(200).json(rows);
    } catch (err) {
        next(err);
    }
};

exports.summarize = async (req, res, next) => {
    try {
        const { title: reqTitle, text: reqText, detailLevel = 'concise' } = req.body;
        let textToProcess = reqText || '';
        let mode = 'text';
        let finalTitle = reqTitle || 'Untitled Summary';

        // 1. PDF Extraction Logic
        if (req.file) {
            if (!CONFIG.ALLOWED_MIMES.includes(req.file.mimetype)) {
                return res.status(400).json({ error: 'Invalid file type. PDFs only.' });
            }
            
            const pdfData = await pdf(req.file.buffer);
            textToProcess = pdfData.text.trim();
            mode = 'upload';
            if (!reqTitle) finalTitle = req.file.originalname.replace('.pdf', '');
        }

        if (!textToProcess) {
            return res.status(400).json({ error: 'No text content detected for summarization.' });
        }

        // 2. Truncate for performance and cost control
        const sanitizedInput = textToProcess.slice(0, CONFIG.MAX_TEXT_LENGTH);

        // 3. AI Summarization Logic (Tiered approach)
        let summaryResult = '';
        let provider = 'none';

        const prompt = detailLevel === 'detailed'
            ? `Analyze this document and provide a detailed structured summary with Key Points and Conclusion:\n\n${sanitizedInput}`
            : `Summarize this text into 3 concise bullet points:\n\n${sanitizedInput}`;

        // Tier 1: Groq (Primary)
        try {
            console.log('--- Attempting Groq Summary ---');
            summaryResult = await callGroq(prompt);
            provider = 'groq';
        } catch (groqErr) {
            console.error('Groq Failure:', groqErr.message);
            
            // Tier 2: Gemini (Backup)
            if (genAI) {
                try {
                    console.log('--- Attempting Gemini Fallback ---');
                    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                    const result = await model.generateContent(prompt);
                    summaryResult = result.response.text();
                    provider = 'gemini';
                } catch (geminiErr) {
                    console.error('Gemini Failure:', geminiErr.message);
                    summaryResult = localSummarize(sanitizedInput, detailLevel);
                    provider = 'local';
                }
            } else {
                summaryResult = localSummarize(sanitizedInput, detailLevel);
                provider = 'local';
            }
        }

        // 4. Centralized Data Persistence
        const { rows } = await db.query('Summary', {
            user_id: req.user.id,
            title: finalTitle.slice(0, CONFIG.MAX_TITLE_LENGTH),
            text: summaryResult,
            mode,
            original_text: null // Storage optimization
        }, 'insertOne');

        return res.status(201).json({
            id: rows[0]._id,
            summary: summaryResult,
            provider,
            mode
        });

    } catch (err) {
        console.error('Final Controller Catch:', err);
        next(err);
    }
};

exports.deleteSummary = async (req, res, next) => {
    try {
        const { rowCount } = await db.query('Summary', { 
            _id: req.params.id, 
            user_id: req.user.id 
        }, 'deleteOne');
        
        if (!rowCount) return res.status(404).json({ error: 'Summary not found' });
        res.json({ success: true, message: 'Deleted' });
    } catch (err) {
        next(err);
    }
};