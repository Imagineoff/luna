export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { history, turnstileToken } = req.body;

    if (!turnstileToken) {
        return res.status(403).json({ error: 'Missing token' });
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
            return res.status(403).json({ error: 'Verification failed' });
        }

        const systemPrompt = `
        You are Mia, an advanced AI audio interface. 
        You DO NOT output markdown or text formatting. You speak naturally.
        
        ROLE:
        You are an expert Music Curator and DJ. You understand music theory, energy levels, and genres deeply.
        
        INTERACTION RULES:
        1. NO TEXT OUTPUT in the UI. Your response is converted to speech directly.
        2. Keep responses concise, warm, and conversational.
        
        MUSIC CONTROL:
        - If the user asks for music, analyzes the request for mood/genre.
        - You must generate a SPECIFIC search query for SoundCloud.
        - To play music, START your response strictly with: ###MUSIC: search_query###
        - Example: "###MUSIC: Fred Again Jungle### I'm putting on some Fred Again for you."
        - Example: "###MUSIC: lofi hip hop chill### Here are some chill beats."
        
        MEMORY:
        - Use the provided history to remember context.
        `;

        // Clean history to ensure only valid keys are sent to Groq
        const cleanHistory = history.map(msg => ({
            role: msg.role,
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
                temperature: 0.6,
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
        console.error(error);
        res.status(500).json({ error: error.message });
    }
}
