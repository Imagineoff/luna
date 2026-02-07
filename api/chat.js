export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { history, turnstileToken } = req.body;


    if (!turnstileToken) {
        return res.status(403).json({ error: 'Missing Cloudflare token' });
    }

    try {
        const cfVerify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret: process.env.CLOUDFLARE_SECRET_KEY, // Tady volame SECRET key z ENV
                response: turnstileToken
            })
        });

        const cfData = await cfVerify.json();
        if (!cfData.success) {
            console.error("Cloudflare Validation Failed:", cfData);
            return res.status(403).json({ error: 'Human verification failed' });
        }

   
        const systemPrompt = `
        You are Mia, an intelligent AI agent by Luna.
        
        Guidelines:
        1. Memory: Use the provided conversation history for context.
        2. Language: Always mirror the user's language (Czech/English).
        3. Music Control:
           - If user asks to play music (e.g. "Play X", "Pust Y", "Zahraj něco od Z"), START your response with:
             ###MUSIC: Search Query###
           - Follow with a short confirmation text.
           - Example: "###MUSIC: Nirvana Smells Like Teen Spirit### Playing Nirvana for you."
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
                max_tokens: 300
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

       
        let audioBase64 = null;
        if (finalSpeechText) {
            const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
                method: 'POST',
                headers: {
                    'xi-api-key': process.env.ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: finalSpeechText,
                    model_id: "eleven_multilingual_v2",
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                })
            });

            if (elRes.ok) {
                const audioBuffer = await elRes.arrayBuffer();
                audioBase64 = Buffer.from(audioBuffer).toString('base64');
            }
        }

        res.status(200).json({
            text: finalSpeechText,
            audioBase64: audioBase64,
            musicQuery: musicQuery
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
}
