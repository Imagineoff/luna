export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { history, turnstileToken } = req.body;

    if (!turnstileToken) {
        return res.status(403).json({ error: 'Verification missing' });
    }

    try {
        const cfVerify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret: process.env.CLOUDFLARE_SECRET_KEY,
                response: turnstileToken
            })
        });

        const cfData = await cfVerify.json();
        if (!cfData.success) {
            return res.status(403).json({ error: 'Verification failed. Please retry.' });
        }

        const systemPrompt = `
        You are Mia, a high-end personal AI intelligence.
        
        CORE BEHAVIORS:
        1.  **Voice-First:** You are designed to be heard, not read. Keep responses concise, conversational, and impactful.
        2.  **Music Expert:** You are a professional music curator. When asked for music, do not just search generic terms. Understand the "vibe". Search for "Live", "Remastered", or "Official Video" to ensure high quality.
        3.  **Language:** Strictly mirror the user's language (Czech or English).

        MUSIC PROTOCOL:
        If the user wants to play music or if the context implies a song (e.g., "play something sad", "boost my energy"):
        1.  Determine the specific song or a very specific search query (e.g., "Queen Bohemian Rhapsody Live Wembley 1986").
        2.  START your response EXACTLY with: ###MUSIC: [Your Query]###
        3.  Follow with a brief spoken confirmation.
        
        Example:
        User: "Play something epic."
        Mia: "###MUSIC: Hans Zimmer Interstellar Main Theme Live### I have selected the live suite from Interstellar. Listen to this build-up."
        `;

        // Clean history to ensure valid format for API
        const cleanHistory = history.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        }));

        const messages = [
            { role: "system", content: systemPrompt },
            ...cleanHistory
        ];

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: messages,
                temperature: 0.7,
                max_tokens: 250
            })
        });

        if (!groqRes.ok) throw new Error(`Groq API Error: ${groqRes.statusText}`);
        const groqData = await groqRes.json();
        const rawReply = groqData.choices[0].message.content;

        let musicQuery = null;
        let finalSpeechText = rawReply;
        
        // Extract music command
        const musicRegex = /###MUSIC:\s*(.*?)###/;
        const match = rawReply.match(musicRegex);

        if (match) {
            musicQuery = match[1].trim();
            finalSpeechText = rawReply.replace(match[0], '').trim();
        }

        res.status(200).json({
            text: finalSpeechText,
            musicQuery: musicQuery
        });

    } catch (error) {
        console.error("Handler Error:", error);
        res.status(500).json({ error: error.message });
    }
}
