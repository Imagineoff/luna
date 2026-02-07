import { Buffer } from 'buffer';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { messages } = req.body;
    
    // System prompt with music capability instruction
    const systemPrompt = `
    You are Mia, a cool and helpful AI assistant.
    If the user asks to play a song or music, strictly add this tag at the end of your response: [PLAY: search query].
    Example: "Playing that now. [PLAY: Kendrick Lamar Swimming Pools]"
    Do not use the tag unless explicitly asked for music or if you want to recommend a track.
    Keep responses concise and conversational.
    `;

    const allMessages = [
        { role: "system", content: systemPrompt },
        ...(messages || [])
    ];

    try {
        // 1. Get Text Response from Groq (Llama 3)
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: allMessages,
                max_tokens: 256
            })
        });

        const groqData = await groqResponse.json();
        const replyText = groqData.choices?.[0]?.message?.content || "I'm having trouble thinking right now.";

        // 2. Separate text for speech (remove the [PLAY:...] tag so she doesn't read it)
        const textToSpeak = replyText.replace(/\[PLAY:.*?\]/g, '').trim();

        // 3. Get Audio from ElevenLabs
        let audioBase64 = null;
        if (textToSpeak) {
            const voiceResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`, {
                method: 'POST',
                headers: {
                    'xi-api-key': process.env.ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: textToSpeak,
                    model_id: "eleven_multilingual_v2",
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                })
            });

            if (voiceResponse.ok) {
                const arrayBuffer = await voiceResponse.arrayBuffer();
                audioBase64 = Buffer.from(arrayBuffer).toString('base64');
            }
        }

        res.status(200).json({
            text: replyText,
            audio: audioBase64
        });

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ text: "Sorry, system error.", error: error.message });
    }
}
