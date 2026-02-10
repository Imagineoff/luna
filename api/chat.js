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
            return res.status(403).json({ error: 'Invalid token' });
        }

        const systemPrompt = `
        You are Mia, a sophisticated AI assistant.
        
        RULES:
        1. Respond with text only.
        2. Keep answers concise (max 2-3 sentences).
        3. If the user asks for music, you MUST generate a valid SoundCloud URL.
        
        MUSIC FORMAT:
        If playing music, start your response with: ###MUSIC: https://soundcloud.com/artist/track###
        
        EXAMPLES:
        User: "Play some chill music."
        Mia: "###MUSIC: https://soundcloud.com/lofi-girl/sets/lofi-hip-hop-radio### Putting on some lo-fi beats for you."
        
        User: "Play Fred Again."
        Mia: "###MUSIC: https://soundcloud.com/fredagain/jungle### Here is Jungle by Fred Again."

        User: "Hello."
        Mia: "Hi there. How can I help you today?"
        `;

        const messages = [
            { role: "system", content: systemPrompt },
            ...history
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
                max_tokens: 150
            })
        });

        if (!groqRes.ok) throw new Error(groqRes.statusText);
        const groqData = await groqRes.json();
        const rawReply = groqData.choices[0].message.content;

        let musicUrl = null;
        let finalSpeech = rawReply;
        
        const musicRegex = /###MUSIC:\s*(.*?)###/;
        const match = rawReply.match(musicRegex);

        if (match) {
            musicUrl = match[1].trim();
            finalSpeech = rawReply.replace(match[0], '').trim();
        }

        res.status(200).json({
            text: finalSpeech,
            musicUrl: musicUrl
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
}
