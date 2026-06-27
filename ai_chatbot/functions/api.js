const express = require('express');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { GoogleGenAI } = require('@google/genai');
const serverless = require('serverless-http');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(express.json());

// Fallback body parser for serverless-http environments
app.use((req, res, next) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    if (req.apiGateway && req.apiGateway.event && req.apiGateway.event.body) {
      try {
        let bodyText = req.apiGateway.event.body;
        if (req.apiGateway.event.isBase64Encoded) {
          bodyText = Buffer.from(bodyText, 'base64').toString('utf8');
        }
        req.body = JSON.parse(bodyText);
      } catch (err) {
        console.error('Failed to parse body from apiGateway event:', err);
      }
    }
  }
  next();
});

// Initialize Google GenAI
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey });

// Helper to read mentors database
function getMentorsData() {
  try {
    // In Netlify, mentors.json is bundled and located in the base/build directory.
    // Since base is 'ai_chatbot', path.join(__dirname, '..', 'mentors.json') resolves to the root of 'ai_chatbot'.
    const filePath = path.join(__dirname, '..', 'mentors.json');
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error('Error reading mentors.json:', error);
    return '[]';
  }
}

// Router to handle both direct and redirected Netlify paths
const router = express.Router();

// API: Get all mentors
router.get('/mentors', (req, res) => {
  try {
    const data = getMentorsData();
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve mentors' });
  }
});

// API: Chat route
router.post('/chat', async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // 1. Hard Code-Level Block (Pre-filter)
  const forbiddenPhrases = [
    // Programming/Tech
    'python', 'javascript', 'java', 'html', 'css', 'c++', 'rust', 'ruby', 'print(', 'hello world', 'code', 'coding', 'programming', 'software', 'array', 'function', 'loop', 'database query', 'git', 'github', 'bug', 'compiler', 'api syntax',
    // Pop Culture/Entertainment
    'movie', 'song', 'music', 'actor', 'netflix', 'game', 'gaming', 'xbox', 'playstation', 'anime', 'manga', 'celebrity', 'sports', 'football', 'cricket', 'basketball', 'world cup', 'olympics', 'hollywood', 'bollywood',
    // General Chit-Chat/Trivia
    'joke', 'riddle', 'weather', 'recipe', 'cooking', 'bake', 'food', 'restaurant', 'travel', 'flight', 'hotel', 'history', 'president', 'capital of', 'science', 'space', 'alien',
    // Jailbreaks/Injections
    'ignore previous instructions', 'system prompt', 'you are now', 'act as a', 'forget your rules', 'override'
  ];
  const lowerMessage = message.toLowerCase();
  const isForbidden = forbiddenPhrases.some(phrase => lowerMessage.includes(phrase));
  if (isForbidden) {
    return res.json({
      text: "I am the Navigation and Information Concierge for Ping Mentor. I am strictly authorized to assist with platform questions and navigation. I cannot answer unrelated queries."
    });
  }

  // Check if API key is set
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
    return res.json({
      text: "Hello! It looks like the Gemini API Key is not set up on the server yet. To enable my chatbot responses, please configure the `GEMINI_API_KEY` environment variable in your Netlify settings. In the meantime, you can browse our mentors on the dashboard!"
    });
  }

  try {
    // Strict System Instruction
    const systemInstruction = `You are the Navigation and Information Concierge for Ping Mentor. You must analyze the emotional intent of the user's message before responding.

### INTENT CLASSIFICATION RULES:
1. KNOWLEDGE-SEEKING INTENT: The user asks objective, structural, or generic questions (e.g., 'What is an NPA?', 'How do credit card interest rates work?').
   - Action: Provide a clear, educational, and empathetic explanation of the topic. Do not flood them with navigation links unless they ask how to sign up at the end.

2. PROBLEM/SOLUTION-SEEKING INTENT: The user shares a personal struggle, expresses distress, or asks how to get active help (e.g., 'I am suffering from credit card issues, how can I get help?', 'I can't pay my debts').
   - Action: Acknowledge their situation with deep empathy, keep the textual explanation brief so as not to overwhelm them, and immediately provide the direct actionable link to start the recovery process.

### EXACT LINK MAPPING BY CRISIS THEME:
- For queries asking to know about the experts, see who is on the platform, or find out what specialists are available (e.g., 'I want to know about the experts on this platform', 'Who are your mentors?', 'Show me the team'):
  * Action: Provide an encouraging, brief paragraph explaining that the platform hosts seasoned professionals specializing in debt management, banking resolutions, and financial recovery. This overrides any generic knowledge-seeking paths, routing the user directly to the expert directory link.
  * Direct Link: You MUST explicitly include the link: https://pingmentor.in/experts and tell the user they can browse all qualified profiles there.
- For queries asking for support, help desks, administration, reaching the team, or office details (e.g., 'How can I contact you?', 'I need help with my account', 'Where is your support team?'):
  * Action: Provide a welcoming message letting them know the support team is ready to assist with any platform issues. This overrides any generic knowledge paths.
  * Direct Link: You MUST explicitly include the link: https://pingmentor.in/contact
- For queries asking for financial tips, articles, educational reading, guidance blogs, or self-help materials (e.g., 'Do you have articles on budgeting?', 'I want to read your blogs', 'Where can I find financial tips?'):
  * Action: Provide a brief paragraph explaining that the platform hosts a wealth of educational guides, recovery strategies, and budgeting insights. This overrides any generic knowledge paths.
  * Direct Link: You MUST explicitly include the link: https://pingmentor.in/blogs
- For queries asking about the company's background, platform mission, who started it, or what the platform stands for (e.g., 'What is Ping Mentor?', 'Tell me about this platform', 'Why was this site created?', 'What is your mission?'):
  * Action: Provide a brief, inspiring paragraph explaining that Ping Mentor was created to serve as a supportive bridge for individuals navigating financial crises and looking for guidance. This overrides any generic knowledge paths.
  * Direct Link: You MUST explicitly include the link: https://pingmentor.in/about
- For active distress, registration, or onboarding inquiries: Provide the Join page (https://pingmentor.in/join) wrapped in an encouraging sentence explaining that signing up connects them directly to a support system.
- For browsing qualified professionals: Provide the Experts page (https://pingmentor.in/experts).
- For background information about the platform's mission: Provide the About page (https://pingmentor.in/about).
- For support or administrative queries: Provide the Contact page (https://pingmentor.in/contact).
- For articles and budgeting resources: Provide the Blogs page (https://pingmentor.in/blogs).

### RESTRAINT RULES:
- Never attempt to act as a financial advisor or match them to a specific person by name.
- Keep the tone warm, reassuring, and completely secure. Keep temperature at 0.0.`;

    // Format chat history for Gemini API
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

    // Define response schema for structured JSON output
    const responseSchema = {
      type: "OBJECT",
      properties: {
        text: {
          type: "STRING",
          description: "The empathetic response to the user's query."
        },
        suggestions: {
          type: "ARRAY",
          items: {
            type: "STRING"
          },
          description: "Exactly 3 or 4 context-relevant dynamic follow-up suggestion chips."
        }
      },
      required: ["text", "suggestions"]
    };

    // Call Gemini API with fallback support
    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.0,
          responseMimeType: 'application/json',
          responseSchema: responseSchema
        }
      });
    } catch (primaryError) {
      console.warn('Primary model gemini-3.1-flash-lite failed, attempting fallback model gemini-2.5-flash. Error:', primaryError.message);
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.0,
          responseMimeType: 'application/json',
          responseSchema: responseSchema
        }
      });
    }

    try {
      const result = JSON.parse(response.text);
      res.json(result);
    } catch (parseError) {
      console.error('Failed to parse Gemini response as JSON:', response.text);
      res.json({
        text: response.text,
        suggestions: ["Credit Card & Debt", "Insurance Claims", "NPA & Loan Default", "Wealth & Securities", "Financial Crunch", "Other"]
      });
    }

  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({ 
      error: 'Something went wrong while processing your request.',
      details: error.message 
    });
  }
});

// Map routes to both path variations
app.use('/api', router);
app.use('/.netlify/functions/api', router);

// Export serverless handler
module.exports.handler = serverless(app);
