const mongoose = require('mongoose');
const db = require('../db');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const pdf = require('pdf-parse');

// Configuration Constants
const CONFIG = {
    MAX_TEXT_LENGTH: 20000, // Reduced to fit within typical 8k token windows
    MAX_TITLE_LENGTH: 200,
    ALLOWED_MIMES: [
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ],
    MAX_FILE_SIZE: 10 * 1024 * 1024 // 10MB
};

const axios = require('axios');
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// ============ AI PROVIDERS ============

const callGroq = async (prompt) => {
    if (!process.env.GROQ_API_KEY) throw new Error('Groq Key Missing');
    
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: process.env.GROQ_MODEL || "llama3-70b-8192",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: parseInt(process.env.MAX_TOKENS_PER_SUMMARY) || 2048
    }, {
        headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
        },
        timeout: 30000 // 30s timeout to handle larger models
    });

    return response.data.choices[0].message.content;
};

// ============ UTILS ============

const localSummarize = (text, detailLevel = 'concise') => {
    if (!text) return "No content found.";
    // Improved sentence splitting for PDF text which may have irregular punctuation or newlines
    const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter(s => s && s.trim().length > 20);
    
    if (sentences.length === 0) {
        return `• ${text.substring(0, 300).trim()}...`;
    }
    
    const count = detailLevel === 'detailed' ? 15 : 3;
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

        // 1. File Extraction Logic
        if (req.file) {
            if (!CONFIG.ALLOWED_MIMES.includes(req.file.mimetype)) {
                return res.status(400).json({ error: 'Invalid file type.' });
            }
            
            mode = 'upload';
            if (!reqTitle) finalTitle = req.file.originalname.replace(/\.[^/.]+$/, "");

            if (req.file.mimetype === 'application/pdf') {
                const pdfData = await pdf(req.file.buffer);
                textToProcess = pdfData.text.trim();
            } else if (req.file.mimetype === 'text/plain') {
                textToProcess = req.file.buffer.toString('utf-8').trim();
            } else {
                try {
                    const officeParser = require('officeparser');
                    textToProcess = await officeParser.parseOfficeAsync(req.file.buffer);
                    if (textToProcess) textToProcess = textToProcess.trim();
                } catch (parseError) {
                    console.error('Office parse error:', parseError);
                    if (parseError.code === 'MODULE_NOT_FOUND') {
                        return res.status(500).json({ error: 'Server configuration error: "officeparser" is missing. Please run "npm install officeparser" in the backend directory.' });
                    }
                    return res.status(400).json({ error: 'Failed to extract text from this document. Note: Old binary .doc/.ppt files may not be supported.' });
                }
            }
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
            ? `You are an expert summarizer. Analyze this document thoroughly and provide a highly comprehensive, detailed structured summary. Include an Executive Summary, an extensive list of Key Points covering all major themes, and a thoughtful Conclusion:\n\n${sanitizedInput}`
            : `Summarize this text into 3 concise bullet points focusing on the most important information:\n\n${sanitizedInput}`;

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