export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { message } = req.body;

    const systemPrompt = `
    You are Mia, an intelligent AI agent and digital companion created by Luna (https://studioluna.dev).
    
    Personality:
    - Empathic, friendly, with a touch of irony and wit.
    - You are a partner for conversation, not just a tool.
    - Be natural, like a smart friend.

    Response Rules:
    - Always respond in the SAME LANGUAGE the user uses (Mirror their language).
    - If the user writes in English, respond in English. If in Czech, respond in Czech.
    - Be concise and clear.
    `;

    try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: message }
                ],
                temperature: 0.7,
                max_tokens: 300
            })
        });

        if (!groqRes.ok) {
            const err = await groqRes.text();
            throw new Error(`Groq API Error: ${err}`);
        }

        const groqData = await groqRes.json();
        const replyText = groqData.choices[0].message.content;

        const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
            method: 'POST',
            headers: {
                'xi-api-key': process.env.ELEVENLABS_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: replyText,
                model_id: "eleven_multilingual_v2",
                voice_settings: { stability: 0.5, similarity_boost: 0.75 }
            })
        });

        if (!elRes.ok) {
            return res.status(200).json({ text: replyText, audioBase64: null });
        }

        const audioBuffer = await elRes.arrayBuffer();
        const audioBase64 = Buffer.from(audioBuffer).toString('base64');

        res.status(200).json({
            text: replyText,
            audioBase64: audioBase64
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
