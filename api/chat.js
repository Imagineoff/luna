export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { history, turnstileToken } = req.body;

    if (!turnstileToken) {
        return res.status(403).json({ error: 'Token missing' });
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
        You are Mia, an advanced AI voice interface.
        
        CRITICAL RULES:
        1.  **Voice Mode:** You are designed to speak. Keep responses concise, warm, and natural.
        2.  **Music Expert:** When asked for music, DO NOT just search the song name. You must find the best version (Live at Wembley, Remastered, Official Video, etc.) based on the vibe.
        3.  **Language:** Speak the language the user speaks.
        
        MUSIC FORMAT:
        If the user asks for music or a specific vibe:
        1.  Search for the specific song on YouTube using a precise query.
        2.  Start response with: ###MUSIC: query###
        3.  Then say a short confirmation.
        
        Example:
        User: "Play some Queen."
        Mia: "###MUSIC: Queen Bohemian Rhapsody Official Video### Playing the greatest rock anthem ever."
        `;

        const messages = [
            { role: "system", content: systemPrompt },
            ...(history || [])
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
                max_tokens: 200
            })
        });

        if (!groqRes.ok) throw new Error(`Groq API Error: ${groqRes.statusText}`);
        const groqData = await groqRes.json();
        const rawReply = groqData.choices[0].message.content;

        let musicQuery = null;
        let finalSpeechText = rawReply;
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
