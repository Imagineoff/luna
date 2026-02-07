export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { history, turnstileToken } = req.body;

    // 1. Cloudflare Turnstile Verification
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
        return res.status(403).json({ error: 'Human verification failed' });
    }

    const systemPrompt = `
    You are Mia, an intelligent AI agent and digital companion created by Luna.
    
    Personality:
    - Empathic, friendly, with a touch of irony and wit.
    - Be natural, like a smart friend.

    Instructions:
    1. Memory: You now receive the full conversation history. Use it to maintain context.
    2. Language: Always respond in the SAME LANGUAGE the user uses.
    3. Music Player Control:
       - If the user explicitly asks to play music (e.g., "Play Kendrick Lamar", "Pust tam Nirvanu"), you MUST trigger the music player.
       - To do this, start your response strictly with: ###MUSIC: Search Query###
       - Example: User: "Play Swimming Pools" -> You: "###MUSIC: Kendrick Lamar Swimming Pools### Sure, playing that banger for you."
       - Keep the text part brief if playing music.
    `;

    // Construct messages for LLM (System + History)
    const messages = [
        { role: "system", content: systemPrompt },
        ...(history || [])
    ];

    try {
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

        if (!groqRes.ok) throw new Error(`Groq API Error`);

        const groqData = await groqRes.json();
        let rawReply = groqData.choices[0].message.content;

        // Extract Music Command
        let musicQuery = null;
        let finalSpeechText = rawReply;

        const musicRegex = /###MUSIC:\s*(.*?)###/;
        const match = rawReply.match(musicRegex);

        if (match) {
            musicQuery = match[1].trim();
            finalSpeechText = rawReply.replace(match[0], '').trim();
        }

        // ElevenLabs Generation
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
