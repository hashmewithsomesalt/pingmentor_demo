const express = require('express');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { GoogleGenAI } = require('@google/genai');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Google GenAI
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
  console.warn('WARNING: GEMINI_API_KEY is not configured in the .env file. Chat endpoint will return a warning.');
}

const ai = new GoogleGenAI({ apiKey: apiKey });

// Helper to read mentors database
function getMentorsData() {
  try {
    const filePath = path.join(__dirname, 'mentors.json');
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error('Error reading mentors.json:', error);
    return '[]';
  }
}

// API: Get all mentors (for frontend dashboard)
app.get('/api/mentors', (req, res) => {
  try {
    const data = getMentorsData();
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve mentors' });
  }
});

// API: Chat route
app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // 1. Hard Code-Level Block (Pre-filter)
  const forbiddenPhrases = ["print", "hello world", "python", "javascript", "html", "code"];
  const lowerMessage = message.toLowerCase();
  const isForbidden = forbiddenPhrases.some(phrase => lowerMessage.includes(phrase));
  if (isForbidden) {
    return res.json({
      text: "I am the Ping Mentor assistant. I am only programmed to assist with financial crisis management and mentor matching. I cannot help with programming or technical questions."
    });
  }

  // Check if API key is set
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
    return res.json({
      text: "Hello! It looks like the Gemini API Key is not set up on the server yet. To enable my chatbot responses, please open the `.env` file in the project folder and replace `YOUR_GEMINI_API_KEY_HERE` with your actual Google Gemini API Key, then restart the server. In the meantime, you can browse our mentors on the dashboard!"
    });
  }

  try {
    const mentorsJsonText = getMentorsData();
    
    // Strict System Instruction with Mentors DB injected
    const systemInstruction = `You are the Core Router and Assistant for the Ping Mentor platform. You must process user inputs through a rigid 2-step pipeline:

### STEP 1: Query Classification
Analyze the user's intent immediately. Classify it into one of two categories:
1. PLATFORM/BASIC QUESTION: General platform navigation, basic financial advice concepts, or FAQs.
2. MENTOR SEEKING/CRISIS: The user is explicitly asking for a mentor, or describing a specific financial crisis situation that needs personal guidance.

### STEP 2: Response Generation Rules Based on Class

- IF THE INCOMING QUERY IS CLASS 1 (BASIC QUESTION):
  * Provide a clear, empathetic, direct answer.
  * DO NOT suggest, list, or name any specific mentors automatically in this response.
  * Conclude ONLY with a neutral closing offer, such as: 'If you would like to be matched with a mentor to dive deeper into this issue, please let me know.'

- IF THE INCOMING QUERY IS CLASS 2 (MENTOR SEEKING/CRISIS):
  * Provide a brief, supportive introductory sentence.
  * Evaluate the available mentor profiles in the attached database against the user's specific problem details.
  * DETERMINISTIC MATCHING RULE: To prevent recommendation drift, map the core crisis theme to the primary matching mentor profile. If a problem is primarily about 'debt management', you must ALWAYS recommend the specific debt management mentor first. Do not alternate or rotate mentors randomly for identical or highly similar problems.
  * Recommend a maximum of 1 or 2 mentors. Clearly explain why that specific profile is the most logical match based on their listed area_of_expertise and bio.

### CRITICAL SCOPE BOUNDARIES:
- Never mention, invent, or hallucinate a mentor who is not explicitly present in the provided JSON dataset.
- If a query is entirely out of context (unrelated to financial recovery, platform support, or mentorship), politely refuse to answer and guide them back to the application scope.

Here is the JSON dataset of available mentors:
${mentorsJsonText}`;

    // Format chat history for Gemini API
    // SDK expects: contents: [ { role: 'user' | 'model', parts: [{ text: '...' }] } ]
    const contents = [];
    
    if (Array.isArray(history)) {
      history.forEach(item => {
        if ((item.role === 'user' || item.role === 'model') && item.text) {
          contents.push({
            role: item.role,
            parts: [{ text: item.text }]
          });
        }
      });
    }
    
    // Append current user message
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    // Call Gemini API with fallback support
    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.0,
        }
      });
    } catch (primaryError) {
      console.warn('Primary model gemini-2.5-flash-lite failed, attempting fallback model gemini-2.5-flash. Error:', primaryError.message);
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.0,
        }
      });
    }

    const botReply = response.text;
    res.json({ text: botReply });

  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({ 
      error: 'Something went wrong while processing your request.',
      details: error.message 
    });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  Ping Mentor server is running on port ${PORT}`);
  console.log(`  Access dashboard: http://localhost:${PORT}`);
  console.log(`==================================================`);
});
